#!/usr/bin/env python3
"""code-map - read a file by its structure, not by its lines (S1 of the reading plan, 2026-10-14).

An agent handed `Elements: ToolSchema.ReadAsMap` still read the whole file, for want of a command that
takes a name: the contracts named members, the reads took files. This script is that command, around
ast-grep (C#, TypeScript and markdown from one tool, installed by the image), one file at a time and
no index:

  code-map.py outline <file>              the map: types and members (C#, TypeScript), two levels of
                                          sections (markdown), the sections and `diff/<file>` entries
                                          of an audit capture - each with its lines and its tokens
                                          (bytes of the node / 4)
  code-map.py show <file> <address>...    the node each address names, with its bounds `path:start-end`
  code-map.py find <pattern> <path>... [--lang <lang>]
                                          `ast-grep run -p`, each match in its scope:
                                          `path:line  in Type/Member (start-end)`
  code-map.py commands [--max N] <file>   the ready-to-copy `show` commands of the map (the refusal of
                                          the bound guards, lib/bounds-common.sh)
  code-map.py memo <state file>           the memo of guard-show-memo (lib/): reads HOOK_CMD and HOOK_CWD

Addresses are hierarchical: `ParameterSchema/ReadAsMap`, `"TDD sequence/Step 2"`, `"diff/src/A.cs"`.
Each segment matches exactly, then as a prefix (at a word boundary first: `Step 1` is not `Step 10`),
then as a substring; backticks, asterisks and case are ignored. More than five
nodes match: their list, no content. A C# member is shown with the `///` lines above it, a TypeScript
one with its `/** */` block: ast-grep's range starts at the declaration (attributes included).

The limits, said on the output when they apply: two outline levels at most (a nested C# type is folded
into its outer type, `Outer/Deep`); an underlined (setext) markdown heading opens no section, its text
stays in the enclosing one; inline markdown is not parsed (a heading's backticks are kept). A markdown
address deeper than the outline is resolved by the heading path (ast-grep scan on `section`).

The audit capture of dev-verify (`# Audit capture — batch F<n>`, `=== <title> ===` sections, the
`diff --git a/<f> b/<f>` blocks of the batch diff) is no language for ast-grep: it is split here, and
needs no ast-grep.

Exit: 0 shown (or the list of matches), 1 no match or a file it cannot map, 2 usage, 3 ast-grep missing
or failing (`HARNESS_AST_GREP_BIN` names another binary; `/usr/bin/sg` is not ast-grep).
"""
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SELF = os.path.abspath(__file__)
RULES = os.path.join(HERE, "code-map-outline.yml")
CAPTURE_HEAD = "# Audit capture — batch"
LIST_MAX = 5
FORCE_RE = re.compile(r"(^|[\s;&|(])HARNESS_FORCE_READ=1\s")
LANGS = {".cs": "csharp", ".ts": "typescript", ".mts": "typescript", ".cts": "typescript",
         ".tsx": "tsx", ".md": "markdown", ".markdown": "markdown"}
SECTION_SCAN = """id: code-map-section
language: Markdown
rule:
  any:
    - kind: section
    - kind: setext_heading
"""


class Stop(Exception):
    def __init__(self, code, message):
        Exception.__init__(self, message)
        self.code, self.message = code, message


def tokens(n_bytes):
    return (n_bytes + 3) // 4


class Node:
    def __init__(self, name, kind, start, end, n_bytes, parent=None):
        self.name, self.kind, self.start, self.end, self.bytes = name, kind, start, end, n_bytes
        self.parent, self.children = parent, []
        self.title = False          # the lone `#` of a markdown file: matched, never printed

    def path(self):
        names, node = [], self
        while node is not None:
            names.append(node.name)
            node = node.parent
        return list(reversed(names))

    def address(self):
        names, node = [], self
        while node is not None:
            if not node.title or node is self:
                names.append(node.name)
            node = node.parent
        return "/".join(reversed(names))


