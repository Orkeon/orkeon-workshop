#!/usr/bin/env bash
# UserPromptSubmit / UserPromptExpansion hook — the user's approvals, recorded from what the user types.
#
# Plan § 4.4, § 7.3, D19, D36, D89. The two approvals of the method are lines the user types:
#   /team-approve team [<slug>]           the team gate — TEAM.md: need, acceptance, design, plan
#   /team-approve remote <usd> [<slug>]   the budget gate — a paid run, in the open attempt
# This hook reads the line before the model does and records it: the team gate in the front
# matter of workbooks/<slug>/STATUS.md (`phase: tests`, `gate_passed: team`, `next_action`,
# `updated_at`) with one journal line; a remote approval through `orkeon-bench attempt
# approve`, which alone writes remote-approval.json (D19), then `next_action: /team-run <slug>` —
# only once `/team-run` has priced the run and submitted it (`next_action: /team-approve remote
# <estimate> <slug>`), for an amount at or above that estimate. It is a trace Claude cannot fill
# in by mistake — guard-phase refuses an Edit that raises `gate_passed` to the user gate —
# not a proof against a determined agent.
#
# The team gate is recorded only for a team that waits for it: `phase: spec`, `gate_passed:
# null`, TEAM.md exists, is no longer its raw template, holds its four sections (`## Need`,
# `## Acceptance`, `## Design`, `## Plan`), carries no `> To revise — DEC-nnnn` line and no
# `TBD` outside `### Open questions`, and the step that writes it has submitted the gate —
# it ends on `next_action: /team-approve team …`, so a step that is paused or has not
# finished (`next_action: /team-spec …`) is not approved by a line typed too early. What
# TEAM.md says is the user's to judge, not this hook's (`orkeon-bench check team` checks its
# shape before the step submits). The gates of the previous method (`need`, `test-plan`,
# `design`, D36) are refused by name. Without a slug, the one team that waits for the gate
# (for `remote`, the one team with an open attempt) is taken; several, and the line must
# name one — an approval is never given to a team the user did not mean. A full stop typed
# after the line (`/team-approve team alpha.`) is not part of it. Teams are those of
# `workbooks/` of the workshop; a pilot of `library/examples/workbooks/` is taken only when
# the line names it.
#
# Recorded: the prompt goes on with `additionalContext` saying what was written (and a
# `systemMessage` for the user). Refused: `decision: block` with the reason — nothing is
# written, and the user reads why. Any other prompt: silent, exit 0. The event is read
# from the payload: `prompt` (UserPromptSubmit) or the command name and its arguments
# (UserPromptExpansion). Both events fire for one typed line, with the same `prompt_id`:
# the line is recorded once, the second answer repeating the first (without a
# `prompt_id`, the same line seen again in the session within a few seconds; and
# whatever the session remembers, a line whose `/team-approve` journal entry is a few
# seconds old is answered as recorded, not judged again).
#
# Frozen literals (FROZEN-LITERALS.md): the journal line
# `- YYYY-MM-DD HH:MM — /team-approve — gate team passed: the user typed …`, the prefix
# `team-approve:` of every message. HARNESS_TEAM_APPROVE=0 disables the hook;
# HARNESS_TEAM_APPROVE_BENCH_TIMEOUT is the time `orkeon-bench attempt approve` may take, in seconds (20).
set -uo pipefail

INPUT=$(cat)
[ -n "$INPUT" ] || exit 0
[ "${HARNESS_TEAM_APPROVE:-1}" = "0" ] && exit 0
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"
# A source space (D49) holds no team: nothing to judge there.
[ "$(harness_space)" = source ] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0

HOOK_INPUT="$INPUT" python3 <<'PYEOF'
import datetime, json, math, os, re, shutil, subprocess, sys, tempfile, time

try:
    d = json.loads(os.environ.get("HOOK_INPUT") or "{}")
except Exception:
    sys.exit(0)
if not isinstance(d, dict):
    sys.exit(0)

COMMAND = "team-approve"
USAGE = "`/team-approve team [<slug>]` or `/team-approve remote <usd> [<slug>]`"


