#!/usr/bin/env bash
# Stop hook — a team-* skill never ends without the team's STATUS.md moving.
#
# Plan § 2.2, § 4.2 ("each skill ... ends by updating STATUS.md — a hook checks
# it"), § 4.5, § 7.3. Nothing needed to resume may exist only in the
# conversation; STATUS.md is the state machine every team-* skill reads first.
#
# Reads the session transcript: the LAST invocation of a `team-*` skill (Skill
# tool use, or a `/team-*` slash command typed by the user), then looks, after
# it, for a write of a team's STATUS.md — `workbooks/<slug>/STATUS.md` (D29), or
# `library/tools/csharp/<Name>/workbook/STATUS.md` for a C# tool, the first tree
# segment of the path deciding as in lib/team-common.sh:
#   - an Edit or a Write whose file_path is such a STATUS.md;
#   - a Bash command that writes it (redirect, tee, sed -i, cp/mv onto it), the
#     script of /team-init (`team-init.sh`, which creates it), or one matching
#     HARNESS_STATUS_CHECK_BASH (extended regex, for a future `orkeon-bench`
#     writer). A read — `cat`, `orkeon-bench status` — is not an update.
# None found -> block once with a reminder. `team-status` only reads (plan
# § 4.3) and `team-approve` is recorded by its own hook before the model runs
# (team-approve.sh, D36): both are exempt (HARNESS_STATUS_CHECK_EXEMPT, comma list).
#
# Blocks once per invocation: a marker in /tmp remembers the invocation already
# blocked, and `stop_hook_active` closes the loop as well. HARNESS_STATUS_CHECK=0
# disables the hook. Exit 0 on anything unreadable.
set -uo pipefail

INPUT=$(cat)
[ -n "$INPUT" ] || exit 0
[ "${HARNESS_STATUS_CHECK:-1}" = "0" ] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0

HOOK_INPUT="$INPUT" python3 <<'PYEOF'
import json, os, re, sys

try:
    d = json.loads(os.environ.get("HOOK_INPUT") or "{}")
except Exception:
    sys.exit(0)
if not isinstance(d, dict) or d.get("stop_hook_active"):
    sys.exit(0)

transcript = d.get("transcript_path") or ""
if not transcript or not os.path.isfile(transcript):
    sys.exit(0)
session = d.get("session_id") or "unknown"
exempt = {s.strip() for s in os.environ.get("HARNESS_STATUS_CHECK_EXEMPT", "team-status,team-approve").split(",") if s.strip()}

SKILL_RE = re.compile(r"^team-[a-z0-9-]+$")
CMD_RE = re.compile(r"<command-name>\s*/?(team-[a-z0-9-]+)\s*</command-name>")
# A Bash command that WRITES a STATUS.md, not one that reads it.
BASH_WRITE_RE = re.compile(
    r"(>{1,2}\s*\S*STATUS\.md)"
    r"|(\btee\b[^|;&]*STATUS\.md)"
    r"|(\bsed\s+(-[A-Za-z]*i|--in-place)[^|;&]*STATUS\.md)"
    r"|(\b(cp|mv|install)\b[^|;&]*\s\S*STATUS\.md\s*($|[;&|]))"
    r"|(\bskills/team-init/scripts/team-init\.sh\b)"
)
# The STATUS.md of a team: in its workbook next to teams/ (D29), or in the workbook/ of a C# tool
# folder (library/tools/csharp/<Name>/). Of the tree segments of the path — teams, workbooks, tests,
# settings, compared without regard to case — the one that comes first decides, as in
# lib/team-common.sh: a STATUS.md shaped like a workbook in a team's tests
# (tests/alpha/fixtures/workbooks/x/STATUS.md) or in a team folder is not one. tests/ and settings/
# count only when the team exists next to them (teams/<slug>/ or workbooks/<slug>/).
TREES = ("teams", "workbooks", "tests", "settings")
TOOL_STATUS_RE = re.compile(r"(^|/)tools/csharp/[^/]+/workbook/STATUS\.md$", re.I)


