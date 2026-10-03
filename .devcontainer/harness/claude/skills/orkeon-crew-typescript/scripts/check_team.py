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
catalogue embedded below (Orkeon main at a2bb6c3) is used. Exit code 1 when an error is found.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

# `orkeon run --list-tools` on Orkeon main at a2bb6c3 (1.0.0-rc.4.src.20261003.ga2bb6c3): 83 names
# (brave_search only exists when BRAVE_API_KEY is set).
EMBEDDED_TOOLS = """
arcadedb_query cache_search codebase_map codebase_search complexity_report count_pattern csv_reader
database_schema dependency_graph directory_read directory_search docx_reader docx_writer
email_accounts email_create_folder email_delete email_draft email_folders email_mark email_move
email_parser email_read email_rename_folder email_save_attachment email_search email_send file_read
file_write flow_trace get_last_value github graph_schema http_api human_input image_generation
impact_analysis incremental_reindex index_codebase index_status is_path_indexed janusgraph_query
json_tool list_mounts local_embed_text mariadb_query mdx_search memory_store mongodb_query
mongodb_schema mysql_query package_summary pdf_reader pdf_search post_message postgres_query
publish_event rag_eval rag_ingest rag_search receive_message relational_database_query reply_to scrape_element semantic_search
send_request session_cost session_snip session_stats session_store shell_command sqlserver_query
statement_query sub_graph symbol_detail symbol_source token_budget txt_search wait_for_event
web_scrape web_search xlsx_reader xlsx_writer xml_parser
""".split()
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
    (r"\.(withState|onError|budget|onCrewStart|onCrewComplete|onCrewError|onAgentStart|onAgentStop)\s*\(",
     "ignored by the declarative shape"),
    (r"^\s*///\s*<reference\s+orkeon-script", "the orkeon-script pragma fails tsc (TS1084) — remove it"),
    (r"\brequire\s*\(|\bprocess\.|\bfetch\s*\(|\bBuffer\.|\bsetTimeout\s*\(|\bconsole\.",
     "Node/DOM API: absent under Jint — use the built-in tools"),
    (r"^\s*import\s[^;]*from\s+[\"'](?!\.)", "only relative imports are bundled"),
    (r"globalThis\.inputs|\binputs\.", "`inputs` does not exist in the declarative shape — read the files of a read-only mount point"),
]
RESERVED_ROOTS = ("/crew", "/script", "/llm-logs", "/sandbox", "/credentials")


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def error(self, where, message):
        self.errors.append(f"ERROR   {where}: {message}")

    def warn(self, where, message):
        self.warnings.append(f"WARNING {where}: {message}")


def load_catalogue(orkeon):
    if not orkeon:
        return set(EMBEDDED_TOOLS)
    out = subprocess.run([orkeon, "run", "--list-tools"], capture_output=True, text=True, check=False)
    names = {line.strip() for line in out.stdout.splitlines() if re.fullmatch(r"[a-z0-9_]+", line.strip())}
    if not names:
        sys.exit(f"`{orkeon} run --list-tools` returned no tool:\n{out.stdout}{out.stderr}")
    return names