class Source:
    def __init__(self, path):
        self.path = path
        try:
            with open(path, "rb") as fh:
                self.data = fh.read()
        except OSError as exc:
            raise Stop(1, "code-map: cannot read %s (%s)" % (path, exc.strerror))
        self.lines = self.data.split(b"\n")
        if self.lines and self.lines[-1] == b"":
            self.lines.pop()
        first = self.lines[0].decode("utf-8", "replace") if self.lines else ""
        if first.startswith(CAPTURE_HEAD):
            self.lang = "capture"
        else:
            self.lang = LANGS.get(os.path.splitext(path)[1].lower())
        if self.lang is None:
            raise Stop(1, "code-map: %s is not mapped (C#, TypeScript, markdown, an audit capture): "
                          "grep -n, then sed -n 'A,Bp'" % path)

    def span_bytes(self, start, end):
        return sum(len(line) + 1 for line in self.lines[start - 1:end])

    def text(self, start, end):
        return b"\n".join(self.lines[start - 1:end]).decode("utf-8", "replace")


# ---------------------------------------------------------------------------------------------- ast-grep

_RUNS = {}


def ast_grep(args, stdin=None):
    """ast-grep's JSON for these arguments, run once per process (several addresses, one parse)."""
    key = (tuple(args), stdin)
    if key not in _RUNS:
        _RUNS[key] = _ast_grep(args, stdin)
    return _RUNS[key]


def _ast_grep(args, stdin):
    binary = os.environ.get("HARNESS_AST_GREP_BIN") or "ast-grep"
    exe = shutil.which(binary)
    if not exe:
        raise Stop(3, "code-map: ast-grep is not on the PATH (the image installs it, AST_GREP_VERSION of "
                      "the Dockerfile; /usr/bin/sg is not ast-grep): read a range with grep -n, then sed -n 'A,Bp'")
    try:
        proc = subprocess.run([exe] + args, input=stdin, capture_output=True, timeout=60)
        if proc.returncode != 0:
            raise ValueError(proc.stderr.decode("utf-8", "replace").strip().splitlines()[:1])
        return json.loads(proc.stdout.decode("utf-8") or "[]")
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        raise Stop(3, "code-map: ast-grep failed (%s): read a range with grep -n, then sed -n 'A,Bp'"
                   % (str(exc).strip() or "no output")[:200])


def line_span(rng):
    start = rng["start"]["line"] + 1
    end = rng["end"]["line"] + 1
    if rng["end"]["column"] == 0 and end > start:
        end -= 1
    return start, end


def nodes_from_outline(result, src):
    roots = []
    for entry in result:
        for item in entry.get("items", []):
            if item.get("isImport"):
                continue
            start, end = line_span(item["range"])
            off = item["range"]["byteOffset"]
            node = Node(item.get("name") or "?", item.get("symbolType", "item"), start, end, off["end"] - off["start"])
            for member in item.get("members", []) or []:
                m_start, m_end = line_span(member["range"])
                m_off = member["range"]["byteOffset"]
                node.children.append(Node(member.get("name") or "?", member.get("symbolType", "member"),
                                          m_start, m_end, m_off["end"] - m_off["start"], node))
            roots.append(node)
    return roots


def code_outline(src):
    return nodes_from_outline(ast_grep(["outline", "--stdin", "-l", src.lang, "--json=compact"], src.data), src)


def heading_name(line):
    line = line.strip()
    line = re.sub(r"^#{1,6}\s*", "", line)
    return re.sub(r"\s+#+\s*$", "", line).strip()


def md_sections(src):
    """Every section at any depth (ast-grep scan on `section`), nested by range; the setext headings."""
    found = ast_grep(["scan", "--inline-rules", SECTION_SCAN, "--stdin", "--json=compact"], src.data)
    sections, setext = [], []
    for hit in found:
        start, end = line_span(hit["range"])
        first = hit.get("text", "").split("\n", 1)[0]
        if not first.lstrip().startswith("#"):
            setext.append(start)
            continue
        off = hit["range"]["byteOffset"]
        level = len(first.lstrip()) - len(first.lstrip().lstrip("#"))
        end = trim_blank(src, start, end)
        node = Node(heading_name(first), "#" * level, start, end, src.span_bytes(start, end))
        node.offsets = (off["start"], off["end"])
        sections.append(node)
    sections.sort(key=lambda n: (n.offsets[0], -n.offsets[1]))
    roots, stack = [], []
    for node in sections:
        while stack and not (stack[-1].offsets[0] <= node.offsets[0] and node.offsets[1] <= stack[-1].offsets[1]):
            stack.pop()
        if stack:
            node.parent = stack[-1]
            stack[-1].children.append(node)
        else:
            roots.append(node)
        stack.append(node)
    h1 = [n for n in roots if n.kind == "#"]
    if len(h1) == 1:
        h1[0].title = True
    return roots, sorted(setext)