def typed_line(payload):
    """The `/team-approve …` line of the payload, or None when the prompt is something else."""
    prompt = payload.get("prompt")
    if isinstance(prompt, str) and prompt.lstrip().startswith("/" + COMMAND):
        return prompt.strip()
    # UserPromptExpansion: the command and its arguments travel apart from the expanded body.
    name = payload.get("command_name") or payload.get("command") or ""
    if isinstance(name, str) and name.strip().lstrip("/") == COMMAND:
        args = payload.get("command_args")
        if args is None:
            args = payload.get("args")
        if isinstance(args, list):
            args = " ".join(str(a) for a in args)
        return ("/" + COMMAND + " " + (args if isinstance(args, str) else "")).strip()
    return None


line = typed_line(d)
if line is None:
    sys.exit(0)
head = line.split(None, 1)[0]
if head != "/" + COMMAND:           # /team-approved, /team-approve-all: another command
    sys.exit(0)

event = d.get("hook_event_name") if isinstance(d.get("hook_event_name"), str) else "UserPromptSubmit"
session = re.sub(r"[^A-Za-z0-9_.-]", "_", str(d.get("session_id") or "unknown"))
STATE = f"/tmp/claude-teamapprove-{session}"
REPLAY_SECONDS = 15
prompt_id = d.get("prompt_id") if isinstance(d.get("prompt_id"), str) and d.get("prompt_id") else None


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.exit(0)


def refuse(reason):
    emit({"decision": "block", "reason": "team-approve: nothing recorded — " + reason})


def recorded(context, message):
    out = {"hookSpecificOutput": {"hookEventName": event, "additionalContext": "team-approve: " + context},
           "systemMessage": "team-approve: " + message}
    try:
        with open(STATE, "w", encoding="utf-8") as fh:
            json.dump({"line": line, "prompt_id": prompt_id, "at": time.time(), "output": out}, fh)
    except OSError:
        pass
    emit(out)


# The same typed line, seen a second time by the other prompt event: answer as the first time.
# The two events of one line share its `prompt_id`; a line typed again is another prompt.
try:
    with open(STATE, encoding="utf-8") as fh:
        seen = json.load(fh)
    if prompt_id is not None and seen.get("prompt_id") is not None:
        same = seen.get("prompt_id") == prompt_id
    else:
        same = time.time() - float(seen.get("at", 0)) < REPLAY_SECONDS
    if seen.get("line") == line and same:
        out = seen.get("output") or {}
        if isinstance(out.get("hookSpecificOutput"), dict):
            out["hookSpecificOutput"]["hookEventName"] = event
        emit(out)
except (OSError, ValueError, TypeError):
    pass

if "\n" in line or "\r" in line:
    refuse("an approval is one line and nothing else: " + USAGE + ".")

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
PHASES = ["spec", "tests", "build", "run", "review", "accepted", "published"]
GATE_ORDER = ["team", "tests", "build", "review"]
# The one user gate (D89): approved in phase `spec` with no gate passed, it validates TEAM.md and
# moves the team to phase `tests`.
GATES = {
    "team": {"phase": "spec", "before": None, "files": ["TEAM.md"], "next": "/team-tests", "to_phase": "tests"},
}
OLD_GATES = ("need", "test-plan", "design")
SECTIONS = ["## Need", "## Acceptance", "## Design", "## Plan"]
FRONT_EDGE = re.compile(r"^---[ \t]*$")

# A sentence ends with a full stop, and a line copied from one carries it: no gate, amount or slug
# ends with a dot, so one typed last is dropped. The journal still quotes the line as typed.
parsed = line[:-1].rstrip() if line.endswith(".") and not line.endswith("..") else line
tokens = parsed.split()[1:]
if not tokens:
    refuse("say what is approved: " + USAGE + ".")
what = tokens[0]
amount = None
if what == "remote":
    if len(tokens) < 2:
        refuse("a remote run is approved with its amount in USD: `/team-approve remote <usd> [<slug>]`.")
    m = re.match(r"^\$?([0-9]+(?:\.[0-9]+)?)\$?$", tokens[1])
    if not m:
        refuse(f"`{tokens[1]}` is not an amount in USD (a number, 0 or more: `/team-approve remote 1.50`).")
    amount = m.group(1)
    rest = tokens[2:]
