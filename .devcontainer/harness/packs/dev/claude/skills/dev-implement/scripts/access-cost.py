#!/usr/bin/env python3
"""Access cost of a behaviour - the COST step of the TDD cycle, measured.

No test observes the number of calls a behaviour makes through its ports: a use case doing one
query and one doing 2N+2 are equally green. The toolkit this script is adapted from (see
THIRD-PARTY.md) had measured that the cost stated from memory was wrong often enough for the
orchestrator to re-open the code after every GREEN - 34 reads under src/ after 36 GREEN reports in
12 sessions, 117 kB carried to the end of each batch - and replaced the statement by this listing.

It lists what the code actually awaits, from the syntax tree (ast-grep, the rules beside this
script under access-cost/rules/): every `await <receiver>.<Method>(...)`, whether it sits in a loop
or a lambda over the input, and every LINQ filter applied in memory to an awaited result. A
receiver is a port when its name says so: a naming heuristic (repository, service, provider,
store, client, channel, unit of work...) plus the regex the repository pack adds in its repo.yaml
(`tools.access_cost.receivers`, read from .claude/harness/packs/repo-*/references/repo.yaml at the
top of the checkout). Anything else is listed "to classify" and left to the reader: a validator
runner or a stream is not a port, a badly named gateway is.

Usage:
    access-cost.py <file.cs> [...]            the production files of one behaviour
    access-cost.py --diff [<root> ...]        every .cs changed under the roots (default src/),
                                              added lines flagged; the audit capture runs it
    --receivers <regex>                       what counts as a port, replacing the pack's regex

Exit 0: no port call inside a loop or a lambda, no in-memory filter on an awaited result.
Exit 2: at least one (on an added line, with --diff); or a usage error. Exit 3: ast-grep missing.
The last stdout line is the `Cost` line the implementer copies into its report; it counts every
port call of the files scanned, pre-existing ones included with --diff (they are marked above it).
"""
import glob
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(HERE, "access-cost", "sgconfig.yml")

PORT = re.compile(
    r"repositor|service|wrapper|client|provider|unitofwork|dbcontext|dbset|gateway|store|"
    r"publisher|bus|mediator|cache|queue|adapter|channel|hub|sandbox|filesystem|"
    r"^(this\.)?_?(db|context|fs)$",
    re.I,
)
WRITE = re.compile(
    r"^(Save|Add|Insert|Update|Delete|Remove|Persist|Publish|Send|Commit|Create|Put|Post|Write|"
    r"Upsert|Store|Execute|Transfer|Append|Set|Enqueue|Dispatch|Ingest)"
)
RECEIVER = re.compile(r"^await\s+\(?\s*([\w.]+?)(?:\s*\.\w+\s*(?:<[^>]*>)?\s*\(|\s*\.\s*$)")
METHOD = re.compile(r"\.(\w+)\s*(?:<[^>]*>)?\s*\(")
LIST_MAX = 12


def top():
    """The top of the git work tree, else the working directory."""
    try:
        out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except OSError:
        pass
    return os.getcwd()


ROOT = top()


def pack_settings():
    """`tools.access_cost` of the repository pack, when one is deployed and PyYAML can read it."""
    files = sorted(glob.glob(os.path.join(ROOT, ".claude", "harness", "packs", "repo-*", "references", "repo.yaml")))
    if not files:
        return {}
    try:
        import yaml  # PyYAML: in the image; without it the heuristic alone applies
    except ImportError:
        return {}
    try:
        data = yaml.safe_load(open(files[0], encoding="utf-8")) or {}
    except Exception:  # noqa: BLE001 - a broken pack is the session doctor's finding, not this script's
        return {}
    tools = data.get("tools") if isinstance(data, dict) else None
    cost = tools.get("access_cost") if isinstance(tools, dict) else None
    return cost if isinstance(cost, dict) else {}


def outer_methods(text):
    depth, out = 0, []
    for m in re.finditer(r"[()]|\.(\w+)\s*(?:<[^>]*>)?\s*(?=\()", text):
        if m.group(0) == "(":
            depth += 1
        elif m.group(0) == ")":
            depth -= 1
        elif depth == 0:
            out.append(m.group(1))
    return out


def call_label(text):
    receiver = RECEIVER.match(text)
    methods = outer_methods(text) or METHOD.findall(text)
    return (receiver.group(1) if receiver else text.split("(")[0]), (methods[-1] if methods else "?")


def plural(n, word):
    return "%d %s%s" % (n, word, "" if n == 1 else "s")


def ast_grep():
    # `ast-grep` only: on Debian `/usr/bin/sg` is the setgid tool of the shadow suite, not ast-grep.
    return shutil.which("ast-grep")