def is_team_status(path):
    if not path:
        return False
    path = os.path.normpath(path if path.startswith("/") else "/" + path)
    low = path.lower()
    found = []
    for tree in TREES:
        k = low.find("/" + tree + "/")
        if k >= 0 and "/" in low[k + len(tree) + 2:]:
            found.append((k, tree))
    for k, tree in sorted(found):
        rest = path[k + len(tree) + 2:]
        slug = rest.split("/", 1)[0]
        if tree == "teams":
            return False
        if tree == "workbooks":
            return rest.lower() == slug.lower() + "/status.md"
        base = path[:k]
        if os.path.isdir(os.path.join(base, "teams", slug)) or os.path.isdir(os.path.join(base, "workbooks", slug)):
            return False
    return bool(TOOL_STATUS_RE.search(path))


extra = os.environ.get("HARNESS_STATUS_CHECK_BASH", "").strip()
try:
    EXTRA_RE = re.compile(extra) if extra else None
except re.error:
    EXTRA_RE = None


def texts(content):
    if isinstance(content, str):
        return [content]
    out = []
    for c in content or []:
        if isinstance(c, dict) and c.get("type") == "text" and isinstance(c.get("text"), str):
            out.append(c["text"])
    return out


last_skill = None      # (line index, name)
updated_after = False
seen = set()
idx = 0
try:
    fh = open(transcript, encoding="utf-8", errors="replace")
except OSError:
    sys.exit(0)
with fh:
    for line in fh:
        idx += 1
        if "team-" not in line and "STATUS.md" not in line and (EXTRA_RE is None):
            continue
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if not isinstance(e, dict) or e.get("isSidechain"):
            continue
        msg = e.get("message") or {}
        content = msg.get("content") if isinstance(msg, dict) else None
        if e.get("type") == "user":
            for t in texts(content):
                m = CMD_RE.search(t)
                if m:
                    last_skill = (idx, m.group(1))
                    updated_after = False
            continue
        if e.get("type") != "assistant" or not isinstance(content, list):
            continue
        for c in content:
            if not isinstance(c, dict) or c.get("type") != "tool_use":
                continue
            cid = c.get("id")
            if cid in seen:
                continue
            seen.add(cid)
            name = c.get("name") or ""
            inp = c.get("input") or {}
            if not isinstance(inp, dict):
                continue
            if name == "Skill":
                skill = str(inp.get("skill") or inp.get("command") or "").lstrip("/").split(" ")[0]
                if SKILL_RE.match(skill):
                    last_skill = (idx, skill)
                    updated_after = False
                continue
            if last_skill is None:
                continue
            if name in ("Edit", "Write", "MultiEdit"):
                fp = str(inp.get("file_path") or "").replace("\\", "/")
                if is_team_status(fp):
                    updated_after = True
            elif name == "Bash":
                cmd = str(inp.get("command") or "")
                if BASH_WRITE_RE.search(cmd) or (EXTRA_RE is not None and EXTRA_RE.search(cmd)):
                    updated_after = True

if last_skill is None or updated_after or last_skill[1] in exempt:
    sys.exit(0)

marker = f"/tmp/claude-statuscheck-{session}"
key = f"{last_skill[0]}:{last_skill[1]}"
try:
    if os.path.isfile(marker) and open(marker, encoding="utf-8").read().strip() == key:
        sys.exit(0)
    with open(marker, "w", encoding="utf-8") as out:
        out.write(key)
except OSError:
    pass

# Frozen literal (FROZEN-LITERALS.md): the front-matter keys of templates/STATUS.md, in order.
# `track` (D37) and `iteration` (D38) came later: a STATUS.md without them still counts, and
# reads as `full` and 0 — the hook checks that the file was written, never its keys.
KEYS = "phase, gate_passed, track, iteration, attempt, batch, verdict, next_action, updated_at"
reason = (f"status-check: /{last_skill[1]} ran this session and no STATUS.md of a workbook was updated since. "
          "Before stopping, update the team's STATUS.md, workbooks/<slug>/STATUS.md (front matter: " + KEYS + ", "
          "a missing track reading as full and a missing iteration as 0; "
          "plus one journal line `- YYYY-MM-DD HH:MM — /" + last_skill[1] + " — <outcome>`), "
          "or state in one line why nothing changed. Nothing needed to resume may live only in this conversation.")
# ASCII-escaped JSON: valid whatever the locale of the session.
sys.stdout.write(json.dumps({"decision": "block", "reason": reason}) + "\n")
PYEOF
exit 0