elif what in GATES:
    rest = tokens[1:]
elif what in OLD_GATES:
    refuse(f"`{what}` was a gate of the previous method (NEED.md, ACCEPTANCE.md, TEST-PLAN.md, DESIGN.md, PLAN.md): the one "
           f"user gate is now `team`, which validates `workbooks/<slug>/TEAM.md` (need, acceptance, design and plan) at once — "
           "`/team-approve team [<slug>]`.")
else:
    refuse(f"`{what}` is not something to approve: " + USAGE + ".")
if len(rest) > 1:
    refuse("an approval is one line and nothing else, for one team at most: " + USAGE + ".")
slug = rest[0] if rest else None
if slug is not None and not SLUG_RE.match(slug):
    refuse(f"`{slug}` is not a team slug (lower-case letters, digits and hyphens).")


def workshop_root():
    for var in ("ORKEON_WORKSHOP", "CLAUDE_PROJECT_DIR"):
        v = os.environ.get(var)
        if v:
            return v.rstrip("/") or "/"
    cwd = d.get("cwd")
    if isinstance(cwd, str) and os.path.isdir(os.path.join(cwd, "workbooks")):
        return cwd.rstrip("/") or "/"
    return os.path.join(os.environ.get("HOME") or "/home/node", "Orkeon")


ROOT = workshop_root()
# Where a team's workbook may live: the workshop, then the pilots of library/examples/, laid out as
# a small workshop of their own (guard-phase holds the user gates of both).
BASES = [("", ROOT), ("library/examples/", os.path.join(ROOT, "library", "examples"))]


class Team:
    def __init__(self, name, prefix, base):
        self.name = name
        self.base = base                                   # the workshop this team belongs to
        self.rel = f"{prefix}workbooks/{name}"             # how a message names its workbook
        self.workbook = os.path.join(base, "workbooks", name)
        self.status = os.path.join(self.workbook, "STATUS.md")


def find_team(name):
    for prefix, base in BASES:
        team = Team(name, prefix, base)
        if os.path.isfile(team.status):
            return team
    return None


def teams(pilots=False):
    """The teams a line without a slug may mean: those of the workshop. The pilots of
    library/examples/ are examples the image manages: one is taken only when the line names it."""
    out, seen_names = [], set()
    for prefix, base in (BASES if pilots else BASES[:1]):
        try:
            names = sorted(os.listdir(os.path.join(base, "workbooks")))
        except OSError:
            continue
        for name in names:
            team = Team(name, prefix, base)
            if SLUG_RE.match(name) and name not in seen_names and os.path.isfile(team.status):
                seen_names.add(name)
                out.append(team)
    return out


def read_status(path):
    """(front-matter dict, raw text) of a STATUS.md; ({}, text) without a front matter; (None, "") when
    the file cannot be read. As tolerant as lib/team-common.sh: a BOM, CRLF line ends, quotes and a
    trailing `# comment`; bytes that are not UTF-8 are carried through as they are (surrogateescape),
    never fatal — one odd workbook must not silence the approvals of the others — and written back
    unchanged by commit_status."""
    try:
        with open(path, encoding="utf-8", errors="surrogateescape", newline="") as fh:
            text = fh.read()
    except (OSError, ValueError):
        return None, ""
    lines = text.lstrip("﻿").splitlines()
    front = {}
    if not lines or not FRONT_EDGE.match(lines[0]):
        return front, text
    for raw in lines[1:]:
        if FRONT_EDGE.match(raw):
            break
        m = re.match(r"^([A-Za-z_]+)[ \t]*:[ \t]*(.*)$", raw)
        if m and m.group(1) not in front:      # the first one, as lib/team-common.sh reads it
            front[m.group(1)] = re.sub(r"[ \t]+#.*$", "", m.group(2)).strip().strip("\"'")
    return front, text


def none_if_null(value):
    return None if value in (None, "", "null", "~") else value


