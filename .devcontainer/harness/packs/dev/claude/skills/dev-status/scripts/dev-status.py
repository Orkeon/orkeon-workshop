#!/usr/bin/env python3
"""Where the batches of a dev chain stand, read from the work folder alone (/dev-status, D88).

Adapted from Orkeon Code's /dev-status (src/commands/_lib/dev/dev.ts, ADR 0011). Per batch of
<work>/<code>/<CODE>-PLAN.md: the plan's state and step boxes, the sheet's TDD ticks, the last
verdict of <CODE>-VERIFY-F<n>.md and the last event of <CODE>-BATCHES-STATE.md; then what disagrees.
Read-only: it writes nothing, runs no git and no build.

Usage:
  dev-status.py            # the codes of the work folder
  dev-status.py <code>     # the batches of one code

The work folder and the /dev-learn nudge come from learn-candidates.py (the same rules, D69);
DEV_LEARN_ROOT and DEV_LEARN_STATE override the checkout and its state file (evals).
Exit 2: a usage error, a code that is not one, or a folder holding no spec, brief or plan.
"""

import glob
import importlib.util
import os
import re
import sys

sys.dont_write_bytecode = True  # no __pycache__ beside a shipped script
HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "learn_candidates", os.path.join(HERE, "..", "..", "dev-learn", "scripts", "learn-candidates.py"))
lc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lc)

CODE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
BATCH_LINE = re.compile(r"^###\s+Batch\s+(F\d+)\s+—\s+(.+?)\s+—\s+(.+?)\s*$")
BOX = re.compile(r"^\s*-\s+\[([ xX])\]")
TDD = re.compile(r"^\s*TDD:\s*RED\s*\[([ xX])\]\s*GREEN\s*\[([ xX])\]\s*COST\s*\[([ xX])\]")
SHEET = re.compile(r"-PLAN-(F\d+)\.md$")
VERIFY_HEAD = re.compile(r"^#\s+\S+-VERIFY-F\d+\s+—\s+(.+?)\s+—\s+(\S+)\s*$")
VERDICT = re.compile(r"^##\s+Verdict\s+—\s+(VALID|GAPS)\b")
LOG = re.compile(r"^-\s+(\S+\s+\S+)\s+(F\d+)\s+(.+?)\s*$")
OPEN_EVENTS = ("launched", "relaunched", "stall")
MAX_BATCHES, MAX_WARNINGS = 20, 5