def md_outline(src):
    """The two levels of code-map-outline.yml; the scan's top sections when the rules find none."""
    roots = []
    if os.path.isfile(RULES):
        result = ast_grep(["outline", "--stdin", "-l", "markdown", "--outline-rules", RULES,
                           "--no-default-outline-rules", "--json=compact"], src.data)
        roots = nodes_from_outline(result, src)
    sections, setext = md_sections(src)
    if not roots:
        roots = sections
        for child in [c for node in roots for c in node.children]:
            child.children = []
    for node in walk(roots):
        node.kind = "#" * heading_level(src, node.start)
        node.end = trim_blank(src, node.start, node.end)
        node.bytes = src.span_bytes(node.start, node.end)
    return roots, setext


def heading_level(src, line_no):
    text = src.lines[line_no - 1].decode("utf-8", "replace").lstrip()
    return max(1, len(text) - len(text.lstrip("#")))


def capture_nodes(src):
    """The capture split by its `=== <title> ===` lines, the batch diff by its `diff --git` lines."""
    roots, current, diff = [], None, None
    total = len(src.lines)
    for i, raw in enumerate(src.lines, 1):
        line = raw.decode("utf-8", "replace")
        m = re.match(r"^=== (.*) ===$", line)
        if m:
            current = Node(m.group(1), "section", i, total, 0)
            if roots:
                roots[-1].end = i - 1
            roots.append(current)
            diff = None
            continue
        if not roots:
            roots.append(Node("head", "section", 1, total, 0))
            current = roots[0]
        if current.name.startswith("batch diff"):
            m = re.match(r"^diff --git a/(\S+) b/(\S+)", line)
            if m:
                if diff is not None:
                    diff.end = i - 1
                diff = Node(m.group(2), "diff", i, current.end, 0, current)
                current.children.append(diff)
    for node in roots:
        if node.children:
            node.children[-1].end = node.end
            for child in node.children:
                child.end = min(child.end, node.end)
    for node in roots:
        node.end = trim_blank(src, node.start, node.end)
        node.bytes = src.span_bytes(node.start, node.end)
        for child in node.children:
            child.end = trim_blank(src, child.start, child.end)
            child.bytes = src.span_bytes(child.start, child.end)
    return roots


def trim_blank(src, start, end):
    while end > start and not src.lines[end - 1].strip():
        end -= 1
    return end


def capture_address(node):
    return "diff/" + node.name if node.kind == "diff" else node.name


# ---------------------------------------------------------------------------------------------- matching

def norm(text):
    return " ".join(text.replace("`", "").replace("*", "").split())


def tier(name, segment):
    """0 exact, 1 prefix at a word boundary, 2 prefix, 3 substring, None no match."""
    n, s = norm(name), norm(segment)
    if not s:
        return None
    if n == s:
        return 0
    nl, sl = n.casefold(), s.casefold()
    if nl == sl:
        return 0
    if nl.startswith(sl):
        rest = nl[len(sl):]
        return 1 if not (rest[0].isalnum() or rest[0] == "_") else 2
    if sl in nl:
        return 3
    return None


def path_tier(path, wanted):
    if path == wanted:
        return 0
    if path.endswith("/" + wanted):
        return 1
    if path.endswith(wanted):
        return 2
    if wanted in path:
        return 3
    return None


def walk(roots):
    for node in roots:
        yield node
        for child in walk(node.children):
            yield child


def best(scored):
    scored = [(score, node) for score, node in scored if score is not None]
    if not scored:
        return []
    top = min(score for score, _ in scored)
    return [node for score, node in scored if score == top]


def ancestors_score(node, segments):
    """Each segment matched by an ancestor, in order (any depth between): the sum of tiers, or None."""
    chain = node.path()[:-1]
    total, i = 0, 0
    for segment in segments:
        while i < len(chain) and tier(chain[i], segment) is None:
            i += 1
        if i == len(chain):
            return None
        total += tier(chain[i], segment)
        i += 1
    return total


