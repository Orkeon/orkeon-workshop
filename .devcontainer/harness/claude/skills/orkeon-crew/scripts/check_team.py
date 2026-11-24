#!/usr/bin/env python3
"""Static check of an Orkeon team folder written in TypeScript (crew/crew.ork.ts, declarative shape).

`orkeon run --validate` loads the crew and resolves the tools, and `tsc` checks the types, but
neither sees the Studio layout, a deliverable aimed outside the writable mount points of the team
(it validates, then fails at run time), a Node API the Jint runtime lacks, a named LLM profile its
settings do not define, or folders, a Studio card and launchers that disagree with the
mount points of its mounts.json. This script catches those. Run it BEFORE `./run.sh --validate`;
both must pass.

Usage:
    check_team.py <team-dir> [--orkeon /path/to/orkeon]

With --orkeon the tool catalogue is read from `orkeon run --list-tools`; without it, the
catalogue is read from references/orkeon/orkeon-reference.md § 5 (the one copy, D92). Exit code 1 when an error is found.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

COWORKER_TOOLS = {"ask_question_to_coworker", "delegate_work_to_coworker"}
UNAVAILABLE_TOOLS = {"slack_send_message", "slack_read_messages", "spawn_agent", "code_interpreter", "progress_report"}

# (pattern, message) — what the declarative shape or the Jint runtime does not honour.
FORBIDDEN = [
    (r"\.withTaskTool\s*\(", "`.withTaskTool()` is removed from the DSL: name the tool in the task's .tools([...]), which adds it "
                             "to the agent's tools for that task"),
    (r"\bllm\s*\.\s*(openai|anthropic|azure|azureOpenAI|ollama|deepseek|gemini|google|mistral|groq|xai|openrouter|zai)\s*\(",
     "there is no per-vendor factory: the model comes from llm.default_, llm.model(\"…\") or llm.profile(\"…\")"),
    (r"\.llm\s*\(\s*[\"'`{]", "`.llm()` takes an LlmConfig, not a string or an object literal: llm.default_.with({ … })"),
    (r"\bcrew\.run\s*\(", "`crew.run()` selects the procedural engine: tasks are ignored — end with `globalThis.crew = crew;`"),
    (r"\.body\s*\(", "`.body()` is ignored by the declarative shape"),
    (r"\.(withState|onError|onCrewStart|onCrewComplete|onCrewError|onAgentStart|onAgentStop)\s*\(",
     "ignored by the declarative shape"),
    (r"^\s*///\s*<reference\s+orkeon-script", "the orkeon-script pragma fails tsc (TS1084) — remove it"),
    (r"\brequire\s*\(|\bprocess\.|\bfetch\s*\(|\bBuffer\.|\bsetTimeout\s*\(|\bconsole\.",
     "Node/DOM API: absent under Jint — use the built-in tools"),
    (r"^\s*import\s[^;]*from\s+[\"'](?!\.)", "only relative imports are bundled"),
    (r"globalThis\.inputs|\binputs\.", "`inputs` does not exist in the declarative shape — read the files of a read-only mount point"),
]
# The virtual roots of the runner, which no mount point of a team may take: `orkeon run` refuses the mount at
# start ("'/state' is a virtual root reserved by the runner", Orkeon 1.2.0, checked on the CLI: /crew, /llm-logs,
# /llm-mock, /llm-cassette, /sandbox, /state, /runs, /credentials), /script on the scripting path. The same list
# as the bench's (`RESERVED_ROOTS`, virtual-root.ts) and check_crew.py's.
RESERVED_ROOTS = ("/crew", "/script", "/llm-logs", "/llm-mock", "/llm-cassette", "/sandbox", "/state", "/runs", "/credentials")
# The Studio card of a team (`ConventionalNames.TeamSidecarFile`, Orkeon 1.2.0); `studio-team.json` before
# 1.0.0-rc.7, a name Orkeon Studio still reads and `orkeon-bench scaffold` carries over.
TEAM_CARD = "team.json"
LEGACY_TEAM_CARD = "studio-team.json"


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def error(self, where, message):
        self.errors.append(f"ERROR   {where}: {message}")

    def warn(self, where, message):
        self.warnings.append(f"WARNING {where}: {message}")


REFERENCE = Path(__file__).resolve().parents[4] / "references" / "orkeon" / "orkeon-reference.md"


def reference_catalogue(reference=REFERENCE):
    """The tool names of `references/orkeon/orkeon-reference.md` § 5 — the one copy of the catalogue
    (D92): every row of the section's tables whose first cell is one back-ticked name and that has a
    third cell (the arguments); the coworker tools and the conditional `brave_search` have none."""
    try:
        text = reference.read_text(encoding="utf-8")
    except OSError:
        sys.exit(f"tool catalogue not found: {reference} (references/orkeon/orkeon-reference.md § 5); pass --orkeon <binary> to read it from `orkeon run --list-tools`")
    names = set()
    inside = False
    for line in text.splitlines():
        if line.startswith("## "):
            inside = line.startswith("## 5")
            continue
        if not inside or not line.startswith("| `"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        m = re.fullmatch(r"`([a-z0-9_]+)`", cells[0])
        if m and len(cells) >= 3:
            names.add(m.group(1))
    if not names:
        sys.exit(f"no tool in § 5 of {reference}")
    return names


def load_catalogue(orkeon):
    if not orkeon:
        return reference_catalogue()
    out = subprocess.run([orkeon, "run", "--list-tools"], capture_output=True, text=True, check=False)
    names = {line.strip() for line in out.stdout.splitlines() if re.fullmatch(r"[a-z0-9_]+", line.strip())}
    if not names:
        sys.exit(f"`{orkeon} run --list-tools` returned no tool:\n{out.stdout}{out.stderr}")
    return names


def scan(source):
    """`source` twice, at the same length and lines: with its comments blanked, and with what its strings, template
    literals and regular expressions hold blanked too (their quotes kept). A light scan, not a TypeScript parser."""
    code, masked = list(source), list(source)

    def blank(start, end, comment):
        for k in range(start, end):
            if source[k] not in "\r\n":
                masked[k] = " "
                if comment:
                    code[k] = " "

    def string_end(k):
        """The position after the string that opens at `k`; a `${…}` of a template is skipped with its own strings."""
        quote = source[k]
        k += 1
        while k < len(source) and source[k] != quote:
            if source[k] == "\\":
                k += 2
            elif quote != "`" and source[k] == "\n":
                return k
            elif quote == "`" and source.startswith("${", k):
                k, depth = k + 2, 1
                while k < len(source) and depth:
                    if source[k] in "\"'`":
                        k = string_end(k)
                        continue
                    depth += {"{": 1, "}": -1}.get(source[k], 0)
                    k += 1
            else:
                k += 1
        return min(k + 1, len(source))

    i, previous = 0, ""
    while i < len(source):
        char = source[i]
        if source.startswith("//", i) or source.startswith("/*", i):
            line = source[i + 1] == "/"
            end = source.find("\n" if line else "*/", i + 2)
            end = len(source) if end < 0 else end if line else end + 2
            # The orkeon-script pragma is a comment the checks read.
            blank(i, end, not (line and "orkeon-script" in source[i:end]))
            i = end
            continue
        if char in "\"'`":
            end = string_end(i)
            blank(i + 1, end - 1, False)
            i, previous = end, char
            continue
        if char == "/" and (previous == "" or previous in "(,=:[!&|?{};+<>~^%*-" or
                            re.search(r"\breturn\s*$", source[max(0, i - 12):i])):
            regex = re.compile(r"/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n\[])+/").match(source, i)
            if regex:
                blank(i + 1, regex.end() - 1, False)
                i, previous = regex.end(), "/"
                continue
        if not char.isspace():
            previous = char
        i += 1
    return "".join(code), "".join(masked)


def strip_comments(source):
    """Blanks comments out, keeping the line count so reported line numbers stay true."""
    return scan(source)[0]


MOUNT_ROOT = re.compile(r"/[a-z0-9][a-z0-9_-]*")
MOUNT_ACCESSES = ("ro", "rw", "rwnd")
WINDOWS_PATH = re.compile(r"^[A-Za-z]:[\\/]|^\\\\")


def in_team(team, physical):
    """The folder of the team a physical path names (`input`, `data/in`), or None when it lies outside."""
    path = str(physical).strip().strip('"')
    if WINDOWS_PATH.match(path):
        return None
    if path.startswith("/"):
        try:
            rel = Path(os.path.normpath(path)).relative_to(team).as_posix()
        except ValueError:
            return None
    else:
        rel = os.path.normpath(path).replace("\\", "/")
    return None if rel in (".", "..") or rel.startswith("../") else rel


def mount_points(report, team):
    """The mount points of the team, as (root, access, folder of the team or None): from mounts.json,
    their source (D27), or else from the mounts of the Studio card (a team made in Orkeon Studio)."""
    source = team / "mounts.json"
    if source.is_file():
        try:
            data = json.loads(source.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            report.error("mounts.json", f"invalid JSON: {exc}")
            return "mounts.json", []
        if isinstance(data, dict) and "environments" in data:
            report.error("mounts.json", "'environments' is replaced by mount sets: the folder "
                                        "mounts.<name>/<team>/ next to teams/ — remove the key")
        entries = data.get("mounts") if isinstance(data, dict) else None
        points = []
        for index, entry in enumerate(entries if isinstance(entries, list) else []):
            entry = entry if isinstance(entry, dict) else {}
            root, access, default = entry.get("root"), entry.get("access"), entry.get("default")
            if not (isinstance(root, str) and MOUNT_ROOT.fullmatch(root) and access in MOUNT_ACCESSES
                    and isinstance(default, str) and default):
                report.error("mounts.json", f"mounts[{index}] is not a mount point {{root, access, default}} "
                                            "(`orkeon-bench mounts <team>` says why)")
                continue
            check_reach(report, team, "mounts.json", root, default)
            points.append((root, access, in_team(team, default)))
        return "mounts.json", points
    points = []
    card = team / TEAM_CARD
    if not card.is_file() and (team / LEGACY_TEAM_CARD).is_file():
        card = team / LEGACY_TEAM_CARD  # a team Orkeon Studio made before the card was renamed
    try:
        data = json.loads(card.read_text(encoding="utf-8")) if card.is_file() else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        data = {}  # the card check reports it
    for spec in (data.get("mounts") or []) if isinstance(data, dict) else []:
        parts = re.sub(r"^[0-9A-Z]{26}\|", "", str(spec)).rsplit(":", 2)
        if len(parts) == 3 and MOUNT_ROOT.fullmatch(parts[1]) and parts[2] in MOUNT_ACCESSES:
            check_reach(report, team, card.name, parts[1], parts[0])
            points.append((parts[1], parts[2], in_team(team, parts[0])))
    return card.name, points


def check_mounts(report, team, source, points):
    """The folders, the Studio card and the launchers agree with the mount points of the team (D27);
    no point takes a root of the runner, and /plugins, where orkeon-harness-run looks for plugins, is
    read-only."""
    if not points:
        report.error(source, "the team declares no mount point: write mounts.json (the points its need "
                             "calls for), then run `orkeon-bench scaffold <team>`")
        return
    folders = {folder for _, _, folder in points if folder}
    for root, access, folder in points:
        if root in RESERVED_ROOTS:
            report.error(source, f"{root} is reserved to the runner")
        if root == "/plugins" and access != "ro":
            report.error(source, "/plugins is where orkeon-harness-run loads plugins from when no --plugins names a folder: "
                                 "declare it \"access\": \"ro\", or its agents could drop code that the next run executes")
        if folder is None:
            continue
        if not (team / folder).is_dir():
            report.error(f"{folder}/", f"missing folder of the mount point {root}: run `orkeon-bench scaffold <team>`")
        elif access == "ro" and (team / folder / "appsettings.json").exists():
            report.error(f"{folder}/appsettings.json", f"settings under the mount point {root} are readable by any agent with file_read")
    for leftover, home in (("workbook", "workbooks"), ("tests", "tests")):
        if (team / leftover).is_dir() and leftover not in folders:
            report.warn(f"{leftover}/", f"the {leftover} of a team lives next to teams/, in {home}/<slug>/ (D29), not in the team folder")
    if source != "mounts.json":
        return
    try:
        card = team / TEAM_CARD
        data = json.loads(card.read_text(encoding="utf-8")) if card.is_file() else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        return  # the card check reports it
    mounts = [str(m) for m in (data.get("mounts") or [])] if isinstance(data, dict) else []
    declared = {root for root, _, _ in points}
    for root, access, folder in points:
        found = f"./{folder}:{root}:{access}" in mounts if folder else any(m.endswith(f":{root}:{access}") for m in mounts)
        if not found:
            report.error(TEAM_CARD, f"mounts lacks the mount point {root} ({access}) of mounts.json: "
                                             "run `orkeon-bench scaffold <team>`")
    for spec in mounts:
        parts = spec.rsplit(":", 2)
        if len(parts) == 3 and parts[1] not in declared:
            report.error(TEAM_CARD, f"mounts names {parts[1]}, which mounts.json does not declare: "
                                             "run `orkeon-bench scaffold <team>`")
    for launcher in ("run.sh", "run.cmd"):
        path = team / launcher
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if ORKEON_LAUNCHER in text:
            continue  # reported with the launchers
        closing = '^"' if launcher == "run.cmd" else '"'
        for root, access, _ in points:
            if f':{root}:{access}{closing}' not in text:
                report.error(launcher, f"does not bind the mount point {root} ({access}): it is older than "
                                       "mounts.json — run `orkeon-bench scaffold <team>`")


def writable_roots(points):
    return [root for root, access, _ in points if access != "ro"]


def flatten_settings(value, key=""):
    """The entries of a settings file as .NET reads them: `:`-joined keys; an empty object or a
    null keeps the key without a value (None), an empty array holds "" (checked on Orkeon main)."""
    if isinstance(value, dict) or isinstance(value, list):
        items = list(value.items()) if isinstance(value, dict) else [(str(i), v) for i, v in enumerate(value)]
        if not items:
            return [(key, "" if isinstance(value, list) else None)] if key else []
        out = []
        for name, child in items:
            out += flatten_settings(child, f"{key}:{name}" if key else name)
        return out
    if not key:
        return []
    return [(key, value)]


def is_local_url(url):
    """The host of a base URL is this machine, the Docker host or one of HARNESS_LOCAL_LLM_HOSTS."""
    from urllib.parse import urlsplit
    text = url.strip()
    try:
        host = (urlsplit(text if "://" in text else "http://" + text).hostname or "").lower()
    except ValueError:
        return False
    extra = {h.strip().lower().strip("[]") for h in re.split(r"[,\s]+", os.environ.get("HARNESS_LOCAL_LLM_HOSTS", "")) if h.strip()}
    return (host in {"localhost", "::1", "0.0.0.0", "host.docker.internal"} or host in extra
            or re.fullmatch(r"127(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}", host) is not None)

# What the agents of a team reach, and what Orkeon reads on its own (review of 2026-10-02, completed
# for D40 on 2026-10-03). At the root of a team folder, crew/ is the definition of the team, and Orkeon
# looks for settings in appsettings/ — there and in every folder above; it read _shared/ too before 1.0.0-rc.7
# (`RunnerSettings.FindSettingsByWalkingUp`, Orkeon 1.2.0), and the name stays kept, as in the bench. A folder named
# agents or tasks is free: Orkeon Studio and `orkeon run` read crew/ first, whatever the root holds
# (Orkeon main at fb26364, STUDIO-59).
RESERVED_TEAM_FOLDERS = ("crew", "appsettings", "_shared", "host")
CREW_FOLDER, SETTINGS_FOLDERS, HOST_FOLDER = RESERVED_TEAM_FOLDERS[0], RESERVED_TEAM_FOLDERS[1:3], RESERVED_TEAM_FOLDERS[3]
# The one file Orkeon finds on its own walking up from a crew folder: a `_shared/appsettings.json` is no longer read.
SETTINGS_WALK_CANDIDATES = ("appsettings/appsettings.json",)
SETTINGS_UNREAD = ("Orkeon no longer reads a _shared/appsettings.json (since 1.0.0-rc.7; `orkeon run` looks for "
                   "appsettings/appsettings.json alone): this file has no effect — remove it: a team's own settings live in "
                   "settings/<slug>/appsettings.json (D33)")
# The folders of a workshop that a mount point may neither hold nor lie in, and what they would expose.
WORKSHOP_FOLDERS = (("settings", "the settings of every team"),
                    ("workbooks", "the workbooks of every team, with the approvals of paid runs"),
                    ("tests", "the tests of every team, with their budgets"),
                    (".claude", "the harness"),
                    ("library", "the workshop's library, which other teams are built from"),
                    ("references", "the reference documents Claude builds teams from"),
                    (".devcontainer", "the workshop's container configuration, which runs at its next start"),
                    (".git", "the workshop's git repository, whose hooks run at the next git command"))
# The header of the launchers Orkeon writes — `orkeon forge promote`, and Studio's wizard when it adopts a
# team (TeamLauncherScript.HeaderMarker; up to 1.0.0-rc.4 the header named the Forge session). Studio
# writes such launchers again and leaves every other as it is (Orkeon main at fb26364, STUDIO-63): the
# launchers of `orkeon-bench scaffold` never carry it.
ORKEON_LAUNCHER = "Generated by Orkeon Forge"
ORKEON_WROTE = ("Orkeon wrote this launcher (`orkeon forge promote`, or Studio adopting the team), and Studio writes it "
                "again at each change of the team's folders or model setting: it knows neither TEAM_ENV nor "
                "settings/<slug>/ — put the folders in mounts.json, then run `orkeon-bench scaffold <team>`")
# The two ways a stray settings file takes over a run (orkeon-bench doctor says the same).
SETTINGS_INSTEAD = ("Orkeon reads this file instead of the machine's settings for every run that names no settings file "
                    "(Orkeon Studio names none for a team without a settings file of its own, unless an Expert pins one) — remove it: a team's own settings live in "
                    "settings/<slug>/appsettings.json (D33)")
SETTINGS_BENEATH = ("Orkeon no longer reads the appsettings files of the working directory (main at a2bb6c3): this file "
                    "has no effect on a run of the team, but it is the settings file of `orkeon run --list-tools`, "
                    "`orkeon doctor`, `orkeon email`, `orkeon drive` and `orkeon mcp serve` started from the team folder — remove it: "
                    "a team's own settings live in settings/<slug>/appsettings.json (D33)")
# The variables a settings file must not name as a model key (Llm:ApiKeyEnvVar): the key would go to that
# provider's endpoint — a GitHub token, Claude Code's own credentials.
FOREIGN_KEY_VARIABLES = re.compile(r"(GH|GITHUB)_[A-Z_]*TOKEN|GITHUB_PAT|CLAUDE_CODE_[A-Z_]*|ANTHROPIC_AUTH_TOKEN")

# The settings Orkeon refuses to start on when they hold a variable reference, `${…}` anywhere in the value or
# `%NAME%` as the whole value: it expands none and would pass the text as written (`$NAME` passes). From
# `SettingPlaceholders` and `SettingPlaceholder` (Orkeon 1.2.0), keys compared ignoring case, `*` one segment.
PLACEHOLDER_SETTINGS = tuple(p.lower().split(":") for p in (
    "MCP:Servers:*:Env:*", "Llm:ApiKey", "Llm:Profiles:*:ApiKey", "Orkeon:TypeSafe:ApiKey", "Orkeon:Liquid:ApiKey",
    "Orkeon:Kev:ApiKey", "Secrets:*", "BRAVE_API_KEY",
    "MCP:Servers:*:Command", "MCP:Servers:*:Args:*", "MCP:Servers:*:Url",
    "MCP:Servers:*:Auth:TokenUrl", "MCP:Servers:*:Auth:DeviceAuthorizationUrl", "MCP:Servers:*:Auth:ClientSecretEnv",
    "Orkeon:Redis:ConnectionString", "Orkeon:Sqlite:ConnectionString", "Orkeon:Checkpointing:ConnectionString",
    "Orkeon:Embeddings:ApiKey", "Orkeon:Embeddings:Endpoint", "Orkeon:Embeddings:ApiKeyEnvVar",
    "Orkeon:Host:Api:Security:ApiKeySecretNames:*",
    "RaggableTree:Embedding:ApiKey", "Orkeon:Pinecone:ApiKey", "Orkeon:LanceDb:ApiKey",
    "Llm:BaseUrl", "Llm:Profiles:*:BaseUrl", "RaggableTree:Embedding:BaseUrl", "Orkeon:ChromaDb:BaseUrl",
    "Orkeon:Pinecone:Host", "Orkeon:LanceDb:Endpoint", "Orkeon:Rag:WebFallback:Endpoint", "Telemetry:OtlpEndpoint",
    "Security:Vault:AzureKeyVaultUri", "A2A:Security:AzureAD:Authority", "A2A:Security:Oidc:Authority",
    "Llm:ApiKeyEnvVar", "Llm:Profiles:*:ApiKeyEnvVar", "Orkeon:Rag:WebFallback:ApiKeyEnvVar",
    "Orkeon:Host:Discord:TokenEnvironmentVariable", "A2A:Security:ApiKeySecretNames:*", "Orkeon:Encryption:SecretName",
    "Orkeon:Tools:GitHub:Token", "Orkeon:Tools:GitHub:TokenVariable",
    "Orkeon:TypeSafe:BaseUrl", "Orkeon:Liquid:BaseUrl", "Orkeon:Kev:BaseUrl",
    "Orkeon:TypeSafe:ApiKeyEnvVar", "Orkeon:Liquid:ApiKeyEnvVar", "Orkeon:Kev:ApiKeyEnvVar"))
# The fields that set an e-mail or drive account aside, with its problem, when they hold one (not a start refusal).
ACCOUNT_PLACEHOLDER = re.compile(r"orkeon:tools:(email:accounts:[^:]+:(incoming:host|outgoing:host|auth:passwordenvvar|auth:clientsecretenvvar)"
                                 r"|drive:accounts:[^:]+:auth:clientsecretenvvar)")
# The vendor hosts of Orkeon's reading of a model address (`LlmEndpointReading`, Orkeon 1.2.0): under an
# `/anthropic` path, any of them but Anthropic's own refuses the start.
VENDOR_HOSTS = ("together.xyz", "dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com", "maas.aliyuncs.com", "deepseek.com",
                "moonshot.cn", "moonshot.ai", "mistral.ai", "generativelanguage.googleapis.com", "api.x.ai", "api.minimax.io",
                "api.minimaxi.com", "huggingface.co", "hf.co", "api.z.ai", "bigmodel.cn", "openrouter.ai", "mammouth.ai", "openai.com")


def is_variable_reference(value):
    return isinstance(value, str) and (re.search(r"\$\{[^}]*\}", value) is not None
                                       or re.fullmatch(r"%[A-Za-z_][A-Za-z0-9_()]*%", value.strip()) is not None)


def refuses_placeholder(lowered):
    segments = lowered.split(":")
    return any(len(p) == len(segments) and all(a in ("*", b) for a, b in zip(p, segments)) for p in PLACEHOLDER_SETTINGS)


def base_url_refusal(url):
    """Why Orkeon refuses a model address at start (Orkeon 1.2.0), or None: not an absolute http(s) address,
    or a vendor host under an `/anthropic` path."""
    from urllib.parse import urlsplit
    text = url.strip()
    try:
        parts = urlsplit(text)
        host = (parts.hostname or "").lower()
    except ValueError:
        return "it is not an absolute http:// or https:// address"
    if parts.scheme.lower() not in ("http", "https") or not host:
        return "it is not an absolute http:// or https:// address — write its scheme (http://localhost:11434)"
    vendor = "azure" in host or ".cognitiveservices." in host or any(host == d or host.endswith("." + d) for d in VENDOR_HOSTS)
    if vendor and any(s.lower() == "anthropic" for s in parts.path.split("/")):
        return "a vendor's /anthropic path speaks another dialect — drop the path"
    return None



def lexical(path):
    """`path` normalised as written — `.`, `..`, repeated and trailing separators — with no symbolic
    link followed (a leading `//`, which os.path.normpath keeps, names `/` here)."""
    path = os.path.normpath(path)
    return "/" + path.lstrip("/") if path.startswith("//") else path


def reach_problem(root, path, shown, team, workshops, home, machine, proc):
    """Why no mount point may be bound to `path` (absolute, normalised, in its own spelling; printed as
    `shown`) for the team folder `team`, or None; and whether `path` lies in the team. `workshops`: the
    workshop of the team, then the configured one; `home` and `machine` (the machine's Orkeon settings)
    may be None; `proc`: whether /proc is guarded. Every comparison ignores case."""
    def within(folder, candidate):
        """True when `candidate` is `folder` or lies below it."""
        f, c = folder.lower(), candidate.lower()
        return c == f or c.startswith(f.rstrip("/") + "/")

    def below(folder, candidate):
        """The segments of `candidate` below `folder`, in the spelling of `candidate`."""
        return [s for s in candidate.split("/") if s][len([s for s in folder.split("/") if s]):]

    def holds(what):
        return f"{root} is bound to {shown}, which holds {what}: its agents would reach it — bind a folder of its own"

    def lies_in(what):
        return f"{root} is bound to {shown}, inside {what}: its agents would reach it — bind a folder of its own"

    def join(folder, name):
        return folder.rstrip("/") + "/" + name

    slug = team.rsplit("/", 1)[-1].lower()
    if within(team, path):
        inside = below(team, path)
        if not inside:
            return (f"{root} is bound to the team folder itself: its agents would reach crew/, the launchers and mounts.json, "
                    "and on a writable point leave an appsettings.json that the next run reads — bind a sub-folder such as "
                    f"./{root[1:]}"), True
        first, inside = inside[0].lower(), "/".join(inside)
        if first == CREW_FOLDER:
            return (f"{root} is bound to ./{inside}, inside crew/: its agents would reach the definition of the team, and on a "
                    "writable point change it or leave an appsettings.json that the next run reads — bind a folder of its own"), True
        if first == HOST_FOLDER:
            return (f"{root} is bound to ./{inside}, inside host/: its agents would reach the C# host of the team, its sources "
                    "and its build output — bind a folder of its own"), True
        if first in SETTINGS_FOLDERS:
            return (f"{root} is bound to ./{inside}: Orkeon looks for {first}/appsettings.json in the team folder when it searches "
                    "for settings above crew/, so that name is kept for settings — name the folder otherwise"), True
        return None, True
    # Open folders are refused only when the point holds them, closed ones also when it lies inside.
    guarded = [("/", "the whole file system", False)]
    if home:
        guarded.append((home, "the home folder, with the settings and credentials of the machine's tools", False))
    guarded += [(workshop, "the workshop", False) for workshop in workshops]
    guarded += [(join(workshop, "teams"), "every team", False) for workshop in workshops]
    guarded.append((team, "the team folder", False))
    guarded += [(join(workshop, name), what, True) for workshop in workshops for name, what in WORKSHOP_FOLDERS]
    names = team.split("/")
    guarded += [("/".join(names[:end]) + "/" + name, "a folder where Orkeon looks for the settings of every run above the crews",
                 True) for end in range(len(names) - 1, 0, -1) for name in SETTINGS_FOLDERS]
    if home:
        guarded.append((join(home, "AppData"), "the user's application data, with Orkeon Studio's settings and the tokens of "
                                               "its mail accounts", True))
    if machine:
        guarded.append((machine, "the machine's Orkeon settings and the OAuth tokens of its mail accounts", True))
    if proc:
        guarded.append(("/proc", "the environment of every process, with the key of the model", True))
    for folder, what, _ in guarded:
        if within(path, folder):
            return holds(what), False
    for folder, what, closed in guarded:
        if closed and within(folder, path):
            return lies_in(what), False
    hidden = below(home, path)[:1] if home and within(home, path) else []
    if hidden and hidden[0].startswith("."):
        return lies_in("a hidden folder of the home folder, where tools keep their settings and credentials"), False
    for workshop in workshops:
        rest = [s.lower() for s in below(workshop, path)] if within(workshop, path) else []
        if len(rest) >= 2 and rest[0] == "teams" and rest[1] != slug:
            return (f"{root} is bound to {shown}, inside another team: the agents of a team never reach the folders of "
                    "another — share through a folder of its own"), False
        if rest[:1] and rest[0].startswith("mounts."):
            if len(rest) == 1:
                return holds("the mount sets of every team"), False
            if rest[1] != slug:
                return (f"{root} is bound to {shown}, inside a mount set of another team: the agents of a team never reach "
                        "the folders of another — share through a folder of its own"), False
    return None, False


def check_reach(report, team, source, root, path):
    """What the agents of the team reach through one mount point of its own folders (D40; the same rule
    as orkeon-bench's domain/mounts/mount-reach.ts and the C# templates' Mounts/MountsFile.cs). Orkeon's
    VFS gives them the folder behind the point and nothing else. Refused: the team folder, crew/ and the
    folders Studio or the settings search reads at its root; outside the team, a folder that holds the
    team, a workshop (the team's, two levels up, and ORKEON_WORKSHOP) or the home folder, or that lies
    in what a workshop keeps for every team, in a settings folder above the team, in a hidden folder of
    the home folder, the user's AppData, the machine's Orkeon settings or /proc, or in another team or
    its mount set (reach_problem). Any other folder outside the team passes with a warning: Orkeon
    Studio launches the team only when it is declared in its Authorized folders. A Windows path under
    <drive>:/Users/<name> is judged against that user's folders (workshop <name>/Orkeon), then warns.
    Containment ignores case, as a Windows host folder does, and a folder name ending with a dot or a
    space is refused, since Windows drops them (./crew. is crew/ there). Paths are judged as written —
    normalised lexically, a Windows one below its drive — and a symbolic link is not followed."""
    trailing = next((s for s in re.split(r"[\\/]", str(path).strip('"')) if s not in (".", "..") and s[-1:] in (".", " ")), None)
    if trailing is not None:
        report.error(source, f"{root} is bound to {path}, whose folder name \"{trailing}\" ends with a dot or a space: Windows drops "
                             "them, so on the host Orkeon Studio and run.cmd would bind another folder — name the folder without them")
        return
    text = str(path).strip().strip('"')
    team_dir = lexical(os.path.abspath(team))
    if WINDOWS_PATH.match(text):
        spelled = text.replace("\\", "/")
        spelled = spelled[:2] + lexical(spelled[2:]).rstrip("/") if re.match(r"[A-Za-z]:/", spelled) else spelled.rstrip("/")
        user = re.fullmatch(r"([a-z]):/users/([^/]+)(/.*)?", spelled.lower())
        if user:
            home = f"{user.group(1)}:/users/{user.group(2)}"
            team_there = f"{home}/orkeon/teams/{os.path.basename(team_dir).lower()}"
            problem, _ = reach_problem(root, spelled, text, team_there, [f"{home}/orkeon"], home, None, False)
            if problem:
                report.error(source, problem)
                return
        report.warn(source, f"{root} is bound to the Windows path {text}: the container cannot bind it, and Orkeon "
                            "Studio only when it is declared, spelled exactly, in its Authorized folders")
        return
    physical = lexical(text if text.startswith("/") else os.path.join(team_dir, text))
    workshops = [os.path.dirname(os.path.dirname(team_dir))]
    configured = os.environ.get("ORKEON_WORKSHOP", "").strip()
    if configured and lexical(configured).lower() != workshops[0].lower():
        workshops.append(lexical(configured))
    home = os.path.expanduser("~")
    config = os.environ.get("XDG_CONFIG_HOME", "").strip()
    problem, inside = reach_problem(root, physical, physical, team_dir, workshops, lexical(home) if home != "~" else None,
                                    lexical(os.path.join(config, "Orkeon")) if config else None, True)
    if problem:
        report.error(source, problem)
    elif not inside:
        report.warn(source, f"{root} is bound to {physical}, outside the team folder: Orkeon Studio launches the team only when "
                            "this folder is declared, spelled exactly, in its Authorized folders (a container path never matches there)")


def check_walk_up_settings(report, team):
    """A settings file Orkeon finds above the team on its own — `appsettings/appsettings.json` in `teams/`,
    in the workshop or higher (a `_shared/appsettings.json` is no longer read) — replaces the machine's settings
    for every run that names none, and Orkeon Studio names none for a team without a settings file of its own, unless an Expert pins one."""
    folder = Path(os.path.abspath(team)).parent
    while True:
        for candidate in SETTINGS_WALK_CANDIDATES:
            if (folder / candidate).is_file():
                report.error(str(folder / candidate), SETTINGS_INSTEAD)
        if folder.parent == folder:
            return
        folder = folder.parent


# The thinking levels Orkeon:Decision:Effort:Levels may list, cheapest first and lower case (Orkeon 1.4.0).
HOST_LEVEL_ORDER = ("low", "medium", "high", "xhigh", "max")


def check_settings_content(report, where, entries):
    """What a team's settings file must not hold: a secret (keys stay in the environment), a machine-wide
    setting that opens code execution, a weakened protection of the web tools (security.md § 2, § 4, § 7),
    mount points or allowed folders that mounts.json does not judge, a token store moved out of the
    machine's folder, a variable reference or a model address Orkeon refuses at start. Keys compare ignoring
    case, as .NET reads them."""
    ladder = [(k, v) for k, v in entries if re.fullmatch(r"orkeon:decision:route:ladder:\d+", k.lower())]
    if len(ladder) == 1:
        report.error(where, "Orkeon:Decision:Route:Ladder names one profile, and a route needs two or more, cheapest first: "
                            "Orkeon refuses to start")
    rungs = [str(v).strip().lower() for _, v in ladder]
    for (key, value), rung in zip(ladder, rungs):
        if not rung:
            report.error(where, f"{key} is blank: write a profile name — Orkeon refuses to start")
        elif rung == "auto":
            report.error(where, f"{key} is 'auto', the name of the route itself: write a profile name — Orkeon refuses to start")
    if len({r for r in rungs if r}) < len([r for r in rungs if r]):
        report.error(where, "Orkeon:Decision:Route:Ladder names a profile more than once: each rung is a different profile "
                            "— Orkeon refuses to start")
    levels = [(k, v.strip() if isinstance(v, str) else v) for k, v in entries
              if re.fullmatch(r"orkeon:decision:effort:levels:\d+", k.lower())]
    for key, value in levels:
        if value not in HOST_LEVEL_ORDER:
            report.error(where, f"{key} is '{value}', which is not a thinking level: write one of {', '.join(HOST_LEVEL_ORDER)} "
                                "(lower case) — Orkeon refuses to start")
    known = [HOST_LEVEL_ORDER.index(v) for _, v in levels if v in HOST_LEVEL_ORDER]
    if len(set(known)) < len(known):
        report.error(where, "Orkeon:Decision:Effort:Levels names a level more than once — Orkeon refuses to start")
    elif known != sorted(known):
        report.error(where, "Orkeon:Decision:Effort:Levels is not cheapest first: list the levels in the order low, medium, "
                            "high, xhigh, max — Orkeon refuses to start")
    for key, value in entries:
        lowered = key.lower()
        last = lowered.rsplit(":", 1)[-1].replace("_", "")
        if re.fullmatch(r"(llm|orkeon:decision):profiles:auto(:.*)?", lowered):
            report.error(where, f"{key}: 'auto' is a reserved profile name (the profile System One picks) — Orkeon refuses "
                                "to start; name the profile otherwise")
        if re.fullmatch(r"llm(:profiles:[^:]+)?:thinking:effort", lowered) and str(value).strip().lower() == "auto":
            report.error(where, f"{key} is 'auto', which only a crew writes (thinking: {{ effort: auto }}): write a level here, "
                                "and list the levels System One may pick under Orkeon:Decision:Effort:Levels — Orkeon refuses "
                                "to start")
        valued = (isinstance(value, str) and value.strip() != "") or (isinstance(value, (int, float)) and not isinstance(value, bool))
        if is_variable_reference(value) and refuses_placeholder(lowered):
            report.error(where, f"{key} holds a variable reference, which Orkeon never expands: it refuses to start — write "
                                "the value (the variable's name alone for an …EnvVar), or set "
                                f"ORKEON_{key.replace(':', '__')} in the environment")
        elif is_variable_reference(value) and ACCOUNT_PLACEHOLDER.fullmatch(lowered):
            report.warn(where, f"{key} holds a variable reference, which Orkeon never expands: the account is set aside — "
                               "write the host, or the variable's name alone")
        if (lowered == "llm:baseurl" or re.fullmatch(r"llm:profiles:[^:]+:baseurl", lowered)) and isinstance(value, str) \
                and value.strip() and not is_variable_reference(value) and base_url_refusal(value):
            report.error(where, f"{key} is '{value.strip()}', which Orkeon refuses at start: {base_url_refusal(value)}")
        if lowered == "llm:apikey" or re.fullmatch(r"llm:profiles:[^:]+:apikey", lowered):
            if lowered != "llm:apikey" and valued:
                report.error(where, f"{key} holds a key: keys never go to disk — name the variable that holds it in "
                                    f"{key[:-len('ApiKey')]}ApiKeyEnvVar, or pass it from the environment")
        elif lowered.startswith("secrets:") and valued:
            report.error(where, f"{key} holds a value: the secret chain reads ORKEON_{key.split(':', 1)[1].upper()} from the "
                                "environment — keys never go to disk")
        elif re.search(r"(apikey|password|secret|token)$", last) and valued:
            report.error(where, f"{key} holds a value: keys never go to disk — name the variable that holds it (…EnvVar) "
                                "or pass it from the environment")
        elif "connectionstring" in lowered and isinstance(value, str) and re.search(r"(?i)\b(password|pwd)\s*=\s*[^;\s]", value):
            report.error(where, f"{key} carries a password: keys never go to disk — use a variable, or a C# tool that holds "
                                "the credentials")
        if lowered.startswith("orkeon:tools:shell:"):
            report.error(where, f"{key}: the shell settings are machine-wide only — AllowInterpreters, AllowedCommands and "
                                "ExtraAllowedCommands open code execution to every agent holding shell_command, and Confinement belongs to "
                                "the machine that runs the team (security.md § 7)")
        if lowered.startswith(("orkeon:filesystem:mounts:", "orkeon:filesystem:internalmounts:")):
            report.error(where, f"{key}: a team's mount points belong in mounts.json, where what its agents reach is checked — "
                                "Orkeon mounts every entry of a settings file for each run that reads it")
        if lowered.startswith("pathsecurity:additionalalloweddirectories:"):
            report.error(where, f"{key} widens the folders Orkeon lets mount points reach — a team's folders are declared in "
                                "mounts.json")
        if lowered == "orkeon:tools:email:credentialsdirectory" and valued:
            report.error(where, f"{key} moves the OAuth tokens of the mail accounts out of the machine's folder, where no mount "
                                "point may reach them")
        if lowered == "orkeon:tools:drive:credentialsdirectory" and valued:
            report.error(where, f"{key} moves the OAuth tokens of the drive accounts out of the machine's folder, where no mount "
                                "point may reach them")
        if lowered in ("security:url:blockprivateips", "security:url:resolvedns") and str(value).strip().lower() == "false":
            report.error(where, f"{key} is false: the web tools would reach the private network, the host and the cloud "
                                "metadata (security.md § 4)")
        if lowered == "orkeon:guardian:enabled" and str(value).strip().lower() == "false":
            report.error(where, f"{key} is false: no agent turn and no tool call would go through the Guardian, which blocks "
                                "injected instructions and dangerous tool arguments (security.md § 5)")
        if lowered == "security:prompt:policy" and str(value).strip().lower() in ("none", "warn"):
            report.error(where, f"{key} is {value}: an injected instruction in a task or an earlier output would no longer "
                                "fail the task (security.md § 5)")
        if lowered in ("security:prompt:enableexfiltrationdetection",) and str(value).strip().lower() == "false":
            report.error(where, f"{key} is false: the Guardian would stop looking for data sent out (security.md § 5)")
        if lowered == "security:toolresults:policy" and str(value).strip().lower() == "none":
            report.error(where, f"{key} is None: tool results — mail, web pages, files — would reach the model unscanned "
                                "(security.md § 5)")
        if re.fullmatch(r"security:toolresults:trustedtools:\d+", lowered) and valued:
            report.warn(where, f"{key} trusts {value}: its results reach the model unscanned — trust no tool that reads "
                               "untrusted input (security.md § 5)")
        if lowered.endswith(":apikeyenvvar") and lowered.startswith("llm:") and isinstance(value, str) \
                and FOREIGN_KEY_VARIABLES.fullmatch(value.strip().upper()):
            report.error(where, f"{key} names {value.strip()}: that key would be sent to the model's endpoint — name the "
                                "variable that holds the model's own key")
        if re.fullmatch(r"orkeon:tools:email:accounts:[^:]+:send:allowedrecipients:\d+", lowered) and str(value).strip() == "*":
            report.warn(where, f"{key} is '*': the account may send to anyone — name the recipients the need allows "
                               "(security.md § 3)")
        if re.fullmatch(r"orkeon:tools:drive:accounts:[^:]+:share:allowedrecipients:\d+", lowered) and str(value).strip() == "*":
            report.warn(where, f"{key} is '*': the drive account may share with anyone — name the recipients the need allows "
                               "(security.md § 3)")


def machine_settings():
    """The entries of the machine's settings file, which Orkeon reads for a run that names none:
    $HARNESS_ORKEON_SETTINGS when the harness names another one (as run-gate.sh), else
    ${XDG_CONFIG_HOME:-~/.config}/Orkeon/appsettings.json; none when it is absent or not strict JSON."""
    path = os.environ.get("HARNESS_ORKEON_SETTINGS") or os.path.join(
        os.environ.get("XDG_CONFIG_HOME") or os.path.join(os.path.expanduser("~"), ".config"), "Orkeon", "appsettings.json")
    try:
        return flatten_settings(json.loads(Path(path).read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return []


def check_shell(report, settings, places):
    """shell_command runs host commands with no confinement in a container - the workshop's included, where
    Orkeon's Auto mode turns it off since fa46bb5 - and with Confinement:Mode None: `cat` reads any file the run
    can read, whatever the mount points (security.md § 7). Elsewhere (Studio on Windows, a host outside a
    container) Orkeon confines it by default, but the team is checked for the run it gets here. A team
    with no settings file of its own (None) runs on the machine's settings, and on their mail and drive
    accounts. The OAuth tokens of both families
    are plain JSON under the host's credentials root, shielded from the file tools, not from a shell
    (Orkeon 1.2.0: FileSystemDriveTokenStore, as the e-mail store)."""
    holder = "a team that holds a {} account"
    if settings is None and places:
        settings, holder = machine_settings(), "a team that runs on the machine's settings, which hold a {} account"
    keys = [key.lower() for key, _ in settings or []]
    kinds = [kind for kind, prefix in (("mail", "orkeon:tools:email:accounts:"), ("drive", "orkeon:tools:drive:accounts:"))
             if any(key.startswith(prefix) for key in keys)]
    for where in places:
        if kinds:
            report.error(where, f"shell_command in {holder.format(' and '.join(kinds))}: `cat` reads the OAuth tokens of the "
                                "account, the settings and, through /proc, the model's key, whatever the mount points, wherever "
                                "the shell runs unconfined (a container, the workshop's included) — give the agent the file "
                                "tools instead (security.md § 7)")
        else:
            report.warn(where, "shell_command is confined by nothing in a container, the workshop's included: `cat` reads "
                               "the settings, the OAuth tokens of the mail and drive accounts, the credentials of Claude Code and, through /proc, the model's key, "
                               "whatever the mount points — give it to no agent that reads untrusted input (security.md § 7)")


def check_studio(report, team):
    """The team as Orkeon Studio reads it, with Studio's own code: orkeon-studio-check, in the image. It
    prints `PASS|FAIL <folder>` then one `  - <problem>` line per problem, and exits 0 when the team
    passes, 1 when it fails, 2 on a usage error. A folder outside the team that Studio refuses until it
    is declared in its Authorized folders is a warning here (they are the user's to set; the mount points
    themselves are judged by check_reach); `Studio always refuses …` and every other problem is an error.
    A crash, or a usage error, is a warning: the team could not be checked."""
    tool = shutil.which("orkeon-studio-check")
    if tool is None:
        return
    try:
        out = subprocess.run([tool, str(team)], capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    except OSError as exc:
        report.warn("Orkeon Studio", f"orkeon-studio-check could not run: {exc}")
        return
    if out.returncode == 2:
        reason = (out.stderr or out.stdout).strip().splitlines()
        report.warn("Orkeon Studio", f"orkeon-studio-check could not run: {reason[0] if reason else 'no output'}")
        return
    if out.returncode not in (0, 1):
        report.warn("Orkeon Studio", f"orkeon-studio-check failed (exit {out.returncode})")
        return
    problems = [line[4:] for line in out.stdout.splitlines() if line.startswith("  - ")]
    for problem in problems:
        if problem.startswith("Studio refuses to launch the team because of"):
            report.warn("Orkeon Studio", problem)
        else:
            report.error("Orkeon Studio", problem)
    if out.returncode == 1 and not problems:
        report.error("Orkeon Studio", "orkeon-studio-check failed the team without saying why")


def check_settings(report, team):
    """A team's Orkeon settings live outside its folder (D33): settings/<slug>/appsettings.json of the
    workshop, two levels above the team folder. The launchers pass it with --settings, so Orkeon reads
    it INSTEAD of ~/.config/Orkeon/appsettings.json: it must stand on its own. Returns its entries ([]
    when it cannot be read), or None when the team has none and runs on the machine's settings."""
    beneath = {p for p in team.glob("appsettings*.json") if p.is_file()}
    unread = {p for p in (team / "_shared").glob("appsettings*.json") if p.is_file()}
    strays = [*(team / "appsettings").glob("*.json")]
    if (team / "crew").is_dir():
        strays += [p for p in (team / "crew").rglob("appsettings*.json") if p.parent.name != "_shared"]
        unread |= {p for p in (team / "crew").rglob("appsettings*.json") if p.parent.name == "_shared" and p.is_file()}
    for stray in sorted(beneath | unread | {p for p in strays if p.is_file()}):
        if stray in beneath:
            report.warn(str(stray.relative_to(team)), SETTINGS_BENEATH)
        elif stray in unread:
            report.warn(str(stray.relative_to(team)), SETTINGS_UNREAD)
        else:
            report.error(str(stray.relative_to(team)), SETTINGS_INSTEAD)
    check_walk_up_settings(report, team)
    path = team.parent.parent / "settings" / team.name / "appsettings.json"
    if not path.is_file():
        return None
    where = f"settings/{team.name}/appsettings.json"
    try:
        entries = flatten_settings(json.loads(path.read_text(encoding="utf-8")))
    except (ValueError, UnicodeDecodeError) as exc:
        report.error(where, f"not strict JSON ({exc}): the run gate and the bench could not read it")
        return []
    check_settings_content(report, where, entries)
    keys = [(k.lower(), v) for k, v in entries]
    profiles = {}
    for k, v in keys:
        found = re.fullmatch(r"llm:profiles:([^:]+)(?::(.*))?", k)
        if found:
            profile = profiles.setdefault(found.group(1), {})
            if found.group(2) == "baseurl" and isinstance(v, str) and v.strip():
                profile["baseurl"] = v.strip()
    # The default provider: a key of Llm besides Profiles holding a value (LlmSettings.HasDefault).
    if not any(k.startswith("llm:") and not re.match(r"llm:profiles(:|$)", k) and v is not None and str(v).strip()
               for k, v in keys):
        report.error(where, "the launchers pass it with --settings and Orkeon reads it instead of "
                            "~/.config/Orkeon/appsettings.json: give it the Llm section (BaseUrl, Model...), "
                            "or the team runs on the echo provider (named profiles alone leave the default unset: the "
                            "manager, the planner, the Guardian and every agent that names no profile run on it)")
        return entries
    if any(k == "llm:apikey" and isinstance(v, str) and v.strip() for k, v in keys):
        report.error(where, "Llm.ApiKey holds a key: keys never go to disk — name the variable that holds it in "
                            "Llm.ApiKeyEnvVar, or pass ORKEON_Llm__ApiKey from the environment")
    if not any(k == "llm:baseurl" and isinstance(v, str) and v.strip() for k, v in keys):
        report.warn(where, "no Llm.BaseUrl: Orkeon picks a hosted provider from the model name, and the run gate "
                           "counts every run of the team as remote")
    for name, profile in profiles.items():
        url = profile.get("baseurl")
        if not url:
            report.warn(where, f"the named profile Llm:Profiles:{name} has no BaseUrl: Orkeon picks a hosted provider from "
                               "its model name, and the run gate counts every run of the team as remote (any agent may "
                               "name the profile)")
        elif not is_local_url(url):
            report.warn(where, f"the named profile Llm:Profiles:{name} is remote ({url}): the run gate counts every run of "
                               "the team as remote, since any agent may name it — a remote run needs an estimate, a cap "
                               "and your approval")

    url = next((v for k, v in keys if k == "llm:baseurl" and isinstance(v, str) and v.strip()), "")
    if url and is_local_url(url):
        limit = next((v for k, v in keys if k == "ratelimiting:maxconcurrentrequests"), None)
        queue = next((v for k, v in keys if k == "ratelimiting:queuelimit"), None)
        if isinstance(limit, str) and re.fullmatch(r"\s*[+-]?\d+\s*", limit):
            limit = int(limit)  # .NET binds a numeric string to the number
        if not isinstance(limit, int) or isinstance(limit, bool) or limit <= 0:
            now = "absent" if limit is None else str(limit)
            report.error(where, f"RateLimiting.MaxConcurrentRequests is {now} (unlimited): a local model takes one request "
                                "at a time — set it to 1, with QueueLimit 32; concurrent calls saturate the GPU")
        elif limit == 1 and queue is None:
            report.warn(where, "RateLimiting.QueueLimit defaults to 5: beyond that, a parallel crew's calls are refused "
                               "— set it to 32")
    return entries

def check_layout(report, team):
    crew = team / "crew"
    if not (crew / "crew.ork.ts").is_file():
        report.error("crew/", "crew/crew.ork.ts is missing (the exact name Studio runs without asking)")
    for script in list(team.glob("*.ork.*")) + [p for p in crew.glob("*.ork.*") if p.name != "crew.ork.ts"]:
        report.error(str(script.relative_to(team)), "only crew/crew.ork.ts carries the .ork suffix")
    for yaml_file in list(crew.glob("*.yaml")) + list(crew.glob("*.yml")):
        report.error(str(yaml_file.relative_to(team)), "a YAML crew file next to the script: one format per folder")
    for sub in ("agents", "tasks"):
        if (crew / sub).is_dir():
            report.error(f"crew/{sub}/", "a YAML layout folder next to the script makes the folder ambiguous")
    if (crew / "tsconfig.json").exists() or (crew / "typings").exists():
        report.warn("crew/", "tsconfig.json and typings/ belong at the team root, not in crew/")

    card, legacy = team / TEAM_CARD, team / LEGACY_TEAM_CARD
    if legacy.is_file():
        report.error(LEGACY_TEAM_CARD, "the Studio card is team.json since Orkeon 1.0.0-rc.7: the engine no longer reads this "
                                       "name — run `orkeon-bench scaffold <team>`, which carries it over and removes it")
    if not card.is_file():
        if not legacy.is_file():
            report.error(TEAM_CARD, "missing")
    else:
        text = card.read_text(encoding="utf-8")
        try:
            data = json.loads(text)
            for field in ("name", "description"):
                if not data.get(field):
                    report.warn(TEAM_CARD, f"'{field}' is empty")
        except json.JSONDecodeError as exc:
            report.error(TEAM_CARD, f"invalid JSON: {exc}")
        if "{{" in text:
            report.error(TEAM_CARD, "template placeholder left")

    run_sh, run_cmd = team / "run.sh", team / "run.cmd"
    if not run_sh.is_file():
        report.error("run.sh", "missing")
    else:
        text = run_sh.read_text(encoding="utf-8")
        if "{{" in text:
            report.error("run.sh", "template placeholder left")
        if '"$DIR/crew/crew.ork.ts"' not in text:
            report.error("run.sh", "must run \"$DIR/crew/crew.ork.ts\" (orkeon run refuses a folder holding only a script)")
        if not run_sh.stat().st_mode & 0o111:
            report.error("run.sh", "not executable (chmod +x run.sh)")
        if ORKEON_LAUNCHER in text:
            report.error("run.sh", ORKEON_WROTE)
        elif 'settings/$(basename "$DIR")/appsettings.json' not in text:
            report.error("run.sh", "written before D33, it passes no team settings file: run `orkeon-bench scaffold <team>` again")
    if not run_cmd.is_file():
        report.error("run.cmd", "missing")
    else:
        raw = run_cmd.read_bytes()
        if b"{{" in raw:
            report.error("run.cmd", "template placeholder left")
        if b"crew\\crew.ork.ts" not in raw and b"crew/crew.ork.ts" not in raw:
            report.error("run.cmd", "must run \"%~dp0crew\\crew.ork.ts\"")
        if raw.count(b"\n") != raw.count(b"\r\n"):
            report.error("run.cmd", "line endings must be CRLF")
        if ORKEON_LAUNCHER.encode() in raw:
            report.error("run.cmd", ORKEON_WROTE)
        elif b"%SETTINGS_ARG%" not in raw:
            report.error("run.cmd", "written before D33, it passes no team settings file: run `orkeon-bench scaffold <team>` again")
        elif b"LAUNCHER_CP" not in raw:
            report.error("run.cmd", "written before cmd's quoting was fixed (as in Orkeon main at a2bb6c3): a folder holding & or "
                                    "^ breaks it — run `orkeon-bench scaffold <team>` again")
    readme = team / "README.md"
    if not readme.is_file():
        report.warn("README.md", "missing")
    elif "{{" in readme.read_text(encoding="utf-8"):
        report.error("README.md", "template placeholder left")


# The named profiles of the team's settings file (Llm:Profiles:<id>), lower-cased; None when the team
# has no settings file of its own. Set by main() before the sources are checked.
TEAM_PROFILES = None
# The decision profiles of the same file (Orkeon:Decision:Profiles:<name>), lower-cased: Orkeon registers each as a
# profile a crew may name (`DecisionProfileServiceCollectionExtensions`, Orkeon 1.2.0). Empty without a file.
DECISION_PROFILES = set()


# The rungs of Orkeon:Decision:Route:Ladder of the same file, lower-cased (Orkeon 1.4.0); None without a file.
LADDER = None
# The crew's `.decision({ mode })` (Orkeon 1.4.0): none, optional, required, None when the crew names none,
# or "unknown" when the check cannot read it.
DECISION_MODE = None
# The names of the agents, for a without: relay; None when the check cannot list them.
AGENT_NAMES = None


def check_profile(report, where, profile, agent=False):
    """`llm.profile("<id>")` (an agent, `agent` true) or `.withProfile("<id>")` (a task): the agent calls the named
    profile Llm:Profiles:<id> of the settings the run reads — `default` is the Llm section itself, `auto` (a task's,
    Orkeon 1.4.0) the profile System One picks on the host's ladder. An unknown profile fails the load."""
    name = str(profile).strip()
    if not name or name.lower() == "default":
        return
    if name.lower() == "auto":
        if agent:
            # Checked on the CLI (V-68): `llm.profile("auto")` is refused even with a ladder; `.withProfile("auto")` is read.
            report.error(where, "llm.profile(\"auto\") names the LLM profile 'auto', which the TypeScript surface does not "
                                "offer an agent (Orkeon 1.4.0): the load fails — name a profile, or put .withProfile(\"auto\") "
                                "on its tasks")
        elif DECISION_MODE == "none":
            report.error(where, "the profile 'auto', which System One picks and a crew with decision.mode: none refuses at "
                                "load: name a profile instead")
        elif LADDER is None:
            report.warn(where, "profile 'auto' needs Orkeon:Decision:Route:Ladder (two profiles or more, cheapest first) in "
                               "the settings the run reads — give the team its settings file with the ladder, or the load fails")
        elif not LADDER:
            report.error(where, "profile 'auto': settings/<slug>/appsettings.json declares no Orkeon:Decision:Route:Ladder: list "
                                "there the profiles System One may pick, cheapest first, or name a profile — the load fails")
        else:
            known = {"default"} | (TEAM_PROFILES or set()) | DECISION_PROFILES
            for rung in LADDER:
                if rung and rung != "auto" and rung not in known:
                    report.error(where, f"profile 'auto': Orkeon:Decision:Route:Ladder names the profile '{rung}', which the "
                                        "team's settings do not define — the load fails")
            report.warn(where, "profile 'auto': with the decision circuit off (no decision provider, the workshop's default) "
                               "System One picks nothing and each task runs on the default profile")
        return
    if name.lower() in DECISION_PROFILES:
        if DECISION_MODE == "none":
            report.error(where, f"profile '{name}' is a decision profile (Orkeon:Decision:Profiles:{name}), which a crew with "
                                "decision.mode: none refuses at load — name its target LLM profile")
            return
        report.warn(where, f"profile '{name}' is a decision profile (Orkeon:Decision:Profiles:{name}): without a decision "
                           "provider (the workshop's default) it takes no decision — its calls go to its target profile, "
                           "with no guard and no escalation (Orkeon 1.4.0). Name its target LLM profile unless TEAM.md "
                           "declares a decision model")
        return
    if TEAM_PROFILES is None:
        report.warn(where, f"profile '{name}' must be defined in the settings the run reads — give the team its settings "
                           f"file, settings/<slug>/appsettings.json, with Llm:Profiles:{name}, or the load fails")
    elif name.lower() not in TEAM_PROFILES:
        report.error(where, f"profile '{name}' is not defined in settings/<slug>/appsettings.json (Llm:Profiles:{name}): "
                            "the load fails, listing the known profiles")
    # Orkeon Studio passes the team's settings file itself since Orkeon main at fb26364 (STUDIO-62).
    studio = ("in Orkeon Studio the team runs on Studio's settings, which must define the same profile (a Studio model "
              "setting named so)" if TEAM_PROFILES is None else
              "Orkeon Studio passes the team's settings file too, and lays a Studio model setting of the same id over it")
    report.warn(where, f"profile '{name}': {studio}; a remote profile makes every run of the team remote for the run gate")


CHAIN_CALL = re.compile(r"\.\s*([A-Za-z_$][\w$]*)\s*\(\s*")


def call_argument(code, start, masked=None):
    """The text of the argument list that opens at `start` (just after its `(`), up to its closing `)`: strings and
    nested brackets skipped (`masked`, of the same length, holds no string, see `scan`)."""
    masked = scan(code)[1] if masked is None else masked
    depth = 0
    for i in range(start, len(masked)):
        if masked[i] in "([{":
            depth += 1
        elif masked[i] in ")]}":
            if depth == 0:
                return code[start:i]
            depth -= 1
    return code[start:]


def chain_calls(code, masked, start):
    """The top-level calls of the builder chain that goes on at `start`, up to its `.build(`: (name, text of the
    argument, its position)."""
    i, depth, calls = start, 0, []
    while i < len(masked):
        char = masked[i]
        if char in "([{":
            depth += 1
        elif char in ")]}":
            if depth == 0:
                break
            depth -= 1
        elif char in ";," and depth == 0:
            break
        elif char == "." and depth == 0:
            call = CHAIN_CALL.match(masked, i)
            if call:
                calls.append((call.group(1), call_argument(code, call.end(), masked).strip(), call.end()))
                if call.group(1) == "build":
                    break
        i += 1
    return calls


LITERAL = re.compile(r"\"([^\"\\\n]*)\"|'([^'\\\n]*)'|`([^`\\$]*)`")


def resolve(code, masked, text, depth=0):
    """`text`, an expression, with its parentheses, `as …`, `satisfies …`, `<…>` and `!` taken off, and the value of
    the file's one `const` in place of its name; the text itself when there is none."""
    text = text.strip().rstrip(",").strip()
    while True:
        plain = scan(text)[1]
        cut = re.search(r"\s+(?:as|satisfies)\s+[^(){}\[\]]*(?:\{[^{}]*\})?\s*$", plain)
        if cut and plain.count("{", 0, cut.start()) == plain.count("}", 0, cut.start()) \
                and plain.count("(", 0, cut.start()) == plain.count(")", 0, cut.start()):
            text = text[:cut.start()].strip()
        elif re.match(r"<\s*[\w.$]+\s*>", text):
            text = text[text.index(">") + 1:].strip()
        elif text.endswith("!"):
            text = text[:-1].strip()
        elif text.startswith("(") and len(call_argument(text, 1)) == len(text) - 2:
            text = text[1:-1].strip()
        else:
            break
    if depth < 5 and re.fullmatch(r"[A-Za-z_$][\w$]*", text) and text not in ("undefined", "null"):
        name = re.escape(text)
        found = list(re.finditer(rf"\bconst\s+{name}\s*(?::[^=;]*)?=(?!=|>)", masked))
        if len(found) == 1:
            end, level = found[0].end(), 0
            while end < len(masked):
                level += 1 if masked[end] in "([{" else -1 if masked[end] in ")]}" else 0
                if level < 0 or (level == 0 and masked[end] in ";,"):
                    break
                if level == 0 and masked[end] == "\n" and masked[found[0].end():end].strip() \
                        and not re.match(r"\s*[.+?:|&(\[{]", masked[end:]):
                    break
                end += 1
            return resolve(code, masked, code[found[0].end():end], depth + 1)
    return text


def literal_of(text):
    """The string the expression `text` is, or None when it is no literal the check can read."""
    found = LITERAL.fullmatch(text)
    return next(g for g in found.groups() if g is not None) if found else None


def top_level_properties(text):
    """The properties at the top level of the object literal `text` (it opens with `{`): a dict of each key (an
    identifier or a quoted key) to the text of its value, None for a shorthand `{ key }`, and whether a spread
    `...x` stands among them; None when `text` is no object literal the scan can read. Strings, template literals,
    comments and nested brackets are skipped, so a `fallback` inside a string or a nested object is no key here."""
    if not text.startswith("{"):
        return None
    props, spread, i, depth, start = {}, False, 1, 0, 1
    entries = []
    while i < len(text):
        char = text[i]
        if char in "\"'`":
            end = i + 1
            while end < len(text) and text[end] != char:
                end += 2 if text[end] == "\\" else 1
            i = end + 1
            continue
        if text.startswith("//", i):
            i = text.find("\n", i)
            i = len(text) if i < 0 else i
            continue
        if text.startswith("/*", i):
            i = text.find("*/", i)
            i = len(text) if i < 0 else i + 2
            continue
        if char in "([{":
            depth += 1
        elif char in ")]}":
            if depth == 0:
                entries.append(text[start:i])
                break
            depth -= 1
        elif char == "," and depth == 0:
            entries.append(text[start:i])
            start = i + 1
        i += 1
    else:
        return None
    for entry in entries:
        entry = entry.strip()
        if not entry:
            continue
        if entry.startswith("..."):
            spread = True
            continue
        key = re.match(r"(?:([A-Za-z_$][\w$]*)|([\"'])([^\"']*)\2)\s*(:)?", entry)
        if key is None:
            return None
        name = key.group(1) or key.group(3)
        props[name] = entry[key.end():].strip() if key.group(4) else None
    return props, spread


def decision_of(code, masked, argument):
    """What a task's `.decision(<argument>)` says, as {"fallback", "without"}. Its fallback: "yes" for a non-empty
    `fallback` of an object literal, "no" when the literal has none at its top level or an empty one, "unknown" when
    the argument is no object literal, the fallback no literal the check can read, or a spread may bring one. Its
    relay: None without one, else ("agent", name), ("refused", why) for what the loader refuses, ("unknown", None)."""
    found = top_level_properties(argument.strip())
    if found is None:
        return {"fallback": "unknown", "without": ("unknown", None)}
    props, spread = found
    if "fallback" not in props:
        fallback = "unknown" if spread else "no"
    else:
        value = resolve(code, masked, props["fallback"]) if props["fallback"] is not None else ""
        if value in ("undefined", "null"):
            return {"fallback": "refused", "without": ("unknown", None)}
        inner = top_level_properties(value) if value.startswith("{") else None
        # shorthand `{ fallback }`, or `fallback: someVariable`
        fallback = "unknown" if inner is None else "yes" if inner[0] else "unknown" if inner[1] else "no"
    if "without" not in props:
        return {"fallback": fallback, "without": ("unknown", None) if spread else None}
    value = resolve(code, masked, props["without"] if props["without"] is not None else "without")
    if value in ("undefined", "null") or literal_of(value) is not None or re.fullmatch(r"true|false|[\d.]+", value):
        return {"fallback": fallback, "without": ("refused", f"without is {value}, and expects an object, {{ agent: \"…\" }}")}
    inner = top_level_properties(value)
    if inner is None:
        return {"fallback": fallback, "without": ("unknown", None)}
    if "agent" not in inner[0]:
        return {"fallback": fallback, "without": ("unknown", None) if inner[1] else (
            "refused", "without.agent is required: the name of the agent that answers when the circuit is off")}
    agent = resolve(code, masked, inner[0]["agent"] if inner[0]["agent"] is not None else "agent")
    name = literal_of(agent)
    if name is not None and name.strip():
        return {"fallback": fallback, "without": ("agent", name.strip())}
    if name is not None or agent in ("undefined", "null") or agent.startswith("{") \
            or (re.match(r"agentBuilder\s*\(", agent) and re.search(r"\.\s*build\s*\(\s*\)$", agent)):
        return {"fallback": fallback, "without": ("refused", "without.agent is the name of an agent, a string: \"researcher\"")}
    return {"fallback": fallback, "without": ("unknown", None)}


def task_chains(code, masked):
    """Each `taskBuilder()` chain of `code` (comments blanked): its line, the literal of its first top-level
    `.name("…")` (None when none or not a literal), how many top-level `.when(` it calls, what its decision
    contract says — `decision`: None for a plain task, else `decision_of`; `otherwise`: ("literal", name) for the
    decision task its `.when(task, "otherwise")` names, ("expression", text) when that task is named by an
    expression, or None — and the positions of its `.decision(` arguments. A light scan of the chain up to its
    `.build(` — strings, comments and what nested calls hold (an inline `agentBuilder()…build()`) skipped —, not
    a TypeScript parser."""
    chains = []
    for match in re.finditer(r"\btaskBuilder\s*\(\s*\)", masked):
        calls = chain_calls(code, masked, match.end())
        name = next((c[1] for c in calls if c[0] == "name"), None)
        decision = next((decision_of(code, masked, c[1]) for c in calls if c[0] == "decision"), None)
        otherwise = None
        for c in calls:
            if c[0] != "when":
                continue
            when = re.fullmatch(r"\s*(.*?)\s*,\s*([\"'`])otherwise\2\s*", c[1], flags=re.S)
            if when:
                literal_task = re.fullmatch(r"([\"'`])([^\"'`]*)\1", when.group(1))
                # A task named by an expression (a constant, `triage.name`) is recorded as such: the check cannot tell
                otherwise = ("literal", literal_task.group(2)) if literal_task else ("expression", when.group(1))
        chains.append((code.count("\n", 0, match.start()) + 1, literal_of(name) if name is not None else None,
                       sum(1 for c in calls if c[0] == "when"),
                       {"decision": decision, "otherwise": otherwise, "at": {c[2] for c in calls if c[0] == "decision"}}))
    return chains


def mode_of(code, masked, argument):
    """The mode a crew's `.decision(<argument>)` names: ("mode", name), ("bad", why) for what the script throws on,
    ("unknown", None) when the check cannot tell; None when the argument is an object that carries no mode."""
    value = resolve(code, masked, argument)
    if not value or literal_of(value) is not None or value in ("undefined", "null"):
        return ("bad", "it expects an object, { mode: \"none\" | \"optional\" | \"required\" }")
    found = top_level_properties(value)
    if found is None:
        return ("unknown", None)
    props, spread = found
    if "mode" not in props:
        return ("unknown", None) if spread else None
    written = resolve(code, masked, props["mode"] if props["mode"] is not None else "mode")
    literal = literal_of(written)
    if literal is None:
        return ("bad", f"mode is {written}, and names one of none, optional, required") \
            if re.fullmatch(r"undefined|null|true|false|[\d.]+", written) else ("unknown", None)
    mode = literal.strip().lower()
    if spread and mode != "required":
        return ("unknown", None)  # the spread may come after the mode
    if mode not in ("none", "optional", "required"):
        return ("bad", f"'{literal}' is not a mode; expected none, optional or required")
    return ("mode", mode)


def crew_mode(report, sources):
    """The crew's `.decision({ mode })` (Orkeon 1.4.0, checked on the CLI, V-68), trimmed and in any case; a task's
    `.decision({...})` carries questions, not a mode. Returns the mode, None when the crew names none, "unknown" when
    the check cannot tell — it then claims nothing of what the mode decides. A visible `required` always wins (D116)."""
    modes = []
    for where, code, masked in sources:
        tasks_at = {at for chain in task_chains(code, masked) for at in chain[3]["at"]}
        crews_at = {}
        for match in re.finditer(r"\bcrewBuilder\s*\(\s*\)", masked):
            calls = [c for c in chain_calls(code, masked, match.end()) if c[0] == "decision"]
            crews_at.update({c[2]: c is calls[-1] for c in calls})  # the last call of a chain wins
        for match in re.finditer(r"\.\s*decision\s*\(\s*", masked):
            at = match.end()
            if at in tasks_at or crews_at.get(at) is False:
                continue
            argument = call_argument(code, at, masked)
            found = mode_of(code, masked, argument)
            if at not in crews_at:
                # A builder held in a variable: a crew's call when it names a mode, a task's when it holds questions.
                if found is None or (found[0] != "mode" and not re.search(r"\bmode\b", scan(argument)[1])):
                    if found is None or "questions" in scan(argument)[1]:
                        continue
                    found = ("unknown", None)
            elif found is None:
                found = ("bad", "it names a mode, { mode: \"none\" | \"optional\" | \"required\" }")
            line = f"{where}:{code.count(chr(10), 0, at) + 1}"
            if found[0] == "unknown" and any(
                    next(g for g in m.groups() if g is not None).strip().lower() == "required"
                    for m in LITERAL.finditer(argument)):
                found = ("mode", "required")  # a computed mode that may be required (D96)
            if found[0] == "bad":
                report.error(line, f".decision(…) of the crew: {found[1]} — the script throws when the crew loads")
            elif found[0] == "unknown":
                report.warn(line, ".decision(…): the check cannot read the mode of the crew — write it as a literal, "
                                  ".decision({ mode: \"optional\" }); a mode required is refused (D96)")
            modes.append(found[1] if found[0] == "mode" else "unknown")
    if "unknown" in modes and any(
            re.match(r"mode[\"']?\s*:\s*[\"'`]\s*required\s*[\"'`]", code[m.start():], flags=re.I)
            for _, code, masked in sources for m in re.finditer(r"\bmode\b|(?<=[\"'])\s{4}(?=[\"']\s*:)", masked)):
        return "required"  # the literal stands in what the check cannot follow (a helper, another module)
    if "required" in modes:
        return "required"
    return None if not modes else modes[0] if len(set(modes)) == 1 else "unknown"


def agent_names(sources):
    """The literal names of the `agentBuilder()` chains, or None when one of them is named by an expression."""
    names = set()
    for _, code, masked in sources:
        for match in re.finditer(r"\bagentBuilder\b(?!\s*[,}])", masked):
            calls = chain_calls(code, masked, match.end() + len(re.match(r"\s*(?:\(\s*\))?", masked[match.end():]).group(0)))
            name = next((c[1] for c in calls if c[0] == "name"), None)
            literal = literal_of(resolve(code, masked, name)) if name is not None else None
            if literal is None:
                return None
            names.add(literal)
    return names or None


# The levels `.effort(…)` and `.withEffort(…)` take, in any case, beside auto (`RequireEffortOrAuto`, Orkeon 1.4.0).
EFFORT_LEVELS = ("low", "medium", "high", "xhigh", "max")


def check_efforts(report, where, code, masked):
    for match in re.finditer(r"\.\s*(effort|withEffort)\s*\(\s*", masked):
        literal = literal_of(resolve(code, masked, call_argument(code, match.end(), masked)))
        if literal is None:
            continue
        line, level = f"{where}:{code.count(chr(10), 0, match.start()) + 1}", literal.strip().lower()
        if level not in (*EFFORT_LEVELS, "auto"):
            report.error(line, f".{match.group(1)}(\"{literal}\"): write one of {', '.join(EFFORT_LEVELS)} or auto — the script "
                               "throws when the crew loads")
        elif level == "auto" and DECISION_MODE == "none":
            report.error(line, f".{match.group(1)}(\"auto\"), which System One picks and a crew with decision.mode: none "
                               "refuses at load: write a level instead")


def check_decide_tool(report, where, code, masked):
    """`system_one_decide` as a string of the sources, in a `.tools([...])` or in what one is built from (D116)."""
    for match in LITERAL.finditer(code):
        if masked[match.start()] not in "\"'`" or next(g for g in match.groups() if g is not None).strip().lower() != "system_one_decide":
            continue
        line = f"{where}:{code.count(chr(10), 0, match.start()) + 1}"
        if DECISION_MODE in ("none", "optional"):
            report.error(line, f"system_one_decide, which a crew with decision.mode: {DECISION_MODE} refuses at load: a run "
                               "without System One must not call it")
        else:
            report.error(line, "system_one_decide: with the decision circuit off (no decision provider, the workshop's "
                               "default) Orkeon withholds it and refuses the run ('references tool … withheld', exit 2) — "
                               "--validate only warns — and the team must work without a provider (D96): remove it")


def check_sources(report, team, catalogue, points):
    """The TypeScript sources; returns the files that give an agent shell_command."""
    crew = team / "crew"
    entry = crew / "crew.ork.ts"
    sources = sorted(p for p in crew.rglob("*.ts") if p.is_file())
    shell = []
    task_names = {}
    decisions, otherwise = [], {"literal": set(), "expression": set()}
    scanned = [(str(p.relative_to(team)), *scan(p.read_text(encoding="utf-8"))) for p in sources]
    global DECISION_MODE, AGENT_NAMES
    DECISION_MODE = crew_mode(report, scanned)
    AGENT_NAMES = agent_names(scanned)
    for path in sources:
        where = str(path.relative_to(team))
        raw = path.read_text(encoding="utf-8")
        if "{{" in raw:
            report.error(where, "template placeholder '{{…}}' left")
        code, masked = scan(raw)
        check_efforts(report, where, code, masked)
        check_decide_tool(report, where, code, masked)
        for number, line in enumerate(code.splitlines(), 1):
            for pattern, message in FORBIDDEN:
                if re.search(pattern, line):
                    report.error(f"{where}:{number}", message)
        for number, line in enumerate(code.splitlines(), 1):
            if re.search(r"\bllm\s*\.\s*model\s*\(", line):
                report.warn(f"{where}:{number}", "llm.model(…) pins the model the agent asks its provider for: it must exist at "
                                                 "every endpoint the team runs on — leave the model to the settings the run reads "
                                                 "unless a decision says otherwise")
            for kind, name in re.findall(r"(\bllm\s*\.\s*profile|\.withProfile)\s*\(\s*[\"'`]([^\"'`]*)[\"'`]", line):
                check_profile(report, f"{where}:{number}", name, agent=not kind.startswith("."))
            if re.search(r"(?:\bllm\s*\.\s*profile|\.withProfile)\s*\(\s*[^\"'`\s]", line):
                report.warn(f"{where}:{number}", "a profile named by an expression: the check cannot tell whether the settings "
                                                 "define it, and the run gate judges every profile of the settings")
        # A task name is unique in a crew, and a task has one condition: the loader refuses the script otherwise
        # (`JsCrewConfigurationAdapter`, `JsTaskBuilder.when`; Orkeon 1.2.0). Literal names only.
        for line, name, whens, contract in task_chains(code, masked):
            if contract["decision"] is not None:
                decisions.append((f"{where}:{line}", name, contract["decision"]))
            if contract["otherwise"] is not None:
                otherwise[contract["otherwise"][0]].add(contract["otherwise"][1])
            if whens > 1:
                report.error(f"{where}:{line}", f".when(task, clauses) is called twice on task '{name or '?'}': a task has "
                                                "one condition — the loader refuses the script")
            if name is None:
                continue
            if name in task_names:
                report.error(f"{where}:{line}", f"Task '{name}' is declared twice: a task name is unique in a crew "
                                                f"(first at {task_names[name]}) — Orkeon refuses the crew at load")
            else:
                task_names[name] = f"{where}:{line}"
        # Built-in tools named in .tools([...]).
        for block in re.findall(r"\.tools\s*\(\s*\[(.*?)\]", code, flags=re.S):
            for tool in re.findall(r"[\"']([^\"']+)[\"']", block):
                if tool in COWORKER_TOOLS:
                    report.error(where, f"'{tool}' is added automatically by allowDelegation — do not list it")
                elif tool.strip().lower() == "system_one_decide":
                    continue  # check_decide_tool
                elif tool in UNAVAILABLE_TOOLS:
                    report.error(where, f"'{tool}' is not available to a team run by Studio / orkeon run")
                elif tool not in catalogue:
                    report.error(where, f"unknown built-in tool '{tool}' (custom tools go through withAutonomousTools)")
                elif tool == "shell_command" and where not in shell:
                    shell.append(where)
        # Deliverables.
        for spec in re.findall(r"\.deliverable\s*\(\s*\{(.*?)\}\s*\)", code, flags=re.S):
            path_match = re.search(r"path\s*:\s*[\"'`]([^\"'`]+)", spec)
            source_match = re.search(r"source\s*:\s*[\"']([^\"']+)", spec)
            target = path_match.group(1) if path_match else ""
            if not target:
                report.error(where, "deliverable without a literal 'path'")
            elif any(target == root or target.startswith(f"{root}/") for root in RESERVED_ROOTS) or (points and not any(target.startswith(f"{root}/") for root in writable_roots(points))):
                report.error(where, f"deliverable path '{target}' is not under a writable mount point of the team "
                                    f"({', '.join(writable_roots(points)) or 'none'}): --validate accepts it, the run cannot write it")
            if not source_match:
                report.error(where, "deliverable without 'source' (final_message is the usual choice)")
            elif source_match.group(1) == "structured_output" and not re.search(r"schema(Path|Inline)?\s*:", spec):
                report.error(where, "structured_output requires schema, schemaPath or schemaInline")

    if entry.is_file():
        code = strip_comments(entry.read_text(encoding="utf-8"))
        if not re.search(r"\bglobalThis\b[^\r\n]{0,60}?\.\s*crew\s*=", code):
            report.error("crew/crew.ork.ts", "no `globalThis.crew = crew;` handoff: the file is not declarative")
        if re.search(r"\.process\s*\(\s*[\"']hierarchical", code) and not re.search(r"\.manager\s*\(", code):
            report.error("crew/crew.ork.ts", "process(\"hierarchical\") requires .manager(agent)")
        # crewBuilder().budget({...}) bounds an autonomous run; any other process refuses the crew at load
        # (`JsCrewConfigurationAdapter.RefuseBudgetTheModeNeverSpends`, Orkeon 1.2.0).
        if re.search(r"\.budget\s*\(", code) and not re.search(r"\.process\s*\(\s*[\"']autonomous", code):
            report.error("crew/crew.ork.ts", ".budget({...}) without .process(\"autonomous\"): any other process spends no "
                                             "budget, and Orkeon refuses the crew at load — remove it, or run the crew autonomous")
        # agentBuilder().cache({...}) and the cache of LlmConfig.with({...}) throw a script error on a key other than
        # systemPrompt, tools, ttl, on a ttl other than 5m or 1h, and on a ttl with nothing marked (Orkeon 1.2.0)
        for block in re.findall(r"(?:\.cache\s*\(|\bcache\s*:)\s*(\{[^{}]*\})", code):
            keys = set(re.findall(r"([A-Za-z_$][\w$]*)\s*:", block))
            unknown = sorted(keys - {"systemPrompt", "tools", "ttl"})
            if unknown:
                report.error("crew/crew.ork.ts", f"cache {block}: {', '.join(unknown)} is no key of the prompt cache "
                                                 "(systemPrompt, tools, ttl) — the script throws when the crew loads")
            ttl = re.search(r"\bttl\s*:\s*[\"'`]([^\"'`]*)", block)
            if ttl and ttl.group(1) not in ("5m", "1h"):
                report.error("crew/crew.ork.ts", f"cache ttl must be 5m or 1h, not '{ttl.group(1)}' — the script throws "
                                                 "when the crew loads")
            if "ttl" in keys and not re.search(r"\b(systemPrompt|tools)\s*:\s*true\b", block):
                report.error("crew/crew.ork.ts", f"cache {block}: a ttl with neither systemPrompt nor tools set to true "
                                                 "caches nothing, and the script throws when the crew loads")
        agents =len(re.findall(r"\bagentBuilder\s*\(", code))
        if agents and len(re.findall(r"\.allowDelegation\s*\(", code)) < agents:
            report.warn("crew/crew.ork.ts", "an agent without .allowDelegation(...): write it explicitly")
        if ".deliverable(" not in code:
            report.warn("crew/crew.ork.ts", "no task has a deliverable: nothing will be written to a mount point")
    tools_index = crew / "tools" / "index.ts"
    if tools_index.is_file() and "pickTools" not in tools_index.read_text(encoding="utf-8"):
        report.warn("crew/tools/index.ts", "no pickTools(): a typo in a custom tool name would go unnoticed")
    check_fallbacks(report, decisions, otherwise)
    return shell


# Why a decision task needs a fallback or an otherwise task (D96; Orkeon 1.2.0: `DecisionPreflight.Check`,
# `DecisionTaskRules.CheckFallbacks`): with the decision circuit off a decision task answers from its fallback, and
# one with neither a non-empty fallback nor a task gated `otherwise` on it stops the run before its first task.
FALLBACK_WHY = ("the circuit is off with no decision provider — the workshop's default: no Orkeon:TypeSafe nor "
                "TYPESAFE_API_KEY, no Orkeon:Liquid nor LIQUID_API_KEY, no Orkeon:Decision:Provider naming kev — and "
                "under --no-decision, and Orkeon then refuses the run before its first task ('Decision task … has "
                "neither a fallback nor an otherwise task'); the team must work without a provider (D96)")


def check_fallbacks(report, decisions, otherwise):
    """Each `.decision({...})` task of the sources has a non-empty `fallback` or a task `.when("<name>", "otherwise")`;
    `otherwise` holds the literal task names and the expressions the `.when(…, "otherwise")` calls name."""
    if DECISION_MODE == "required":
        # D96: the team must work without a decision provider; mode required refuses every run without one (exit 69).
        report.error("crew/crew.ork.ts", ".decision({ mode: \"required\" }): without a decision provider (the workshop's "
                                         "default) Orkeon refuses every run of the crew ('requires System One … the decision "
                                         "circuit is off', exit 69), and the team must work without one (D96) — use optional "
                                         "with a without: relay on each decision task, or leave the mode out")
    if DECISION_MODE == "optional" and not decisions:
        report.error("crew/crew.ork.ts", ".decision({ mode: \"optional\" }) declares at least one decision task, and this "
                                         "crew has none — Orkeon refuses the crew at load")
    for where, name, contract in decisions:
        label = f"decision task '{name or '?'}'"
        fallback, without = contract["fallback"], contract["without"]
        if fallback == "refused":
            report.error(where, f"{label}: fallback must be an object of strings — the script throws when the crew loads")
            continue
        if without is not None and without[0] == "refused":
            report.error(where, f"{label}: {without[1]} — Orkeon refuses the crew at load")
        if DECISION_MODE == "none":
            report.error(where, f"{label}, which a crew with decision.mode: none refuses at load")
            continue
        relay = without is not None and without[0] != "unknown"
        if relay and DECISION_MODE is None:
            report.error(where, f"{label} declares a without: relay, which Orkeon refuses at load unless the crew declares "
                                ".decision({ mode: \"optional\" })")
        if relay and without[0] == "agent" and AGENT_NAMES is not None and without[1] not in AGENT_NAMES:
            report.error(where, f"{label}: without.agent '{without[1]}' is no agent of the crew "
                                f"({', '.join(sorted(AGENT_NAMES))}) — Orkeon refuses the crew at load")
        if DECISION_MODE == "optional":
            if fallback == "yes":
                report.error(where, f"{label} declares a fallback, which a crew with decision.mode: optional never uses (the "
                                    "model answers with the circuit on, the relay with it off): Orkeon refuses the crew at "
                                    "load — remove it")
            if without is None:
                report.error(where, f"{label} has no without: relay, which a crew with decision.mode: optional requires on "
                                    "every decision task — Orkeon refuses the crew at load")
            continue
        if DECISION_MODE == "required":
            continue
        if fallback == "yes" or (name is not None and name in otherwise["literal"]):
            continue
        if relay or (DECISION_MODE == "unknown" and without is not None):
            continue
        if fallback == "no" and without is None and (otherwise["expression"] or (name is None and otherwise["literal"])):
            named = ", ".join(sorted(otherwise["expression"])) or "a literal task the name of this one cannot be matched to"
            report.warn(where, f"decision task '{name or '?'}' has no 'fallback', and the check cannot tell whether a "
                               f".when(…, \"otherwise\") gates a task on it (it names {named}): make sure one does, or give "
                               f"it a fallback: {FALLBACK_WHY}")
            continue
        if fallback == "unknown" or without is not None:
            report.warn(where, f"decision task '{name or '?'}': its fallback is no object literal the check can read — "
                               f"make sure it gives every question an answer, or gate a task .when(…, \"otherwise\"): {FALLBACK_WHY}")
        else:
            report.error(where, f"decision task '{name or '?'}' has neither a 'fallback' nor an otherwise task: {FALLBACK_WHY}")


def main():
    args = sys.argv[1:]
    orkeon = None
    if "--orkeon" in args:
        i = args.index("--orkeon")
        orkeon = args[i + 1]
        del args[i:i + 2]
    if len(args) != 1:
        sys.exit(__doc__)
    team = Path(lexical(os.path.abspath(args[0])))  # as written, like the mount points: no symbolic link followed
    report = Report()
    check_layout(report, team)
    source, points = mount_points(report, team)
    check_mounts(report, team, source, points)
    settings = check_settings(report, team)
    global TEAM_PROFILES, DECISION_PROFILES
    TEAM_PROFILES = None if settings is None else {
        k.lower().split(":")[2] for k, _ in settings if re.fullmatch(r"llm:profiles:[^:]+(:.*)?", k.lower())}
    DECISION_PROFILES = set() if settings is None else {
        k.lower().split(":")[3] for k, _ in settings if re.fullmatch(r"orkeon:decision:profiles:[^:]+(:.*)?", k.lower())}
    global LADDER
    LADDER = None if settings is None else [
        str(v).strip().lower() for k, v in settings if re.fullmatch(r"orkeon:decision:route:ladder:\d+", k.lower())]
    check_shell(report, settings, check_sources(report, team, load_catalogue(orkeon), points))
    check_studio(report, team)
    for line in report.errors + report.warnings:
        print(line)
    print(f"{'FAILED' if report.errors else 'OK'}: {len(report.errors)} error(s), {len(report.warnings)} warning(s)")
    sys.exit(1 if report.errors else 0)


if __name__ == "__main__":
    main()
