#!/usr/bin/env python3
"""Puts right the whitespace `git diff --check HEAD` would refuse, before the audit gate (D88).

Adapted from Orkeon Code's tidyWhitespace (src/shared/domain/dev/whitespace.ts): a role that
appends a member at the end of a file leaves a blank line after it, and the gate stopped the batch
for it. Only the lines git flags are touched - a trailing space or tab, a blank line at the end of
the file; a line the batch left alone keeps its spaces, and a conflict marker is left for the gate
to refuse. One line per file fixed, nothing else.

Usage: tidy-whitespace.py    (from the checkout or the worktree of the batch; exit 0, 2 outside git)
"""

import os
import re
import subprocess
import sys

FLAG = re.compile(r"^(?P<path>.+?):(?P<line>\d+): (?P<what>trailing whitespace|new blank line at EOF)\.$")


def flagged():
    try:
        out = subprocess.run(["git", "-c", "core.quotepath=off", "diff", "--check", "HEAD"],
                             capture_output=True, text=True).stdout
    except OSError:
        return None
    found = {}
    for line in out.splitlines():
        m = FLAG.match(line)
        if m:
            found.setdefault(m.group("path"), {}).setdefault(m.group("what"), set()).add(int(m.group("line")))
    return found


def tidy(path, what):
    with open(path, encoding="utf-8", newline="") as fh:
        text = fh.read()
    fixed = []
    lines = text.split("\n")
    if "trailing whitespace" in what:
        marked = what["trailing whitespace"]
        stripped = [re.sub(r"[ \t]+(\r?)$", r"\1", l) if i + 1 in marked else l for i, l in enumerate(lines)]
        n = sum(a != b for a, b in zip(lines, stripped))
        if n:
            fixed.append(f"trailing whitespace on {n} line{'s' if n > 1 else ''}")
        lines = stripped
    if "new blank line at EOF" in what:
        end = len(lines) - (1 if text.endswith("\n") else 0)
        blank = 0
        while end > 1 and lines[end - 1].strip("\r") == "":
            end -= 1
            blank += 1
        if blank:
            fixed.append("a blank line at EOF removed" if blank == 1 else f"{blank} blank lines at EOF removed")
            lines = lines[:end] + ([""] if text.endswith("\n") else [])
    if fixed:
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write("\n".join(lines))
    return fixed


def main():
    top = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    found = flagged() if top.returncode == 0 else None
    if found is None:
        print("tidy-whitespace: not in a git checkout", file=sys.stderr)
        return 2
    for path, what in sorted(found.items()):
        try:
            fixed = tidy(os.path.join(top.stdout.strip(), path), what)
        except (OSError, UnicodeDecodeError) as error:
            print(f"whitespace ! {path}: not written ({str(error).splitlines()[0]})")
            continue
        if fixed:
            print(f"whitespace ok {path}: {', '.join(fixed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