def resolve(src, address):
    """The nodes an address names, and the notes the limits call for."""
    notes = []
    if src.lang == "capture":
        roots = capture_nodes(src)
        if address.startswith("diff/"):
            wanted = address[len("diff/"):]
            hits = best([(path_tier(n.name, wanted), n) for n in walk(roots) if n.kind == "diff"])
        else:
            hits = best([(tier(n.name, address), n) for n in roots])
        return hits, notes
    if src.lang == "markdown":
        roots, setext = md_sections(src)
        candidates = [address.split("/")]
        if "/" in address:
            candidates.append([address])
        hits = []
        for segments in candidates:
            hits = best([(None if tier(n.name, segments[-1]) is None or ancestors_score(n, segments[:-1]) is None
                          else (tier(n.name, segments[-1]), ancestors_score(n, segments[:-1])), n)
                         for n in walk(roots)])
            if hits:
                if len(segments) > 2:
                    notes.append("note: an address of %d levels, deeper than the two the outline lists: "
                                 "resolved by the heading path" % len(segments))
                break
        # Said where it bears: an underlined heading inside what is shown, or none matched (it may be one).
        inside = [n for n in setext if any(h.start <= n <= h.end for h in hits)] if hits else setext
        if inside:
            notes.append(setext_note(inside))
        return hits, notes
    roots = code_outline(src)
    segments = [s for s in address.split("/") if s]
    if not segments:
        return [], notes
    if len(segments) > 2:
        notes.append("note: the outline knows two levels (Type/Member; a nested type is folded into its "
                     "outer type): %s read as %s/%s" % (address, segments[0], segments[-1]))
    if len(segments) == 1:
        hits = best([(tier(n.name, segments[0]), n) for n in walk(roots)])
    else:
        hits = best([(None if tier(n.name, segments[-1]) is None or tier(n.parent.name, segments[0]) is None
                      else (tier(n.name, segments[-1]), tier(n.parent.name, segments[0])), n)
                     for n in walk(roots) if n.parent is not None])
    return hits, notes


def setext_note(lines):
    shown = ", ".join(str(n) for n in lines[:5]) + (", ..." if len(lines) > 5 else "")
    return ("note: underlined (setext) heading(s) at line(s) %s: they open no section - their text stays "
            "in the enclosing one" % shown)


def doc_start(src, node):
    """The first line of the comment block right above a declaration: `///` (C#), `/** */` (TypeScript)."""
    start = node.start
    if src.lang == "csharp":
        while start > 1 and src.lines[start - 2].strip().startswith(b"///"):
            start -= 1
    elif src.lang in ("typescript", "tsx") and start > 1 and src.lines[start - 2].rstrip().endswith(b"*/"):
        i = start - 1
        while i >= 1 and b"/*" not in src.lines[i - 1]:
            i -= 1
        if i >= 1 and src.lines[i - 1].lstrip().startswith(b"/**"):
            start = i
    return start


# ---------------------------------------------------------------------------------------------- commands

def address_of(src, node):
    return capture_address(node) if src.lang == "capture" else node.address()


def kind_label(src, node):
    if src.lang == "capture":
        return "diff" if node.kind == "diff" else "section"
    return node.kind


def label(src, node, full=False):
    """One node on a map line: `class ToolSchema`, `### Step 2`, `=== build ===`, `diff/src/A.cs`."""
    if src.lang == "capture":
        return capture_address(node) if node.kind == "diff" else "=== %s ===" % node.name
    return "%s %s" % (node.kind, node.address() if full else node.name)


def map_line(src, node, indent, full=False):
    return "%s%-9s ~%-5d %s" % (indent, "%d-%d" % (node.start, node.end), tokens(node.bytes), label(src, node, full))


def map_nodes(src):
    if src.lang == "capture":
        return capture_nodes(src), []
    if src.lang == "markdown":
        return md_outline(src)
    return code_outline(src), []


def cmd_outline(path):
    src = Source(path)
    roots, setext = map_nodes(src)
    kind = {"capture": "audit capture", "markdown": "markdown", "csharp": "C#"}.get(src.lang, "TypeScript")
    out = ["%s: %s, %d lines, ~%d tokens - show <file> <address>" % (path, kind, len(src.lines), tokens(len(src.data)))]
    for node in roots:
        out.append(map_line(src, node, "  "))
        out.extend(map_line(src, child, "    ") for child in node.children)
    if not roots:
        out.append("  (no node: nothing to address - grep -n, then sed -n 'A,Bp')")
    if setext:
        out.append(setext_note(setext))
    print("\n".join(out))
    return 0


