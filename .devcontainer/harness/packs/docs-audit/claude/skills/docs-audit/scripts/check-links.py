#!/usr/bin/env python3
"""Relative links and anchors of Markdown files.

For each Markdown file given (or every *.md under a folder given), checks that every
relative link resolves to a file or folder, and that every #anchor names a heading of
its target (GitHub's rule: lowercase, punctuation dropped, spaces to hyphens, -1, -2 for
repeats) or an explicit <a id|name="...">. Links inside code fences and inline code are
ignored; absolute URLs and mailto: are not checked.

Usage:
    python3 check-links.py <file.md | folder> [...]

Prints one line per broken link, `<file>:<line>: <link> - <why>`, then a summary line.
Exit 0 when every link holds, 1 when one is broken, 2 on a usage error.
"""

import os
import re
import sys
import unicodedata

LINK = re.compile(r"(?<!!)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)|!\[[^\]]*\]\(\s*<?([^)\s>]+)>?")
REFDEF = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+.*)?$")
HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$")
EXPLICIT = re.compile(r"<a\s+[^>]*(?:id|name)=\"([^\"]+)\"", re.I)
FENCE = re.compile(r"^\s{0,3}(```|~~~)")
INLINE_CODE = re.compile(r"`[^`]*`")


def slug(text):
    # HTML tags and link targets are dropped outside code spans only: a heading
    # `deploy <team>` keeps "team" in its anchor.
    parts = text.split("`")
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", re.sub(r"<[^>]+>", "", parts[i]))
    text = "".join(parts).strip().lower()
    out = []
    for ch in text:
        if ch in (" ", "-", "_") or ch.isalnum():
            out.append("-" if ch == " " else ch)
        elif unicodedata.category(ch).startswith("M"):
            out.append(ch)
    return "".join(out)


def lines_outside_code(path):
    inside = False
    with open(path, encoding="utf-8", errors="replace") as handle:
        for number, line in enumerate(handle, 1):
            if FENCE.match(line):
                inside = not inside
                continue
            if not inside:
                yield number, line


ANCHORS = {}


def anchors(path):
    if path not in ANCHORS:
        found, seen = set(), {}
        for _, line in lines_outside_code(path):
            for name in EXPLICIT.findall(line):
                found.add(name)
            match = HEADING.match(line)
            if match:
                base = slug(match.group(2))
                count = seen.get(base, 0)
                seen[base] = count + 1
                found.add(base if count == 0 else f"{base}-{count}")
        ANCHORS[path] = found
    return ANCHORS[path]


def targets(line):
    line = INLINE_CODE.sub("", line)
    for match in LINK.finditer(line):
        yield match.group(1) or match.group(2)
    ref = REFDEF.match(line)
    if ref:
        yield ref.group(1)


def check(path):
    broken = []
    for number, line in lines_outside_code(path):
        for target in targets(line):
            if re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I) or target.startswith("//"):
                continue
            file_part, _, anchor = target.partition("#")
            file_part = file_part.split("?", 1)[0]
            if file_part:
                resolved = os.path.normpath(os.path.join(os.path.dirname(path), file_part))
                if not os.path.exists(resolved):
                    broken.append((number, target, "no such file"))
                    continue
            else:
                resolved = path
            if anchor and resolved.endswith(".md") and os.path.isfile(resolved):
                if anchor not in anchors(resolved) and anchor.lower() not in anchors(resolved):
                    broken.append((number, target, f"no heading or id '{anchor}' in {os.path.relpath(resolved)}"))
    return broken


def files(arguments):
    for argument in arguments:
        if os.path.isdir(argument):
            for root, dirs, names in os.walk(argument):
                dirs[:] = sorted(d for d in dirs if d not in (".git", "node_modules", "_site", "bin", "obj"))
                for name in sorted(names):
                    if name.endswith(".md"):
                        yield os.path.join(root, name)
        elif os.path.isfile(argument):
            yield argument
        else:
            print(f"check-links: no such file or folder: {argument}")
            sys.exit(2)


def main():
    if len(sys.argv) < 2:
        print("usage: check-links.py <file.md | folder> [...]")
        return 2
    checked = total = 0
    for path in files(sys.argv[1:]):
        checked += 1
        for number, target, why in check(path):
            total += 1
            print(f"{path}:{number}: {target} - {why}")
    print(f"check-links: {checked} file(s), {total} broken link(s)")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