def strip_comments(source):
    """Blanks comments out, keeping the line count so reported line numbers stay true."""
    source = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), source, flags=re.S)
    return "\n".join("" if line.lstrip().startswith("//") and "orkeon-script" not in line else line
                     for line in source.splitlines())


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
    try:
        card = team / "studio-team.json"
        data = json.loads(card.read_text(encoding="utf-8")) if card.is_file() else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        data = {}  # the card check reports it
    for spec in (data.get("mounts") or []) if isinstance(data, dict) else []:
        parts = re.sub(r"^[0-9A-Z]{26}\|", "", str(spec)).rsplit(":", 2)
        if len(parts) == 3 and MOUNT_ROOT.fullmatch(parts[1]) and parts[2] in MOUNT_ACCESSES:
            check_reach(report, team, "studio-team.json", parts[1], parts[0])
            points.append((parts[1], parts[2], in_team(team, parts[0])))
    return "studio-team.json", points


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
        card = team / "studio-team.json"
        data = json.loads(card.read_text(encoding="utf-8")) if card.is_file() else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        return  # the card check reports it
    mounts = [str(m) for m in (data.get("mounts") or [])] if isinstance(data, dict) else []
    declared = {root for root, _, _ in points}
    for root, access, folder in points:
        found = f"./{folder}:{root}:{access}" in mounts if folder else any(m.endswith(f":{root}:{access}") for m in mounts)
        if not found:
            report.error("studio-team.json", f"mounts lacks the mount point {root} ({access}) of mounts.json: "
                                             "run `orkeon-bench scaffold <team>`")
    for spec in mounts:
        parts = spec.rsplit(":", 2)
        if len(parts) == 3 and parts[1] not in declared:
            report.error("studio-team.json", f"mounts names {parts[1]}, which mounts.json does not declare: "
                                             "run `orkeon-bench scaffold <team>`")
    for launcher in ("run.sh", "run.cmd"):
        path = team / launcher
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if STUDIO_LAUNCHER in text:
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
# for D40 on 2026-10-03). At the root of a team folder, crew/ is the definition of the team, Orkeon
# Studio takes a folder holding agents/ or tasks/ for the crew itself, and Orkeon looks for settings
# in appsettings/ and _shared/ — there and in every folder above.
RESERVED_TEAM_FOLDERS = ("crew", "agents", "tasks", "appsettings", "_shared")
CREW_FOLDER, STUDIO_CREW_FOLDERS, SETTINGS_FOLDERS = RESERVED_TEAM_FOLDERS[0], RESERVED_TEAM_FOLDERS[1:3], RESERVED_TEAM_FOLDERS[3:]
SETTINGS_WALK_CANDIDATES = tuple(f"{folder}/appsettings.json" for folder in SETTINGS_FOLDERS)
# The folders of a workshop that a mount point may neither hold nor lie in, and what they would expose.
WORKSHOP_FOLDERS = (("settings", "the settings of every team"),
                    ("workbooks", "the workbooks of every team, with the approvals of paid runs"),
                    ("tests", "the tests of every team, with their budgets"),
                    (".claude", "the harness"),
                    ("library", "the workshop's library, which other teams are built from"),
                    ("references", "the reference documents Claude builds teams from"),
                    (".devcontainer", "the workshop's container configuration, which runs at its next start"),
                    (".git", "the workshop's git repository, whose hooks run at the next git command"))
# The two ways a stray settings file takes over a run (orkeon-bench doctor says the same).
# What Orkeon Studio writes at the top of the launchers it writes over (TeamLauncherScript.Header, a2bb6c3):
# after « Change the folders », or a change of the model setting the card names.
STUDIO_LAUNCHER = "Generated by Orkeon Forge for the team"
STUDIO_WROTE = ("Orkeon Studio wrote this launcher over (« Change the folders » or the card's model setting): it knows "
                "neither TEAM_ENV nor settings/<slug>/ — change the folders in mounts.json, then run `orkeon-bench "
                "scaffold <team>` again")
SETTINGS_INSTEAD = ("Orkeon reads this file instead of the machine's settings for every run that names no settings file "
                    "(Orkeon Studio names none unless an Expert pins one) — remove it: a team's own settings live in "
                    "settings/<slug>/appsettings.json (D33)")
SETTINGS_BENEATH = ("Orkeon no longer reads the appsettings files of the working directory (main at a2bb6c3): this file "
                    "has no effect on a run of the team, but it is the settings file of `orkeon run --list-tools`, "
                    "`orkeon doctor`, `orkeon email` and `orkeon mcp serve` started from the team folder — remove it: "
                    "a team's own settings live in settings/<slug>/appsettings.json (D33)")
# The variables a settings file must not name as a model key (Llm:ApiKeyEnvVar): the key would go to that
# provider's endpoint — a GitHub token, Claude Code's own credentials.
FOREIGN_KEY_VARIABLES = re.compile(r"(GH|GITHUB)_[A-Z_]*TOKEN|GITHUB_PAT|CLAUDE_CODE_[A-Z_]*|ANTHROPIC_AUTH_TOKEN")


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
        if first in STUDIO_CREW_FOLDERS:
            return (f"{root} is bound to ./{inside}: Orkeon Studio takes a team folder holding {first}/ for the crew itself, and "
                    "the launch fails — name the folder otherwise"), True
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
    """A settings file Orkeon finds above the team on its own — `appsettings/appsettings.json` or
    `_shared/appsettings.json` in `teams/`, in the workshop or higher — replaces the machine's settings
    for every run that names none, and Orkeon Studio names none unless an Expert pins one."""
    folder = Path(os.path.abspath(team)).parent
    while True:
        for candidate in SETTINGS_WALK_CANDIDATES:
            if (folder / candidate).is_file():
                report.error(str(folder / candidate), SETTINGS_INSTEAD)
        if folder.parent == folder:
            return
        folder = folder.parent