def cmd_show(path, addresses):
    src = Source(path)
    blocks, missed = [], []
    for address in addresses:
        hits, notes = resolve(src, address)
        if not hits:
            missed.append(address)
            blocks.append("code-map: nothing in %s matches \"%s\"" % (path, address) + "".join("\n" + n for n in notes))
            continue
        if len(hits) > LIST_MAX:
            lines = ["code-map: %d nodes of %s match \"%s\" - name one (no content shown):" % (len(hits), path, address)]
            lines += [map_line(src, node, "  ", full=True) for node in hits] + notes
            blocks.append("\n".join(lines))
            continue
        for node in hits:
            start = doc_start(src, node)
            blocks.append("%s:%d-%d  %s  (%s, ~%d tokens)\n%s" % (
                path, start, node.end, address_of(src, node), kind_label(src, node),
                tokens(src.span_bytes(start, node.end)), src.text(start, node.end)))
        if notes:
            blocks[-1] += "".join("\n" + n for n in notes)
    print("\n\n".join(blocks))
    if missed:
        print("\nIts map:")
        sys.stdout.flush()
        cmd_outline(path)
        return 1
    return 0


def cmd_commands(path, limit):
    src = Source(path)
    roots, _ = map_nodes(src)
    entries = []
    for node in roots:
        entries.append(node)
        entries.extend(node.children)
    if not entries:
        raise Stop(1, "code-map: no node in %s" % path)
    head = "python3 %s show %s " % (shlex.quote(SELF), shlex.quote(path))
    seen, lines = set(), []
    for node in entries:
        addr = address_of(src, node)
        if addr in seen:
            continue
        seen.add(addr)
        lines.append("%s%s   # ~%d tokens, lines %d-%d" % (head, shlex.quote(addr), tokens(node.bytes), node.start, node.end))
    shown = lines[:max(1, limit - 1)] if len(lines) > limit else lines
    print("\n".join(shown))
    rest = len(lines) - len(shown)
    print("%sThe whole map: python3 %s outline %s" % ("[%d more] " % rest if rest else "", shlex.quote(SELF), shlex.quote(path)))
    return 0


def cmd_find(pattern, paths, lang):
    args = ["run", "-p", pattern, "--json=compact"] + (["-l", lang] if lang else []) + paths
    matches = ast_grep(args)
    if not matches:
        print("code-map: no match for %s" % pattern)
        return 1
    outlines, out = {}, []
    for m in matches[:50]:
        f = m.get("file", "?")
        line = m["range"]["start"]["line"] + 1
        if f not in outlines:
            try:
                src = Source(f)
                outlines[f] = list(walk(map_nodes(src)[0])) if src.lang != "markdown" else list(walk(md_sections(src)[0]))
            except Stop:
                outlines[f] = []
        scope = [n for n in outlines[f] if n.start <= line <= n.end]
        scope.sort(key=lambda n: n.end - n.start)
        where = "in %s (%d-%d)" % (scope[0].address(), scope[0].start, scope[0].end) if scope else "at top level"
        out.append("%s:%d  %s  %s" % (f, line, where, (m.get("lines") or "").strip().splitlines()[0][:100] if m.get("lines") else ""))
    print("\n".join(s.rstrip() for s in out))
    if len(matches) > 50:
        print("[%d more matches: narrow the pattern or the path]" % (len(matches) - 50))
    return 0


# ---------------------------------------------------------------------------------------------- memo

