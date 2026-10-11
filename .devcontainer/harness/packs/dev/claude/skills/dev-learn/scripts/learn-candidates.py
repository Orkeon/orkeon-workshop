#!/usr/bin/env python3
"""Gaps of the /dev-verify verdict files not yet run through /dev-learn.

Adapted from claude-code-toolkit/scripts/learn-candidates.py (MIT, see THIRD-PARTY.md). The
toolkit mined the auditor's sub-transcripts; here /dev-verify writes every verdict to disk,
<work>/<code>/<CODE>-VERIFY-F<n>.md (<work> the work folder of the space, D69: <work>/ unless
HARNESS_WORK_DIR names a folder of the repository), so the source is those files and a batch is
`<code>/F<n>`.
The memory audit of the toolkit is not brought.

State: .claude/local/dev-learn-state.json (out of git, like the rest of .claude/local/): the
treated row ids and the refused motifs, which /dev-learn never proposes again.

Usage:
  learn-candidates.py                     # summary per axis
  learn-candidates.py --axis Plan         # untreated gaps of one axis
  learn-candidates.py --count             # one line when two batches or more wait, else nothing
  learn-candidates.py --treat-axis Plan   # marks every untreated row of the axis treated
  learn-candidates.py --refuse "motif"    # a refused motif, never proposed again

DEV_LEARN_ROOT and DEV_LEARN_STATE override the checkout and the state file (evals).
"""

import argparse
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata

AXES = ("Correctness", "Reuse", "Simplification", "Cost", "Placement",
        "Conventions", "Test", "Plan", "Scope")
ALIASES = {"stale plan": "Plan"}
SEVERITIES = {"Blocking", "Major"}
NUDGE_BATCHES = 2
VERDICT = re.compile(r"^##\s+Verdict\s+—\s+GAPS\s*$")
FILE = re.compile(r"^(?P<code>[A-Za-z0-9][\w.-]*)-VERIFY-(?P<batch>F\d+)\.md$")
CELL = 200


def root():
    env = os.environ.get("DEV_LEARN_ROOT")
    if env:
        return env
    try:
        return subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                              text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return os.getcwd()


ROOT = root()


def work_dir(root_dir):
    """The work folder (D69), as lib/team-common.sh harness_work_dir resolves it: HARNESS_WORK_DIR when
    it names a relative folder of the root that exists, else todo."""
    w = os.environ.get("HARNESS_WORK_DIR", "").replace("\t", "").replace("\r", "").replace("\n", "").strip()
    while w.startswith("./") or (w.endswith("/") and w != "/"):
        w = w[2:] if w.startswith("./") else w[:-1]
    parts = w.split("/")
    if not w or w == "todo" or w.startswith("/") or "//" in w or ".." in parts or "." in parts \
            or parts[0] in (".claude", ".git") or not w.isprintable():
        return "todo"
    if os.path.isdir(os.path.join(root_dir, w)):
        return w
    try:  # a linked worktree without the folder (no submodule checked out): the main worktree's (D69)
        out = subprocess.run(["git", "-C", root_dir, "worktree", "list", "--porcelain"],
                             capture_output=True, text=True, timeout=5).stdout
        main = out.split("\n", 1)[0][len("worktree "):] if out.startswith("worktree ") else ""
        if main and os.path.realpath(main) != os.path.realpath(root_dir) and os.path.isdir(os.path.join(main, w)):
            return os.path.join(main, w)
    except (OSError, subprocess.SubprocessError):
        pass
    return "todo"


WORK = work_dir(ROOT)
STATE = os.environ.get("DEV_LEARN_STATE") or os.path.join(ROOT, ".claude", "local", "dev-learn-state.json")


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


def axis(label):
    folded = fold(label.strip())
    alias = next((a for k, a in ALIASES.items() if folded.startswith(k)), None)
    return alias or next((a for a in AXES if folded.startswith(fold(a))), label.strip())


def load_state():
    try:
        with open(STATE, encoding="utf-8") as fh:
            s = json.load(fh)
    except (OSError, ValueError):
        s = {}
    if not isinstance(s, dict):
        s = {}
    for key in ("treated", "refused"):
        if not isinstance(s.get(key), list):
            s[key] = []
    return s


def save_state(s):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(s, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE)


def gap_rows(text):
    """Rows `| Severity | Axis | Gap | Evidence | Expected fix |` under every `## Verdict — GAPS`."""
    inside = False
    for line in text.splitlines():
        if line.startswith("#"):
            inside = bool(VERDICT.match(line))
            continue
        if not inside:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 5 and cells[0] in SEVERITIES:
            yield cells[0], axis(cells[1]), " | ".join(cells[2:-2]), cells[-2], cells[-1]


def rows():
    out = []
    for path in sorted(glob.glob(os.path.join(ROOT, WORK, "*", "*-VERIFY-F*.md"))):
        m = FILE.match(os.path.basename(path))
        if not m:
            continue
        batch = f"{os.path.basename(os.path.dirname(path))}/{m.group('batch')}"
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            continue
        for sev, ax, gap, evidence, fix in gap_rows(text):
            rid = hashlib.sha1(f"{batch}|{ax}|{gap}".encode()).hexdigest()[:10]
            out.append(dict(id=rid, batch=batch, severity=sev, axis=ax, gap=gap, evidence=evidence, fix=fix))
    seen, unique = set(), []
    for r in out:
        if r["id"] not in seen:
            seen.add(r["id"])
            unique.append(r)
    return unique


def short(text, n=CELL):
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 3] + "..."


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--count", action="store_true")
    ap.add_argument("--axis")
    ap.add_argument("--treat-axis")
    ap.add_argument("--refuse")
    args = ap.parse_args()

    s = load_state()
    done = set(s["treated"])
    todo = [r for r in rows() if r["id"] not in done]

    if args.refuse or args.treat_axis:
        if args.refuse:
            s["refused"].append(args.refuse)
        if args.treat_axis:
            s["treated"] += [r["id"] for r in todo if r["axis"] == axis(args.treat_axis)]
        save_state(s)
        return 0

    batches = {r["batch"] for r in todo}
    if args.count:
        if len(batches) >= NUDGE_BATCHES:
            print(f"{len(todo)} untreated verdict gap(s) across {len(batches)} batches — run /dev-learn after /clear")
        return 0

    if args.axis:
        picked = [r for r in todo if r["axis"] == axis(args.axis)]
        for r in picked:
            print(f"- [{r['severity']}] {short(r['gap'])}\n  fix: {short(r['fix'], 120)} · {r['batch']} · {short(r['evidence'], 80)}")
        if not picked:
            print(f'No untreated gap on axis "{args.axis}".')
        return 0

    if not todo:
        print("No untreated gap.")
    else:
        by_axis = {}
        for r in todo:
            by_axis.setdefault(r["axis"], []).append(r)
        print(f"{len(todo)} untreated gap(s), {len(batches)} batch(es)\n")
        print("axis             gaps batches blocking")
        for ax, rs in sorted(by_axis.items(), key=lambda kv: -len({r['batch'] for r in kv[1]})):
            print(f"{ax[:16]:<16} {len(rs):>4} {len({r['batch'] for r in rs}):>7} "
                  f"{sum(r['severity'] == 'Blocking' for r in rs):>8}")
    if s["refused"]:
        print("\nMotifs already refused (never proposed again):")
        for m in s["refused"]:
            print(f"- {m}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