def check_settings_content(report, where, entries):
    """What a team's settings file must not hold: a secret (keys stay in the environment), a machine-wide
    setting that opens code execution, a weakened protection of the web tools (security.md § 2, § 4, § 7),
    mount points or allowed folders that mounts.json does not judge, a token store moved out of the
    machine's folder. Keys compare ignoring case, as .NET reads them."""
    for key, value in entries:
        lowered = key.lower()
        last = lowered.rsplit(":", 1)[-1].replace("_", "")
        valued = (isinstance(value, str) and value.strip() != "") or (isinstance(value, (int, float)) and not isinstance(value, bool))
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
                                "ExtraAllowedCommands open code execution to every agent holding shell_command (security.md § 7)")
        if lowered.startswith(("orkeon:filesystem:mounts:", "orkeon:filesystem:internalmounts:")):
            report.error(where, f"{key}: a team's mount points belong in mounts.json, where what its agents reach is checked — "
                                "Orkeon mounts every entry of a settings file for each run that reads it")
        if lowered.startswith("pathsecurity:additionalalloweddirectories:"):
            report.error(where, f"{key} widens the folders Orkeon lets mount points reach — a team's folders are declared in "
                                "mounts.json")
        if lowered == "orkeon:tools:email:credentialsdirectory" and valued:
            report.error(where, f"{key} moves the OAuth tokens of the mail accounts out of the machine's folder, where no mount "
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
    """shell_command runs host commands with no confinement: `cat` reads any file the run can read,
    whatever the mount points (security.md § 7). A team with no settings file of its own (None) runs
    on the machine's settings, and on their mail accounts."""
    holder = "a team that holds a mail account"
    if settings is None and places:
        settings, holder = machine_settings(), "a team that runs on the machine's settings, which hold a mail account"
    mail = any(key.lower().startswith("orkeon:tools:email:accounts:") for key, _ in settings or [])
    for where in places:
        if mail:
            report.error(where, f"shell_command in {holder}: `cat` reads the OAuth tokens of the account, the settings and, "
                                "through /proc, the model's key, whatever the mount points — give the agent the file tools "
                                "instead (security.md § 7)")
        else:
            report.warn(where, "shell_command is confined by nothing: `cat` reads the settings, the OAuth tokens of the mail "
                               "accounts, the credentials of Claude Code and, through /proc, the model's key, whatever the "
                               "mount points — give it to no agent that reads untrusted input (security.md § 7)")


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
    strays = [*(team / "appsettings").glob("*.json"), *(team / "_shared").glob("appsettings*.json")]
    if (team / "crew").is_dir():
        strays += list((team / "crew").rglob("appsettings*.json"))
    for stray in sorted(beneath | {p for p in strays if p.is_file()}):
        if stray in beneath:
            report.warn(str(stray.relative_to(team)), SETTINGS_BENEATH)
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

    card = team / "studio-team.json"
    if not card.is_file():
        report.error("studio-team.json", "missing")
    else:
        text = card.read_text(encoding="utf-8")
        try:
            data = json.loads(text)
            for field in ("name", "description"):
                if not data.get(field):
                    report.warn("studio-team.json", f"'{field}' is empty")
        except json.JSONDecodeError as exc:
            report.error("studio-team.json", f"invalid JSON: {exc}")
        if "{{" in text:
            report.error("studio-team.json", "template placeholder left")

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
        if STUDIO_LAUNCHER in text:
            report.error("run.sh", STUDIO_WROTE)
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
        if STUDIO_LAUNCHER.encode() in raw:
            report.error("run.cmd", STUDIO_WROTE)
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


def check_profile(report, where, profile):
    """`llm.profile("<id>")` (an agent) or `.withProfile("<id>")` (a task): the agent calls the named
    profile Llm:Profiles:<id> of the settings the run reads — `default` is the Llm section itself. An
    unknown profile fails the load."""
    name = str(profile).strip()
    if not name or name.lower() == "default":
        return
    if TEAM_PROFILES is None:
        report.warn(where, f"profile '{name}' must be defined in the settings the run reads — give the team its settings "
                           f"file, settings/<slug>/appsettings.json, with Llm:Profiles:{name}, or the load fails")
    elif name.lower() not in TEAM_PROFILES:
        report.error(where, f"profile '{name}' is not defined in settings/<slug>/appsettings.json (Llm:Profiles:{name}): "
                            "the load fails, listing the known profiles")
    report.warn(where, f"profile '{name}': in Orkeon Studio the team runs on Studio's settings, which must define the same "
                       "profile (a Studio model setting named so); a remote profile makes every run of the team remote for "
                       "the run gate")


def check_sources(report, team, catalogue, points):
    """The TypeScript sources; returns the files that give an agent shell_command."""
    crew = team / "crew"
    entry = crew / "crew.ork.ts"
    sources = sorted(p for p in crew.rglob("*.ts") if p.is_file())
    shell = []
    for path in sources:
        where = str(path.relative_to(team))
        raw = path.read_text(encoding="utf-8")
        if "{{" in raw:
            report.error(where, "template placeholder '{{…}}' left")
        code = strip_comments(raw)
        for number, line in enumerate(code.splitlines(), 1):
            for pattern, message in FORBIDDEN:
                if re.search(pattern, line):
                    report.error(f"{where}:{number}", message)
        for number, line in enumerate(code.splitlines(), 1):
            if re.search(r"\bllm\s*\.\s*model\s*\(", line):
                report.warn(f"{where}:{number}", "llm.model(…) pins the model the agent asks its provider for: it must exist at "
                                                 "every endpoint the team runs on — leave the model to the settings the run reads "
                                                 "unless a decision says otherwise")
            for name in re.findall(r"(?:\bllm\s*\.\s*profile|\.withProfile)\s*\(\s*[\"'`]([^\"'`]*)[\"'`]", line):
                check_profile(report, f"{where}:{number}", name)
            if re.search(r"(?:\bllm\s*\.\s*profile|\.withProfile)\s*\(\s*[^\"'`\s]", line):
                report.warn(f"{where}:{number}", "a profile named by an expression: the check cannot tell whether the settings "
                                                 "define it, and the run gate judges every profile of the settings")
        # Built-in tools named in .tools([...]).
        for block in re.findall(r"\.tools\s*\(\s*\[(.*?)\]", code, flags=re.S):
            for tool in re.findall(r"[\"']([^\"']+)[\"']", block):
                if tool in COWORKER_TOOLS:
                    report.error(where, f"'{tool}' is added automatically by allowDelegation — do not list it")
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
            elif target.startswith(RESERVED_ROOTS) or (points and not any(target.startswith(f"{root}/") for root in writable_roots(points))):
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
        agents = len(re.findall(r"\bagentBuilder\s*\(", code))
        if agents and len(re.findall(r"\.allowDelegation\s*\(", code)) < agents:
            report.warn("crew/crew.ork.ts", "an agent without .allowDelegation(...): write it explicitly")
        if ".deliverable(" not in code:
            report.warn("crew/crew.ork.ts", "no task has a deliverable: nothing will be written to a mount point")
    tools_index = crew / "tools" / "index.ts"
    if tools_index.is_file() and "pickTools" not in tools_index.read_text(encoding="utf-8"):
        report.warn("crew/tools/index.ts", "no pickTools(): a typo in a custom tool name would go unnoticed")
    return shell


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
    global TEAM_PROFILES
    TEAM_PROFILES = None if settings is None else {
        k.lower().split(":")[2] for k, _ in settings if re.fullmatch(r"llm:profiles:[^:]+(:.*)?", k.lower())}
    check_shell(report, settings, check_sources(report, team, load_catalogue(orkeon), points))
    check_studio(report, team)
    for line in report.errors + report.warnings:
        print(line)
    print(f"{'FAILED' if report.errors else 'OK'}: {len(report.errors)} error(s), {len(report.warnings)} warning(s)")
    sys.exit(1 if report.errors else 0)


if __name__ == "__main__":
    main()