def state_of(team):
    front, _ = read_status(team.status)
    front = front or {}
    return front.get("phase") or "?", none_if_null(front.get("gate_passed"))


def next_action_of(team):
    front, _ = read_status(team.status)
    return ((front or {}).get("next_action") or "").strip()


def submitted(team, gate):
    """Whether the step before `gate` has handed it to the user: it ends by writing
    `next_action: /team-approve <gate> …`. Until then the artefact is still being written."""
    words = next_action_of(team).split()[:2]
    return len(words) >= 2 and words[0] == "/" + COMMAND and words[1] == gate


def waits_for(team, gate):
    phase, passed = state_of(team)
    return phase == GATES[gate]["phase"] and passed == GATES[gate]["before"]


def shape_of(content):
    """What TEAM.md lacks to be approved, as a list of reasons: the four H2 sections in order, no
    `TBD` outside `### Open questions`. The user judges the rest."""
    reasons = []
    heads = [l.strip() for l in content.splitlines() if re.match(r"^## [A-Z]", l)]
    missing = [h for h in SECTIONS if h not in heads]
    if missing:
        reasons.append("lacks the section" + ("s " if len(missing) > 1 else " ") + ", ".join(f"`{h}`" for h in missing))
    elif [h for h in heads if h in SECTIONS] != SECTIONS:
        reasons.append("has its four sections out of order (`## Need`, `## Acceptance`, `## Design`, `## Plan`)")
    section, tbd = None, []
    for n, l in enumerate(content.splitlines(), 1):
        if l.startswith("### "):
            section = l[4:].strip()
        elif l.startswith("## "):
            section = None
        if section != "Open questions" and re.search(r"\bTBD\b", l):
            tbd.append(str(n))
    if tbd:
        reasons.append(f"still says `TBD` outside `### Open questions` (line{'s' if len(tbd) > 1 else ''} {', '.join(tbd[:5])})")
    return reasons


def open_attempt(team):
    """The open attempt of a team, as lib/team-common.sh reads it: the highest ATT-nnnn whose
    manifest.json has `closed_at` null, or that has no manifest yet."""
    base = os.path.join(team.workbook, "attempts")
    try:
        names = sorted((n for n in os.listdir(base) if re.match(r"^ATT-[0-9]+$", n)), reverse=True)
    except OSError:
        return None
    for att in names:
        manifest = os.path.join(base, att, "manifest.json")
        if not os.path.isfile(manifest):
            return att
        try:
            with open(manifest, encoding="utf-8-sig", errors="replace") as fh:
                if json.load(fh).get("closed_at") is None:
                    return att
        except (OSError, ValueError, AttributeError):
            continue
    return None


TYPED = line.replace("`", "'")
JOURNAL_TAIL = f": the user typed `{TYPED}`"


def just_recorded(candidates, settled):
    """Among `candidates`, the team this very line was recorded for a moment ago, if any: its journal
    ends with the `/team-approve` line quoting it, its `updated_at` is a few seconds old, and
    `settled(team)` holds — the gate is passed, the marker is there. The second event of one typed
    line then answers as the first did, even when the state file of the session was lost. Asked only
    where judging would otherwise refuse or write twice: a team that still waits is judged."""
    now = datetime.datetime.now().astimezone()
    for team in candidates:
        front, text = read_status(team.status)
        if not front:
            continue
        last = next((l for l in reversed(text.splitlines()) if l.strip()), "")
        if " — /team-approve — " not in last or not last.endswith(JOURNAL_TAIL):
            continue
        try:
            at = datetime.datetime.fromisoformat((front.get("updated_at") or "").replace("Z", "+00:00"))
            if at.tzinfo is None:
                at = at.astimezone()
        except ValueError:
            continue
        if 0 <= (now - at).total_seconds() < REPLAY_SECONDS and settled(team):
            return team, last
    return None


def answer_again(found):
    team, last = found
    recorded(f"this line was recorded a moment ago for team `{team.name}` — the journal of `{team.rel}/STATUS.md` ends with "
             f"`{last.lstrip('- ')}` — and is not recorded twice. Tell the user it is recorded and what comes next "
             f"(`next_action` of that file).",
             f"already recorded a moment ago for {team.name}")


