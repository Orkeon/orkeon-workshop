#!/usr/bin/env python3
"""check-approve-lines.py — every `/team-approve …` line the harness tells the user to type is one the
hook `team-approve` accepts (a drift between what a skill says and what the hook parses is caught
here, not by a user whose approval is refused).

    python3 evals/check-approve-lines.py [--list]
    python3 evals/check-approve-lines.py --try '<line>'     # one line, in its scratch workshop

Reads the code spans (and fenced lines) of every Markdown file the harness ships — HARNESS.md and the
top-level files, claude/ (skills, agents, rules, templates), references/, packs/ — and, in this
repository, docs/. Each `/team-approve team …` or `/team-approve remote …` it finds is made concrete:
`<usd>` → 1.50, `<slug>` → alpha, `[<slug>]` → once without and once with alpha; a line still holding
a placeholder it does not know fails; a line cut short (`…`) and the bare name `/team-approve remote`
are left out, and so are the records of what was (the plan, VERIFICATIONS.md). Each concrete line is fed to
claude/hooks/team-approve.sh as a UserPromptSubmit payload in its own scratch workshop that waits for
it: for `team`, a team in phase spec with a filled TEAM.md; for `remote`, a team with an open attempt
and a stub `orkeon-bench` that checks it is asked `attempt approve <slug> --usd <usd>` and writes the
marker. Accepted = the hook records it (its context says so, and for `remote` the marker exists).

Output: `FAIL <file>:<line> — <why>` per problem, then `check-approve-lines: <n> lines, <m> forms, <k>
problems`; exit 0 when none, 1 otherwise. `--list` prints each concrete form and where it was read.
Called by the eval case `approve-lines`.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir(os.path.join(HERE, "..", "claude", "hooks")):        # this repo, the image
    HARNESS = os.path.abspath(os.path.join(HERE, ".."))
    CLAUDE = os.path.join(HARNESS, "claude")
    REFS = os.path.join(HARNESS, "references")
    roots = [CLAUDE, REFS, os.path.join(HARNESS, "packs")]
    docs = os.path.abspath(os.path.join(HARNESS, "..", "..", "docs"))
    if os.path.isdir(docs):
        roots.append(docs)
else:                                                                  # a workshop's .claude/evals
    CLAUDE = os.path.abspath(os.path.join(HERE, ".."))
    HARNESS = os.path.join(CLAUDE, "harness")
    REFS = os.path.abspath(os.path.join(CLAUDE, "..", "references"))
    roots = [CLAUDE, REFS]
HOOK = os.path.join(CLAUDE, "hooks", "team-approve.sh")
SKIP_DIRS = {".fixtures", "node_modules", "harness-backup", "local", "worktrees", "agent-memory"}

SPAN = re.compile(r"`([^`\n]+)`")
LINE = re.compile(r"(/team-approve (?:team|remote)\b[^`|\"]*)")
# Records of what was, not instructions: the plan and the verification runs.
SKIP_FILES = {"orkeon-workshop-plan.md", "VERIFICATIONS.md"}


def markdown_files():
    if os.path.isdir(HARNESS):
        for n in sorted(os.listdir(HARNESS)):
            if n.endswith(".md") and n not in SKIP_FILES and os.path.isfile(os.path.join(HARNESS, n)):
                yield os.path.join(HARNESS, n)
    for root in roots:
        for d, subs, files in os.walk(root):
            subs[:] = sorted(s for s in subs if s not in SKIP_DIRS)
            if os.path.abspath(d) == os.path.abspath(HARNESS):
                continue
            for n in sorted(files):
                if n.endswith(".md") and n not in SKIP_FILES:
                    yield os.path.join(d, n)


def typed_lines():
    """(file, line number, the line as the harness writes it)."""
    seen = set()
    for path in markdown_files():
        rel = os.path.relpath(path, os.path.join(HARNESS, "..") if os.path.isdir(HARNESS) else CLAUDE)
        fenced = False
        try:
            text = open(path, encoding="utf-8").read().splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        for no, raw in enumerate(text, 1):
            if raw.lstrip().startswith("```"):
                fenced = not fenced
                continue
            chunks = [raw] if fenced else SPAN.findall(raw)
            for chunk in chunks:
                for m in LINE.finditer(chunk):
                    form = m.group(1).strip()
                    if (rel, no, form) not in seen:
                        seen.add((rel, no, form))
                        yield rel, no, form


def concrete(form):
    """The lines a user types for a form, or a str: why it cannot be made concrete; None: left out."""
    if "…" in form or "..." in form:
        return None
    if form.split()[1:] == ["remote"]:      # the form named, `/team-approve remote`, not a line to type
        return None
    variants = [form]
    if "[<slug>]" in form:
        variants = [form.replace(" [<slug>]", "").replace("[<slug>]", ""), form.replace("[<slug>]", "alpha")]
    out = []
    for v in variants:
        v = v.replace("<usd>", "1.50").replace("<slug>", "alpha")
        v = re.sub(r"\s+", " ", v).strip()
        if re.search(r"[<>\[\]{}]", v):
            return f"`{form}` holds a placeholder this check does not know"
        out.append(v)
    return out


STATUS = ("---\nphase: {phase}\ngate_passed: {gate}\niteration: 0\nattempt: null\nbatch: null\nverdict: null\n"
          "next_action: {next}\nupdated_at: 2026-10-01T10:00:00Z\n---\n\n# Team — Status\n\n"
          "- 2026-10-01 10:00 — /team-init — workbook and tests created (DEC-0001)\n")
TEAM = ("# Team — Team\n\n## Need\n\n### Purpose\n\nTriage the mails of a mailbox.\n\n## Acceptance\n\n"
        "### Acceptance criteria\n\n| AC-01 | x |\n\n## Design\n\n### Agents\n\nx\n\n## Plan\n\n### B1\n\n#### Intent\n\nx\n")
STUB = """#!/bin/bash
[ "$1 $2 $3 $4" = 'attempt approve {slug} --usd' ] || {{ echo "unexpected: $*" >&2; exit 2; }}
printf '{{"by": "user", "at": "2026-10-01T10:05:00Z", "estimated_usd": %s, "cap_usd": 2}}' "$5" > "$ORKEON_WORKSHOP/workbooks/{slug}/attempts/ATT-0002/remote-approval.json"
echo "approved: $5 USD in ATT-0002"
"""


def write(path, content, mode=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    if mode:
        os.chmod(path, mode)


def try_line(line, scratch, n):
    """None when the hook records the line, else why not."""
    parsed = line[:-1].rstrip() if line.endswith(".") else line
    tokens = parsed.split()[1:]
    if not tokens or tokens[0] not in ("team", "remote"):
        return "not a `/team-approve team|remote …` line"
    what = tokens[0]
    rest = tokens[2:] if what == "remote" else tokens[1:]
    slug = rest[0] if rest else "alpha"
    ws = os.path.join(scratch, f"w{n}")
    wb = os.path.join(ws, "workbooks", slug)
    os.makedirs(os.path.join(ws, "teams"), exist_ok=True)
    if what == "team":
        write(os.path.join(wb, "STATUS.md"), STATUS.format(phase="spec", gate="null", next=f"/team-approve team {slug}"))
        write(os.path.join(wb, "TEAM.md"), TEAM)
    else:
        # the budget gate submitted by /team-run, the estimate under the amount the line approves
        amount = re.sub(r"[^0-9.]", "", tokens[1]) if len(tokens) > 1 else ""
        write(os.path.join(wb, "STATUS.md"), STATUS.format(phase="run", gate="build", next=f"/team-approve remote {amount or '0'} {slug}"))
        write(os.path.join(wb, "attempts", "ATT-0001", "manifest.json"),
              '{"attempt": "ATT-0001", "opened_at": "2026-09-30T10:00:00Z", "closed_at": "2026-09-30T12:00:00Z", "verdict": "ITERATE"}')
        write(os.path.join(wb, "attempts", "ATT-0002", "manifest.json"),
              '{"attempt": "ATT-0002", "opened_at": "2026-10-01T10:00:00Z", "closed_at": null, "verdict": null}')
        write(os.path.join(ws, "bin", "orkeon-bench"), STUB.format(slug=slug), 0o755)
    sid = f"approvelines-{os.getpid()}-{n}"
    payload = json.dumps({"hook_event_name": "UserPromptSubmit", "session_id": sid, "prompt": line})
    env = dict(os.environ, ORKEON_WORKSHOP=ws, PATH=os.path.join(ws, "bin") + os.pathsep + os.environ.get("PATH", ""))
    try:
        r = subprocess.run(["bash", HOOK], input=payload, capture_output=True, text=True, cwd=ws, env=env, timeout=60)
    except subprocess.TimeoutExpired:
        return "the hook did not answer in 60 s"
    finally:
        try:
            os.remove(f"/tmp/claude-teamapprove-{sid}")
        except OSError:
            pass
    try:
        out = json.loads(r.stdout)
    except ValueError:
        return f"the hook answered no JSON (exit {r.returncode}): {r.stdout.strip()[:200] or r.stderr.strip()[:200]}"
    if out.get("decision") == "block":
        return f"refused: {str(out.get('reason'))[:300]}"
    ctx = str((out.get("hookSpecificOutput") or {}).get("additionalContext") or "")
    if what == "team":
        if f"gate team of team `{slug}` is recorded" not in ctx:
            return f"not recorded: {ctx[:300]}"
    else:
        if f"is approved for team `{slug}`" not in ctx:
            return f"not recorded: {ctx[:300]}"
        if not os.path.isfile(os.path.join(wb, "attempts", "ATT-0002", "remote-approval.json")):
            return "recorded, but no remote-approval.json in the open attempt"
    return None


def main():
    listing = "--list" in sys.argv[1:]
    if not os.path.isfile(HOOK):
        print(f"check-approve-lines: no hook at {HOOK}", file=sys.stderr)
        return 2
    if sys.argv[1:2] == ["--try"] and len(sys.argv) == 3:
        scratch = tempfile.mkdtemp(prefix="claude-approvelines-")
        try:
            why = try_line(sys.argv[2], scratch, 0)
        finally:
            shutil.rmtree(scratch, ignore_errors=True)
        print(f"FAIL `{sys.argv[2]}` — {why}" if why else f"ok `{sys.argv[2]}` is recorded")
        return 1 if why else 0
    problems = 0
    found = list(typed_lines())
    forms = {}
    for rel, no, form in found:
        c = concrete(form)
        if c is None:
            continue
        if isinstance(c, str):
            problems += 1
            print(f"FAIL {rel}:{no} — {c}")
            continue
        for line in c:
            forms.setdefault(line, []).append(f"{rel}:{no}")
    scratch = tempfile.mkdtemp(prefix="claude-approvelines-")
    try:
        for n, (line, where) in enumerate(sorted(forms.items())):
            if listing:
                print(f"{line}\t{', '.join(where)}")
            why = try_line(line, scratch, n)
            if why:
                problems += 1
                print(f"FAIL {where[0]} — `{line}` (also {len(where) - 1} more) — {why}" if len(where) > 1
                      else f"FAIL {where[0]} — `{line}` — {why}")
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    print(f"check-approve-lines: {len(found)} lines, {len(forms)} forms, {problems} problems")
    return 0 if problems == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