def read(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def fnum(batch):
    return int(batch[1:])


def plan_batches(text):
    """{F<n>: (name, state, done boxes, boxes)} from the global plan's `### Batch` lines."""
    out, current = {}, None
    for line in text.splitlines():
        m = BATCH_LINE.match(line)
        if m:
            current = m.group(1)
            out[current] = [m.group(2), m.group(3), 0, 0]
            continue
        if line.startswith("#"):
            current = None
        elif current and BOX.match(line):
            out[current][3] += 1
            out[current][2] += BOX.match(line).group(1) != " "
    return out


def sheet_ticks(text):
    ticks = [m.groups() for m in map(TDD.match, text.splitlines()) if m]
    done = [sum(t[i] != " " for t in ticks) for i in range(3)]
    return done, len(ticks)


def last_verdict(text):
    """(when, mode, verdict, counts) of the last dated section of a verdict file."""
    head, verdict, counts, inside = None, None, {}, False
    for line in text.splitlines():
        m = VERIFY_HEAD.match(line)
        if m:
            head, verdict, counts, inside = m.groups(), None, {}, False
            continue
        m = VERDICT.match(line)
        if m:
            verdict, inside = m.group(1), True
            continue
        if line.startswith("#"):
            inside = False
        elif inside:
            cell = line.strip().strip("|").split("|")[0].strip()
            if cell in ("Blocking", "Major", "Minor"):
                counts[cell] = counts.get(cell, 0) + 1
    if not verdict:
        return None
    when, mode = head if head else ("?", "?")
    return when, mode, verdict, counts


def last_events(text):
    events = {}
    for line in text.splitlines():
        m = LOG.match(line)
        if m:
            events[m.group(2)] = (m.group(3), m.group(1))
    return events


def nudge():
    done = set(lc.load_state()["treated"])
    todo = [r for r in lc.rows() if r["id"] not in done]
    batches = {r["batch"] for r in todo}
    if len(batches) >= lc.NUDGE_BATCHES:
        return f"/dev-learn due: {len(todo)} untreated verdict gap(s) across {len(batches)} batches"
    return None


def plan_path(folder):
    plans = [p for p in glob.glob(os.path.join(folder, "*-PLAN.md"))]
    return plans[0] if plans else None


def list_codes(work):
    codes = sorted(d for d in os.listdir(work) if os.path.isdir(os.path.join(work, d))) if os.path.isdir(work) else []
    items = []
    for code in codes:
        folder = os.path.join(work, code)
        parts = [k for k, pat in (("spec", "SPEC-*.md"), ("change", "CHANGE-*.md"), ("plan", "*-PLAN.md"))
                 if glob.glob(os.path.join(folder, pat))]
        if not parts:
            continue
        sheets = len(glob.glob(os.path.join(folder, "*-PLAN-F*.md")))
        verdicts = len(glob.glob(os.path.join(folder, "*-VERIFY-F*.md")))
        items.append(f"{code} — {', '.join(parts)}, {sheets} sheets, {verdicts} verdicts")
    print(f"codes ({len(items)}): " + (" · ".join(items) if items else "none — /dev-spec or /dev-change starts one"))


def show_code(work, code):
    folder = os.path.join(work, code)
    if not os.path.isdir(folder):
        print(f"dev-status: no folder {lc.WORK}/{code}/", file=sys.stderr)
        return 2
    specs = glob.glob(os.path.join(folder, "SPEC-*.md"))
    changes = glob.glob(os.path.join(folder, "CHANGE-*.md"))
    plan = plan_path(folder)
    if not (specs or changes or plan):
        print(f"dev-status: {lc.WORK}/{code}/ holds no SPEC-, CHANGE- or -PLAN.md file", file=sys.stderr)
        return 2
    source = f"spec {os.path.basename(specs[0])}" if specs else (
        f"change {os.path.basename(changes[0])}" if changes else "no spec")
    if not plan:
        print(f"code: {code}/ — {source} — no plan: /dev-plan {code}")
        return 0
    text = read(plan)
    title = next((l for l in text.splitlines() if l.startswith("# ")), "")
    feature = title.split(" — ", 1)[1].strip() if " — " in title else ""
    batches = plan_batches(text)
    done = sum(1 for b in batches.values() if b[1].startswith("done"))
    print(f"code: {code}/ — {source} — plan {os.path.basename(plan)} \"{feature}\" ({len(batches)} batches, {done} done)")

    prefix = os.path.basename(plan)[: -len("-PLAN.md")]
    sheets = {SHEET.search(p).group(1): p for p in glob.glob(os.path.join(folder, f"{prefix}-PLAN-F*.md"))
              if SHEET.search(p)}
    events = last_events(read(os.path.join(folder, f"{prefix}-BATCHES-STATE.md")))
    warnings = [f"{os.path.basename(p)} has no batch line in the plan" for b, p in sorted(sheets.items())
                if b not in batches]
    names = sorted(batches, key=fnum)
    for b in names[:MAX_BATCHES]:
        name, state, boxes_done, boxes = batches[b]
        parts = [f"{b} {name} — {state} — boxes {boxes_done}/{boxes}"]
        if b in sheets:
            (r, g, c), n = sheet_ticks(read(sheets[b]))
            parts.append(f"sheet RED {r}/{n} GREEN {g}/{n} COST {c}/{n}")
            if state.startswith("done") and min(r, g, c) < n:
                warnings.append(f"{b}: done in the plan but its sheet has open ticks")
        else:
            parts.append("no sheet")
        v = last_verdict(read(os.path.join(folder, f"{prefix}-VERIFY-{b}.md")))
        if not v:
            parts.append("no verdict")
        else:
            when, mode, verdict, counts = v
            if verdict == "VALID":
                parts.append(f"VALID {when} {mode} ({counts.get('Minor', 0)} Minor)")
                if state == "open":
                    warnings.append(f"{b}: VALID but the plan still says open")
            else:
                parts.append(f"GAPS {when} {mode}: {counts.get('Blocking', 0)} Blocking, {counts.get('Major', 0)} Major")
        if b in events:
            event, at = events[b]
            parts.append(f"running ({event} {at})" if event.startswith(OPEN_EVENTS) else f"{event} {at}")
        print(" — ".join(parts))
    if len(names) > MAX_BATCHES:
        print(f"+{len(names) - MAX_BATCHES} more batches")
    for w in warnings[:MAX_WARNINGS]:
        print(f"warning: {w}")
    if len(warnings) > MAX_WARNINGS:
        print(f"+{len(warnings) - MAX_WARNINGS} more warnings")
    return 0


def main(argv):
    if len(argv) > 1 or (argv and argv[0].startswith("-")):
        print("usage: /dev-status [<code>]", file=sys.stderr)
        return 2
    work = os.path.join(lc.ROOT, lc.WORK)
    print(f"work folder: {lc.WORK}/")
    if not argv:
        list_codes(work)
        rc = 0
    elif not CODE.match(argv[0]):
        print(f"dev-status: \"{argv[0]}\" is not a code (kebab-case, the folder under {lc.WORK}/)", file=sys.stderr)
        return 2
    else:
        rc = show_code(work, argv[0])
    line = nudge() if rc == 0 else None
    if line:
        print(line)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