def listing(found, gate=None):
    """The teams of a refusal, each one that has not submitted `gate` yet said so."""
    return ", ".join(f"`{t.name}`" + (" (not submitted yet)" if gate and not submitted(t, gate) else "") for t in found)


def choose(candidates, waiting_for, none_reason, gate=None):
    if slug is not None:
        team = find_team(slug)
        if team is None:
            refuse(f"no workbook `workbooks/{slug}/STATUS.md` in `{ROOT}`: `/team-init {slug}` opens one.")
        return team
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        refuse(none_reason)
    refuse(f"several teams wait for {waiting_for}: {listing(candidates, gate)}. Name one: `{parsed} <slug>`.")


def plan_status(team, updates, outcome):
    """The new text of the team's STATUS.md — the front-matter keys of `updates` rewritten in place (a
    missing key is added before the closing `---`), `updated_at` set, one journal line appended, the
    rest and every line end kept as they are — or a refusal when the file has no front matter to
    write in. Nothing is written here: commit_status does."""
    front, text = read_status(team.status)
    if front is None or "phase" not in front:
        refuse(f"`{team.rel}/STATUS.md` has no readable front matter (`phase:` between two `---` lines).")
    lines = text.splitlines(keepends=True)
    first = lines[0].lstrip("﻿")
    eol = "\r\n" if first.endswith("\r\n") else "\n"
    close = next((i for i in range(1, len(lines)) if FRONT_EDGE.match(lines[i].rstrip("\r\n"))), None)
    if close is None:
        refuse(f"the front matter of `{team.rel}/STATUS.md` is not closed by a `---` line.")
    now = datetime.datetime.now().astimezone()
    updates = dict(updates, updated_at=now.isoformat(timespec="seconds"))
    for key, value in updates.items():
        for i in range(1, close):
            if re.match(r"^" + re.escape(key) + r"[ \t]*:", lines[i]):
                lines[i] = f"{key}: {value}{eol}"
                break
        else:
            lines.insert(close, f"{key}: {value}{eol}")
            close += 1
    while lines and not lines[-1].strip():
        lines.pop()
    if lines and not lines[-1].endswith(("\n", "\r")):
        lines[-1] += eol
    lines.append(f"- {now.strftime('%Y-%m-%d %H:%M')} — /team-approve — {outcome}{JOURNAL_TAIL}{eol}")
    return "".join(lines)


def commit_status(team, body):
    """Replace the file in one step; a STATUS.md that is a symbolic link keeps being one. Returns the
    error text when the file could not be written, None otherwise."""
    path = os.path.realpath(team.status)
    try:
        fd, tmp = tempfile.mkstemp(prefix=".STATUS.", dir=os.path.dirname(path))
        with os.fdopen(fd, "w", encoding="utf-8", errors="surrogateescape", newline="") as fh:
            fh.write(body)
        shutil.copymode(path, tmp)
        os.replace(tmp, path)
    except OSError as err:
        return str(err.strerror or err)
    return None


def write_status(team, updates, outcome):
    failed = commit_status(team, plan_status(team, updates, outcome))
    if failed:
        refuse(f"`{team.rel}/STATUS.md` could not be written ({failed}).")