def added_lines(path):
    out = subprocess.run(["git", "diff", "-U0", "HEAD", "--", path], capture_output=True, text=True, cwd=ROOT).stdout
    lines = set()
    for m in re.finditer(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", out, re.M):
        start, count = int(m.group(1)), int(m.group(2) or 1)
        lines.update(range(start, start + count))
    return lines


def scan(binary, files):
    proc = subprocess.run(
        [binary, "scan", "-c", CONFIG, "--json=compact", *files],
        capture_output=True, text=True, cwd=ROOT,
    )
    if not proc.stdout.strip().startswith("["):
        sys.stderr.write(proc.stderr[:600])
        return None
    return json.loads(proc.stdout)


def rel(path):
    """A path as ast-grep and git see it: relative to ROOT, from an absolute path or one given
    from the working directory."""
    absolute = path if os.path.isabs(path) else os.path.abspath(path)
    return os.path.relpath(absolute, ROOT)


def from_root(path):
    """A path ast-grep printed (relative to ROOT, its working directory, or absolute), relative to ROOT."""
    absolute = path if os.path.isabs(path) else os.path.join(ROOT, path)
    return os.path.relpath(absolute, ROOT)


def analyse(matches, path, added, port):
    by_rule = {}
    for m in matches:
        if from_root(m["file"]) != path:
            continue
        key = (m["range"]["start"]["line"] + 1, m["range"]["start"]["column"])
        by_rule.setdefault(m["ruleId"], {})[key] = " ".join(m["text"].split())
    calls = by_rule.get("await-member", {})
    in_loop = set(by_rule.get("await-member-in-loop", {}))
    in_lambda = set(by_rule.get("await-member-in-lambda", {}))
    filters = by_rule.get("memory-filter", {})

    flat, loop, lam, other = [], [], [], []
    reads = writes = 0
    for key, text in sorted(calls.items()):
        receiver, method = call_label(text)
        label = "L%d %s.%s" % (key[0], receiver, method) if receiver.count(".") < 2 else "L%d %s...%s" % (key[0], receiver.split(".")[0], method)
        new = added is None or key[0] in added
        if not new:
            label += " (pre-existing)"
        is_port = bool(port(receiver))
        if key in in_loop or key in in_lambda:
            where = "loop" if key in in_loop else "lambda"
            if is_port:
                (loop if key in in_loop else lam).append((label, new))
            else:
                other.append(("%s [%s]" % (label, where), new))
        elif is_port:
            flat.append((label, new))
            if WRITE.match(method):
                writes += 1
            else:
                reads += 1
        else:
            other.append(("%s [outside loops]" % label, new))

    filt = [("L%d %s" % (k[0], t) + ("" if added is None or k[0] in added else " (pre-existing)"), added is None or k[0] in added)
            for k, t in sorted(filters.items())]

    def show(title, items):
        if items:
            shown = " / ".join(i[0] for i in items[:LIST_MAX])
            more = " / ... +%d" % (len(items) - LIST_MAX) if len(items) > LIST_MAX else ""
            print("%s (%d): %s%s" % (title, len(items), shown, more))

    print("[%s]" % path)
    show("Ports outside loops", flat)
    show("Ports in a loop", loop)
    show("Ports in a lambda", lam)
    show("Other awaits, to classify", other)
    show("Memory filter on an awaited result", filt)
    blocking = [i for i in loop + lam + filt if i[1]]
    return reads, writes, blocking


def usage():
    import textwrap
    print(textwrap.dedent("    " + __doc__.split("Usage:")[1].split("Exit 0")[0]).strip())
    return 2


def main(argv):
    if not argv:
        return usage()
    receivers = None
    args = list(argv)
    if "--receivers" in args:
        i = args.index("--receivers")
        if i + 1 >= len(args):
            return usage()
        receivers = args[i + 1]
        del args[i:i + 2]
    settings = pack_settings()
    if receivers is None:
        receivers = settings.get("receivers")
    extra = re.compile(str(receivers), re.I) if receivers else None

    def port(name):
        return PORT.search(name) or (extra and extra.search(name))

    diff_mode = bool(args) and args[0] == "--diff"
    if diff_mode:
        roots = args[1:] or (settings.get("roots") if isinstance(settings.get("roots"), list) else None) or ["src"]
        out = subprocess.run(["git", "diff", "--name-only", "HEAD", "--", *roots], capture_output=True, text=True, cwd=ROOT).stdout
        out += subprocess.run(["git", "ls-files", "--others", "--exclude-standard", "--", *roots], capture_output=True, text=True, cwd=ROOT).stdout
        files = sorted({f for f in out.split() if f.endswith(".cs") and os.path.exists(os.path.join(ROOT, f))})
        if not files:
            print("no .cs file changed under %s" % ", ".join(roots))
            return 0
    else:
        missing = [f for f in args if not os.path.exists(f)]
        if missing:
            print("not found: " + ", ".join(missing))
            return 2
        files = [rel(f) for f in args]
    # The arguments are checked before the tool: a missing file is a usage error (exit 2) whether or
    # not ast-grep is installed; exit 3 says the cost of files that exist could not be measured.
    binary = ast_grep()
    if not binary:
        print("ast-grep missing (npm install -g @ast-grep/cli): cost not measured, state it by hand and say so")
        return 3
    matches = scan(binary, files)
    if matches is None:
        print("ast-grep failed on %s: cost not measured, state it by hand and say so" % ", ".join(files))
        return 3
    reads = writes = 0
    blocking = []
    for f in files:
        r, w, b = analyse(matches, f, added_lines(f) if diff_mode else None, port)
        reads += r
        writes += w
        blocking += b
    verdict = "none" if not blocking else "%d - back to design" % len(blocking)
    print("Cost: %s + %s through ports outside loops; in a loop, a lambda or a memory filter: %s" % (plural(reads, "read"), plural(writes, "write"), verdict))
    return 2 if blocking else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