def shows_in(command, cwd):
    """(file, address, absolute path) of every `code-map.py show <file> <address>` of a command line."""
    found = []
    for line in command.split("\n"):
        try:
            lexer = shlex.shlex(line, posix=True, punctuation_chars=True)
            lexer.whitespace_split = True
            words = list(lexer)
        except ValueError:
            continue
        here, simple = cwd, []
        for word in words + [";"]:
            if word and set(word) <= set(";&|()"):
                if len(simple) >= 2 and simple[0] == "cd" and os.path.isdir(os.path.join(here, simple[1])):
                    here = os.path.join(here, simple[1])
                for i, w in enumerate(simple):
                    if os.path.basename(w) == "code-map.py" and simple[i + 1:i + 2] == ["show"] and len(simple) >= i + 4:
                        f, real = simple[i + 2], os.path.realpath(os.path.join(here, simple[i + 2]))
                        rest = simple[i + 3:]
                        for j, addr in enumerate(rest):
                            # A redirect ends the addresses: `2>&1`, `> out` (the shell's, not a heading).
                            if set(addr) <= set("<>&") or (addr.isdigit() and rest[j + 1:j + 2] and set(rest[j + 1]) <= set("<>&")):
                                break
                            found.append((f, addr, real))
                        break
                simple = []
            else:
                simple.append(word)
    return found


def cmd_memo(state):
    command, cwd = os.environ.get("HOOK_CMD", ""), os.environ.get("HOOK_CWD") or os.getcwd()
    shows = [s for s in shows_in(command, cwd) if os.path.isfile(s[2])]
    if not shows:
        return 0
    forced = bool(FORCE_RE.search(" " + command))
    records = []
    try:
        with open(state, encoding="utf-8") as fh:
            records = [line.rstrip("\n").split("\t") for line in fh if line.count("\t") == 5]
    except OSError:
        pass
    who = "this agent" if os.environ.get("HOOK_AGENT_ID") else "this conversation"
    repeated, fresh = [], []
    for f, addr, real in shows:
        st = os.stat(real)
        stamp = [str(st.st_mtime_ns), str(st.st_size)]
        last = None
        for rec in records:
            if rec[2] == real and rec[3] == addr.strip():
                last = rec
        if last is not None and last[4:] == stamp and not forced:
            repeated.append("%s \"%s\" already shown at %s (call #%s of %s)" % (f, addr, last[1], last[0], who))
        else:
            fresh.append((real, addr.strip(), stamp))
    if repeated:
        print("guard-show-memo: %s: it is in your context - use it, never a second copy. A file changed since is "
              "shown again by itself; to show it again on purpose (its output left your context): %s in front of "
              "the command.%s" % ("; ".join(repeated), "HARNESS_FORCE_READ=1",
                                  " Run the other show(s) of the line without it." if fresh else ""))
        return 0
    try:
        with open(state, "a", encoding="utf-8") as fh:
            n = len(records)
            for real, addr, stamp in fresh:
                n += 1
                fh.write("\t".join([str(n), time.strftime("%H:%M:%S"), real, addr] + stamp) + "\n")
    except OSError:
        pass
    return 0


# ---------------------------------------------------------------------------------------------- main

USAGE = ("usage: code-map.py outline <file> | show <file> <address>... | find <pattern> <path>... [--lang <lang>]"
         " | commands [--max N] <file>")


def main(argv):
    if not argv:
        print(USAGE, file=sys.stderr)
        return 2
    verb, args = argv[0], argv[1:]
    try:
        if verb == "outline" and len(args) == 1:
            return cmd_outline(args[0])
        if verb == "show" and len(args) >= 2:
            return cmd_show(args[0], args[1:])
        if verb == "commands":
            limit = 40
            if len(args) == 3 and args[0] == "--max" and args[1].isdigit():
                limit, args = max(2, int(args[1])), args[2:]
            if len(args) == 1:
                return cmd_commands(args[0], limit)
        if verb == "find" and len(args) >= 1:
            lang, rest = None, []
            i = 1
            while i < len(args):
                if args[i] in ("-l", "--lang") and i + 1 < len(args):
                    lang = args[i + 1]
                    i += 2
                    continue
                rest.append(args[i])
                i += 1
            return cmd_find(args[0], rest or ["."], lang)
        if verb == "memo" and len(args) == 1:
            return cmd_memo(args[0])
    except Stop as stop:
        print(stop.message, file=sys.stderr)
        return stop.code
    except (KeyError, TypeError, AttributeError, IndexError) as exc:
        # ast-grep answered JSON of another shape (another version, a stub): said, never a traceback.
        print("code-map: ast-grep output not understood (%s): read a range with grep -n, then sed -n 'A,Bp'"
              % type(exc).__name__, file=sys.stderr)
        return 3
    print(USAGE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