# --- the team gate ---------------------------------------------------------------
if what in GATES:
    gate = GATES[what]
    label = f"gate {what}"
    everyone = teams()
    waiting = [t for t in everyone if waits_for(t, what)]
    rank = lambda g: -1 if g is None else (GATE_ORDER.index(g) if g in GATE_ORDER else -1)
    passed_it = lambda t: rank(state_of(t)[1]) >= rank(what)
    named = find_team(slug) if slug is not None else None
    if (named is not None and not waits_for(named, what)) or (slug is None and not waiting):
        again = just_recorded([named] if named is not None else everyone, passed_it)
        if again is not None:
            answer_again(again)
    others = "; ".join(f"`{t.name}`: phase {state_of(t)[0]}, gate_passed {state_of(t)[1] or 'null'}" for t in everyone)
    team = choose(waiting, label,
                  f"no team waits for {label} in `{ROOT}`" + (f" — {others}." if others else ": no workbook yet; `/team-init <slug>` opens one."),
                  gate=what)
    phase, passed = state_of(team)
    if not waits_for(team, what):
        if rank(passed) >= rank(what):
            refuse(f"{label} of `{team.name}` is already passed (`gate_passed: {passed}`). A change of what it validated goes through `/team-decision`.")
        refuse(f"`{team.name}` does not wait for {label}: its STATUS.md says `phase: {phase}`, `gate_passed: {passed or 'null'}`, "
               f"and {label} is approved in phase `{gate['phase']}` with `gate_passed: {gate['before'] or 'null'}`. "
               f"`/team-status {team.name}` says what comes next.")
    files = gate["files"]
    missing = []
    for name in files:
        try:
            with open(os.path.join(team.workbook, name), encoding="utf-8", errors="replace") as fh:
                content = fh.read()
        except (OSError, ValueError):
            missing.append(f"`{name}` (missing)")
            continue
        revise = re.search(r"^> To revise — (DEC-[0-9]+)", content, re.M)
        if not content.strip():
            missing.append(f"`{name}` (empty)")
        elif re.search(r"\{\{[A-Z_]+\}\}", content):
            missing.append(f"`{name}` (still holds a `{{{{…}}}}` placeholder of its template)")
        elif revise:
            missing.append(f"`{name}` (still marked `> To revise — {revise.group(1)}`: the step that revises it removes the line)")
        else:
            missing.extend(f"`{name}` ({why})" for why in shape_of(content))
    if missing:
        refuse(f"{label} of `{team.name}` validates {', '.join(missing)} in `{team.rel}/`: an approval needs the artefact it approves.")
    if not submitted(team, what):
        said = next_action_of(team)
        says = f"says `next_action: {said}`" if said else "has no `next_action`"
        refuse(f"{label} of `{team.name}` is not submitted yet: `{team.rel}/STATUS.md` {says}, and the step that "
               f"writes `{files[0]}` ends on `next_action: /team-approve {what} {team.name}` once it is complete "
               f"(`orkeon-bench check team {team.name}` green). Finish that step first; `/team-status {team.name}` says where the team stands.")
    write_status(team, {"phase": gate["to_phase"], "gate_passed": what, "next_action": f"{gate['next']} {team.name}"}, f"{label} passed")
    recorded(f"{label} of team `{team.name}` is recorded in `{team.rel}/STATUS.md` from the line the user typed — "
             f"`phase: {gate['to_phase']}`, `gate_passed: {what}`, `next_action: {gate['next']} {team.name}`. Never edit `gate_passed` yourself. "
             f"Tell the user it is recorded and what comes next.",
             f"{label} recorded for {team.name} — next: {gate['next']} {team.name}")

# --- the budget gate ------------------------------------------------------------
with_attempt = [t for t in teams() if open_attempt(t)]
team = choose(with_attempt, "a remote approval (each has an open attempt)",
              f"no team has an open attempt in `{ROOT}`: a paid run is approved inside the open attempt of its team "
              "(`orkeon-bench attempt open <slug>`, which `/team-build` and `/team-decision` run).")
attempt = open_attempt(team)
if attempt is None:
    refuse(f"`{team.name}` has no open attempt: a paid run is approved inside one (`orkeon-bench attempt open {team.name}`).")
again = just_recorded([team], lambda t: os.path.isfile(os.path.join(t.workbook, "attempts", attempt, "remote-approval.json")))
if again is not None:
    answer_again(again)
bench = shutil.which("orkeon-bench")
if bench is None:
    refuse("`orkeon-bench` is not on PATH, and it alone writes the approval marker (D19). Nothing was approved.")
# The journal line is prepared before the bench is asked: a STATUS.md that cannot take it refuses the
# approval here, while nothing is written — never a marker on disk with "nothing recorded" on screen.
journal = plan_status(team, {"next_action": f"/team-run {team.name}"},
                      f"budget: a remote run of {amount} USD approved in {attempt}")
