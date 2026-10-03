#!/usr/bin/env bash
# PreToolUse Edit|Write hook — never write a key to disk.
#
# Plan § 2.9 and § 7.3: no key on disk, anywhere an agent might read it back
# (an agent with `file_read` reads the folders of its mount points), anywhere git
# might carry it. The hook denies an Edit/Write whose NEW content matches a key
# pattern when the target sits under teams/, workbooks/, tests/, settings/, a mount
# set mounts.<name>/, library/ or references/ (plan § 7.3, D28, D29, D33;
# HARNESS_SECRET_GUARD_SCOPE changes the list, where `*` stands for any part of one
# folder name). Everything else — a shell export in the user's terminal, a Studio
# profile — is outside its reach and is where keys belong.
#
# Placeholders pass: `<key>`, `${VAR}`, `{{KEY}}`, `xxx`, `...`, `REDACTED`,
# `changeme`, `your-key`, and an all-caps environment variable NAME as a value
# (`keyEnv: "ANTHROPIC_API_KEY"` names the variable, which is the convention).
# A false positive is lifted for one pattern with HARNESS_SECRET_ALLOW=<regex>;
# HARNESS_SECRET_GUARD=0 disables the hook. The deny never echoes the secret.
set -uo pipefail

INPUT=$(cat)
[ -n "$INPUT" ] || exit 0
[ "${HARNESS_SECRET_GUARD:-1}" = "0" ] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0

HOOK_INPUT="$INPUT" python3 <<'PYEOF'
import json, os, re, sys

try:
    d = json.loads(os.environ.get("HOOK_INPUT") or "{}")
except Exception:
    sys.exit(0)
if not isinstance(d, dict) or d.get("tool_name") not in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
    sys.exit(0)

ti = d.get("tool_input") or {}
path = ti.get("file_path") or ti.get("notebook_path") or ""
if not path:
    sys.exit(0)

scope = os.environ.get("HARNESS_SECRET_GUARD_SCOPE", "teams,workbooks,tests,settings,mounts.*,library,references")
roots = [s.strip() for s in scope.split(",") if s.strip()]
# A `*` stands for any part of one folder name: `mounts.*` is every mount set.
def folder(entry):
    return re.escape(entry).replace(r"\*", "[^/]*")
# Case-insensitive: on a Windows bind mount `Teams/` is `teams/`.
if roots != ["*"] and not re.search(r"(^|/)(" + "|".join(map(folder, roots)) + r")/", path, re.I):
    sys.exit(0)

pieces = []
if isinstance(ti.get("content"), str):
    pieces.append(ti["content"])
if isinstance(ti.get("new_string"), str):
    pieces.append(ti["new_string"])
if isinstance(ti.get("new_source"), str):
    pieces.append(ti["new_source"])
for e in ti.get("edits") or []:
    if isinstance(e, dict) and isinstance(e.get("new_string"), str):
        pieces.append(e["new_string"])
content = "\n".join(pieces)
if not content.strip():
    sys.exit(0)

PLACEHOLDER = re.compile(r"^(<[^>]*>|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\{\{[^}]*\}\}|x{3,}|\.{3}|\*{3,}|REDACTED|redacted|changeme|change-me|your[-_ ]?(api[-_ ]?)?key|TBD|TODO|none|null)[\"'`,;]*$")
ENV_NAME = re.compile(r"^[A-Z][A-Z0-9_]{2,}$")
# A value that is plainly a file path is not a credential (`token: tests/judges/quality.md`).
PATHLIKE = re.compile(r"^[\w./@+-]+/[\w.@+-]+\.(md|json|jsonl|ya?ml|txt|ts|js|cs|py|sh|eml|csv|pdf|docx|xlsx|db)$")

# (name, regex, value-group) — the value group, when present, is tested against
# the placeholder and env-name exemptions before the match counts.
PATTERNS = [
    ("OpenAI/Anthropic-style key (sk-…)", re.compile(r"\bsk-(?:ant-|proj-|live-)?[A-Za-z0-9_\-]{16,}"), None),
    ("GitHub token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}"), None),
    ("AWS access key id", re.compile(r"\bAKIA[0-9A-Z]{16}\b"), None),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{10,}"), None),
    ("Tavily key", re.compile(r"\btvly-[A-Za-z0-9\-]{16,}"), None),
    ("private key block", re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |)PRIVATE KEY-----"), None),
    ("Orkeon LLM key assignment", re.compile(r"ORKEON_Llm__ApiKey\s*[=:]\s*[\"']?([^\s\"',;]{8,})", re.I), 1),
    ("Azure DevOps PAT assignment", re.compile(r"AZURE_DEVOPS_PAT\s*[=:]\s*[\"']?([^\s\"',;]{8,})", re.I), 1),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"), None),
    # Key names as they come in YAML, env files and JSON (`"client_secret": "…"`), prefixed or not.
    ("generic credential assignment", re.compile(r"(?<![A-Za-z0-9])(?:[A-Za-z0-9]+[_\-])*(?:api[_\-]?key|apikey|secret|token|password|passwd|pwd|connection[_\-]?string)[\"']?\s*[=:]\s*[\"']?([A-Za-z0-9_\-\./+=:@]{20,})", re.I), 1),
]
extra = os.environ.get("HARNESS_SECRET_GUARD_EXTRA", "").strip()
if extra:
    try:
        PATTERNS.append(("custom pattern (HARNESS_SECRET_GUARD_EXTRA)", re.compile(extra), None))
    except re.error:
        pass
allow = os.environ.get("HARNESS_SECRET_ALLOW", "").strip()
allow_re = None
if allow:
    try:
        allow_re = re.compile(allow)
    except re.error:
        allow_re = None

hits = []
for name, rx, grp in PATTERNS:
    for m in rx.finditer(content):
        value = m.group(grp) if grp else m.group(0)
        if grp and (PLACEHOLDER.match(value) or ENV_NAME.match(value) or PATHLIKE.match(value)):
            continue
        if allow_re and allow_re.search(m.group(0)):
            continue
        line = content.count("\n", 0, m.start()) + 1
        hits.append((name, line))
        break

if not hits:
    sys.exit(0)

what = "; ".join(f"{n} at line {l} of the new content" for n, l in hits[:3])
reason = (f"secret-guard: refusing to write what looks like a secret into `{path}` ({what}). "
          "Keys never go on disk in the workshop (plan § 2.9): keep the value in the shell environment or in the Studio "
          "model profile, and write only the NAME of the variable that carries it (`keyEnv`, `ORKEON_Llm__ApiKey` as a "
          "name, a `<placeholder>`). If this is a false positive, tell the user: HARNESS_SECRET_ALLOW=<regex> lifts one "
          "pattern for the session.")
# ASCII-escaped JSON: valid whatever the locale of the session.
sys.stdout.write(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                                     "permissionDecision": "deny",
                                                     "permissionDecisionReason": reason}}) + "\n")
PYEOF
exit 0