# The budget gate is submitted as the team gate is (D36 amended, plan § 7.4 as superseded by D89–D95):
# `/team-run` prices the run with `orkeon-bench estimate` and ends on `next_action: /team-approve remote
# <usd> <slug>` — an L3 or L4 run, and the calls of a paid `decide` (D104); every remote deny of
# run-gate.sh sends there. Without it the run is not priced — the estimate refused, or was never made — and a line
# typed then approves a cost nobody stated; an amount under the estimate approves less than the run costs.
said = next_action_of(team)
words = said.split()
if len(words) < 3 or words[0] != "/" + COMMAND or words[1] != "remote":
    says = f"says `next_action: {said}`" if said else "has no `next_action`"
    refuse(f"the remote run of `{team.name}` is not priced yet: `{team.rel}/STATUS.md` {says}. `/team-run {team.name}` "
           f"prices it with `orkeon-bench estimate {team.name} --level L3|L4 [--decide <calls>]` (D104) and, under the cap, ends on `next_action: /team-approve remote "
           f"<usd> {team.name}`; type the approval then. Nothing was approved.")
priced = re.match(r"^\$?([0-9]+(?:\.[0-9]+)?)\$?$", words[2])
if not priced:
    refuse(f"`{team.rel}/STATUS.md` says `next_action: {said}`, whose `{words[2]}` is not an amount in USD: "
           f"`/team-run {team.name}` writes the estimate there. Nothing was approved.")
estimated = priced.group(1)
if float(amount) < float(estimated):
    refuse(f"{amount} USD is below the {estimated} USD `orkeon-bench estimate` priced the remote run of `{team.name}` at "
           f"(`next_action: {said}`): approve at least the estimate — `/team-approve remote {estimated} {team.name}` — "
           "or lower the cost first (fewer scenarios, `repeat`). Nothing was approved.")
try:
    limit = float(os.environ.get("HARNESS_TEAM_APPROVE_BENCH_TIMEOUT") or 20)
except ValueError:
    limit = 20.0
if not math.isfinite(limit) or limit <= 0:
    limit = 20.0
command = f"`orkeon-bench attempt approve {team.name} --usd {amount}`"
try:
    run = subprocess.run([bench, "attempt", "approve", team.name, "--usd", amount], cwd=team.base, capture_output=True,
                         text=True, timeout=limit, env=dict(os.environ, ORKEON_WORKSHOP=team.base))
except (OSError, subprocess.TimeoutExpired) as err:
    refuse(f"{command} did not answer ({type(err).__name__}). Nothing was approved by this line; "
           f"`{team.rel}/attempts/{attempt}/remote-approval.json` tells whether the bench wrote a marker all the same.")
# What the bench said: its `error: …` lines when it wrote some (whatever else reached stderr — a
# locale warning of the shell — is noise), else everything.
heard = [l.strip() for l in ((run.stderr or "").strip() or (run.stdout or "").strip()).splitlines() if l.strip()]
said = " ".join(" ".join([l for l in heard if l.lower().startswith("error:")] or heard).split())[:500]
if run.returncode != 0:
    refuse(f"{command} refused (exit {run.returncode}): {said or 'no message'}")
marker = f"{team.rel}/attempts/{attempt}/remote-approval.json"
if not os.path.isfile(os.path.join(team.workbook, "attempts", attempt, "remote-approval.json")):
    refuse(f"{command} exited 0 but `{marker}` does not exist. Nothing was approved.")
failed = commit_status(team, journal)
note = "" if not failed else f" The journal line could not be added to `{team.rel}/STATUS.md` ({failed}): the approval stands, say so."
recorded(f"a remote run of {amount} USD is approved for team `{team.name}` in its open attempt {attempt}: `orkeon-bench` wrote `{marker}` "
         f"from the line the user typed, against an estimate of {estimated} USD; `next_action: /team-run {team.name}`. Never write or edit that marker "
         f"yourself. The run gate now lets a remote run of this attempt through: tell the user, and that `/team-run {team.name}` runs it.{note}",
         f"remote run of {amount} USD approved for {team.name} in {attempt}" + (" (journal line not written)" if failed else ""))
PYEOF
exit 0
