#!/usr/bin/env python3
"""Static check of an Orkeon team folder written in YAML (crew/config.yaml + agents/ + tasks/).

`orkeon run --validate` loads the crew and resolves the tools — since Orkeon main at 63be532 it
refuses an unknown, retired or duplicate key, a `<<:` merge key and a wrongly shaped block, with
its file and line, and at 1.2.0 an `agent:` or `dependencies:` id that names nothing, a
`memoryProvider` or a guardrails preset it does not know (run, 2026-11-17) — but it still lets
through an unknown `responseFormat`, `links.direction` or `graph.circuitBreakerPreset`, a deliverable
outside the writable mounts, and the layout. This script catches those, the ids and the keys too, plus
the Studio layout rules and the agreement of the team's folders, Studio card and launchers with
the mount points of its mounts.json. Run it BEFORE `./run.sh --validate`; both must pass.

Usage:
    check_crew.py <team-dir> [--orkeon /path/to/orkeon]

With --orkeon the tool catalogue is read from `orkeon run --list-tools`; without it, the
catalogue is read from references/orkeon/orkeon-reference.md § 5 (the one copy, D92). Exit code 1 when an error is found.
Requires PyYAML.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("check_crew.py needs PyYAML (pip install pyyaml)")

COWORKER_TOOLS = {"ask_question_to_coworker", "delegate_work_to_coworker"}
UNAVAILABLE_TOOLS = {"slack_send_message", "slack_read_messages", "spawn_agent", "code_interpreter", "progress_report"}
# The longest maxExecutionTime Orkeon accepts (AgentDefaults.MaxExecutionTimeCeiling, uint.MaxValue - 1 ms; Orkeon 1.2.0).
MAX_EXECUTION_SECONDS = 4294967
# The virtual roots of the runner, which no mount point of a team may take: `orkeon run` refuses the mount at
# start ("'/state' is a virtual root reserved by the runner", Orkeon 1.2.0, checked on the CLI: /crew, /llm-logs,
# /llm-mock, /llm-cassette, /sandbox, /state, /runs, /credentials), /script on the scripting path. The same list
# as the bench's (`RESERVED_ROOTS`, virtual-root.ts) and check_team.py's.
RESERVED_ROOTS = ("/crew", "/script", "/llm-logs", "/llm-mock", "/llm-cassette", "/sandbox", "/state", "/runs", "/credentials")
# The Studio card of a team (`ConventionalNames.TeamSidecarFile`, Orkeon 1.2.0); `studio-team.json` before
# 1.0.0-rc.7, a name Orkeon Studio still reads and `orkeon-bench scaffold` carries over.
TEAM_CARD = "team.json"
LEGACY_TEAM_CARD = "studio-team.json"

# Accepted keys per block, from YamlConfigModels.cs. A key is read as written in camelCase, or in
# snake_case turned to camelCase, case-sensitively (`CrewYamlKeyCheck`, Orkeon 1.2.0): any
# other key refuses the load. `get()` still finds a value whatever its spelling.
KEYS = {
    "crew": "name goal process verbose memory memoryProvider planning managerAgent "
            "graph llm rag links mounts announceMounts anchors maxRpm budget",
    "agent": "role goal backstory workingRoot filesystem announceMounts permissionMode tools allowDelegation maxIter maxRpm "
             "maxExecutionTime verbose llm guardrails knowledge",
    "task": "description expectedOutput agent tools dependencies asyncExecution retry humanInput context "
            "deliverable llmOverride guardrails decision when",
    "llm": "model profile temperature maxTokens topP thinking responseFormat responseSchema cache",
    "llmOverride": "profile responseFormat responseSchema temperature maxTokens topP thinking cache",
    "thinking": "enabled effort budgetTokens",
    "responseSchema": "name schema strict",
    "cache": "system tools ttl",
    "deliverable": "path source format sanitize schemaPath schemaInline",
    "guardrails": "preset header rules toolRules",
    "retry": "attempts backoffMs backoff",
    "filesystemEntry": "path access",
    "graph": "start nodes edges circuitBreakerPreset maxTransitions maxVisits maxTotalDurationSeconds",
    "graphNode": "id task",
    "graphEdge": "from to when",
    "rag": "collections defaults",
    "ragCollection": "sources chunking",
    "ragChunking": "strategy maxTokens overlap",
    "ragDefaults": "profile",
    "link": "to direction allowedTopics",
    "budget": "tokens wallTimeSeconds toolCalls delegationDepth spawnedAgents",
    "decision": "questions minConfidence state longContext fallback",
    "question": "choice score noul instructions",
}
ENUMS = {
    "process": {"sequential", "hierarchical", "parallel", "consensual", "graph", "autonomous"},
    "memoryProvider": {"inmemory", "redis", "sqlite", "chromadb", "pinecone", "lancedb"},
    "responseFormat": {"text", "json_object", "json_schema"},
    "guardrailPreset": {"analysis", "strict", "creative"},
    "circuitPreset": {"strict", "permissive", "default"},
    "deliverableSource": {"final_message", "structured_output", "tool_call", "none"},
    "deliverableFormat": {"markdown", "json", "text"},
    "linkDirection": {"outbound", "inbound", "bidirectional", "both"},
    "retryBackoff": {"fixed", "exponential"},
}
# The modes of the permission gate an agent may name, in any case (`PermissionModes.TryParse`, Orkeon 1.2.0,
# checked on the CLI); any other value fails the load.
PERMISSION_MODES = ("default", "acceptEdits", "bypassPermissions", "plan", "dontAsk")
# The modes that order tasks themselves refuse asyncExecution at load (Orkeon main at a2bb6c3).
ASYNC_PROCESSES = {"sequential", "parallel"}
# The processes that run a decision task or a `when:` condition (`DecisionTaskRules`, Orkeon 1.2.0).
DECISION_PROCESSES = {"sequential", "parallel", "graph"}


def norm(key):
    return str(key).replace("_", "").lower()


ALLOWED = {block: set(keys.split()) for block, keys in KEYS.items()}
# Keys removed from a block, with what replaces them, in Orkeon's words (`CrewYamlKeyCheck.s_retired`, Orkeon 1.2.0,
# checked on the CLI). A task's outputFile is reported below.
GRAPH_CONFIG_GUIDANCE = ("the crew-level circuit breaker bounded Graph mode only, where the graph block carries the same "
                         "settings — on a process: graph crew, write graph: { circuitBreakerPreset, maxTransitions, "
                         "maxVisits, maxTotalDurationSeconds }; other modes have no state machine to bound")
GRAPH_BLOCK_GUIDANCE = ("the graph block replaced it — write graph: { circuitBreakerPreset, maxTransitions, maxVisits "
                        "(formerly maxStateVisits), maxTotalDurationSeconds, and the nodes and edges }; a retry of a failed "
                        "task is the task's own retry:, and there is no maxCycles")
TASK_BREAKER_GUIDANCE = ("the task state machine it configured never ran — a task is bounded by its agent's maxIter and by "
                         "output-validation retries; Graph-mode limits live in the crew's graph block")
RETIRED = {("rag", "provider"): "the document store is the host's choice — set Orkeon:Rag:Provider in the settings",
           ("crew", "graphConfig"): GRAPH_BLOCK_GUIDANCE}
# The keys of a `knowledge:` entry, which its parser reads lower-cased without underscores.
KNOWLEDGE_KEYS = ("collection", "topK", "minScore", "profile", "maxContextTokens")


def snake_to_camel(key):
    """`expected_output` → `expectedOutput`, as the loader turns a snake_case key (`SnakeToCamelCase`)."""
    out, upper = [], False
    for char in key:
        if char == "_":
            upper = True
            continue
        out.append(char.upper() if upper else char)
        upper = False
    return "".join(out)


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def error(self, where, message):
        self.errors.append(f"ERROR   {where}: {message}")

    def warn(self, where, message):
        self.warnings.append(f"WARNING {where}: {message}")


def get(block, name):
    """Value of `name` in a mapping, whichever of camelCase / snake_case it was written in."""
    if not isinstance(block, dict):
        return None
    for key, value in block.items():
        if norm(key) == norm(name):
            return value
    return None


def check_keys(report, where, block, kind):
    if block is None:
        return
    if not isinstance(block, dict):
        report.error(where, f"'{kind}' must be a mapping, found {type(block).__name__}")
        return
    for key in block:
        name = str(key)
        if name in ALLOWED[kind] or snake_to_camel(name) in ALLOWED[kind]:
            continue
        if (kind, snake_to_camel(name)) in RETIRED:
            report.error(where, f"'{name}' is retired, and Orkeon refuses the crew at load: {RETIRED[(kind, snake_to_camel(name))]}")
            continue
        same = next((k for k in ALLOWED[kind] if norm(k) == norm(name)), None)
        hint = f" — write '{same}' (keys are case-sensitive)" if same else ""
        report.error(where, f"'{name}' is not a key Orkeon reads, and it refuses the crew at load{hint} "
                            f"(accepted: {', '.join(sorted(ALLOWED[kind]))})")


def check_decision(report, where, task_id, task, decision, agent, tasks, config):
    """A decision task (`decision:`, answered by the decision model instead of an agent) and a conditioned task
    (`when:`), as Orkeon refuses them at load (`DecisionTaskRules`, `WhenClauseParser`, `YamlCrewMapper`; Orkeon 1.2.0)."""
    when = get(task, "when")
    if decision is None and when is None:
        return
    process = str(get(config, "process") or "sequential").lower() if isinstance(config, dict) else "sequential"
    if process not in DECISION_PROCESSES:
        report.error(where, f"a decision or a when: condition is refused at load by process: {process} "
                            "(sequential, parallel and graph run them)")
    if decision is not None:
        check_keys(report, f"{where} decision", decision, "decision")
        if agent is not None:
            report.error(where, "a decision task runs no agent: remove one of 'decision' and 'agent'")
        questions = get(decision, "questions")
        if not isinstance(questions, dict) or not questions:
            report.error(f"{where} decision", "'questions' is required: a mapping of question name to its block")
        for name, question in (questions.items() if isinstance(questions, dict) else []):
            check_keys(report, f"{where} decision.questions.{name}", question, "question")
        for state in get(decision, "state") or []:
            if state not in tasks:
                report.error(f"{where} decision", f"state '{state}' names no file in crew/tasks/")
        # With the decision circuit off the run is refused before its first task (`DecisionTaskRules.CheckFallbacks`).
        # It is off with no decision provider — the workshop's default, or --no-decision. Since Orkeon main at 0ea39d9
        # there are three (`RunnerHost`, V-54): TypeSafe and Liquid are deduced from their section (Orkeon:TypeSafe,
        # Orkeon:Liquid) or their key (TYPESAFE_API_KEY, LIQUID_API_KEY); Kev is never deduced and runs only when
        # Orkeon:Decision:Provider names it.
        otherwise = any(isinstance(other, dict) and isinstance(get(other, "when"), dict)
                        and get(other, "when").get(task_id) == "otherwise" for other in tasks.values())
        # D96: the team must work without a provider, so the check refuses what Orkeon refuses then.
        if not get(decision, "fallback") and not otherwise:
            report.error(f"{where} decision", "neither 'fallback' answers nor an 'otherwise' task: without a decision "
                                              "provider (no Orkeon:TypeSafe or TYPESAFE_API_KEY, no Orkeon:Liquid or "
                                              "LIQUID_API_KEY, no Orkeon:Decision:Provider naming kev — Kev is never "
                                              "deduced — the workshop's default) or under --no-decision, Orkeon refuses "
                                              "the run before its first task ('Decision task … has neither a fallback "
                                              "nor an otherwise task'), and the team must work without one (D96)")
    if when is None:
        return
    if not isinstance(when, dict) or not when:
        report.error(where, "when: is empty — name a decision task and its answers, or remove the key")
        return
    target = str(next(iter(when))).split(".")[0]
    if any(str(key).split(".")[0] != target for key in when):
        report.error(where, f"when: reads one decision task, not '{target}' and another")
    elif not isinstance(tasks.get(target), dict) or get(tasks[target], "decision") is None:
        report.error(where, f"when: names '{target}', which is not a decision task of the crew")
    for key, value in when.items():
        segments = str(key).split(".")
        if len(segments) == 1 and (value != "otherwise" or len(when) > 1):
            report.error(where, f"when: '{key}' takes the value otherwise, alone")
        elif len(segments) > 3:
            report.error(where, f"when: '{key}' has more than three segments (task.question.option)")
        elif len(segments) > 1 and not (isinstance(value, str) or (len(segments) == 2 and isinstance(value, list))):
            report.error(where, f"when: '{key}' takes a list of options (task.question) or a threshold such as '>= 0.7'")


def check_positive(report, where, block, key, what, unset):
    """A count Orkeon refuses at load when it is 0 or less (maxIter, maxRpm, maxExecutionTime;
    an llm or llmOverride maxTokens since 13461ea; Orkeon 1.2.0)."""
    value = get(block, key)
    if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value < 1):
        report.error(where, f"{key}: {value} — {what} must be a whole number, 1 or more: Orkeon refuses the crew at load "
                            f"(leave {key} out for {unset})")


def check_enum(report, where, value, enum, label):
    if value is not None and str(value).lower() not in ENUMS[enum]:
        report.error(where, f"{label} '{value}' is not one of {', '.join(sorted(ENUMS[enum]))}")


# The levels `LlmThinkingConfig.ValidateEffort` admits, in its order (Orkeon 1.2.0).
EFFORT_LEVELS = ("low", "medium", "high", "xhigh", "max")


def check_effort(report, where, effort):
    """`thinking.effort`: exactly one of the levels, lower case — `High` is refused at load since Orkeon main at
    c101cbd (`YamlCrewMapper` → `LlmThinkingConfig.ValidateEffort`), with this message. A blank one pins nothing."""
    if effort is None or (isinstance(effort, str) and not effort.strip()):
        return
    if str(effort) not in EFFORT_LEVELS:
        report.error(where, f"thinking.effort: Unknown thinking effort '{effort}': expected one of "
                            f"{', '.join(EFFORT_LEVELS)} (lower case). Orkeon refuses the crew at load")


def check_llm(report, where, llm, kind):
    check_keys(report, where, llm, kind)
    if not isinstance(llm, dict):
        return
    check_positive(report, where, llm, "maxTokens", "the tokens the model may answer with", "the inherited cap")
    if kind == "llm" and get(llm, "model") is not None:
        report.warn(where, "llm.model pins the model the agent asks its provider for: it must exist at every endpoint the "
                           "team runs on (the local model server, a remote provider, Studio's settings) — leave the model "
                           "to the settings the run reads unless a decision says otherwise")
    profile = get(llm, "profile")
    if profile is not None:
        check_profile(report, where, profile)
    thinking = get(llm, "thinking")
    check_keys(report, f"{where} thinking", thinking, "thinking")
    check_effort(report, f"{where} thinking", get(thinking, "effort"))
    check_enum(report, where, get(llm, "responseFormat"), "responseFormat", "responseFormat")
    schema = get(llm, "responseSchema")
    check_keys(report, f"{where} responseSchema", schema, "responseSchema")
    if isinstance(schema, dict) and get(schema, "schema") is not None and not isinstance(get(schema, "schema"), str):
        report.error(f"{where} responseSchema", "'schema' must be a JSON STRING, not a YAML mapping")
    check_cache(report, f"{where} cache", get(llm, "cache"))


def check_cache(report, where, cache):
    """The prompt-cache block (`LlmCacheConfig.Request`, Orkeon 1.2.0): a `ttl` other than 5m or 1h fails the
    load, and so does a `ttl` with neither `system` nor `tools` (since 0ea39d9); a block that marks nothing cacheable
    and has no ttl (`cache: {}`) is the explicit off, which also turns the host's `Llm:Cache` off."""
    check_keys(report, where, cache, "cache")
    if not isinstance(cache, dict):
        return
    ttl = get(cache, "ttl")
    if ttl is not None and str(ttl) not in ("5m", "1h"):
        report.error(where, f"cache ttl must be 5m or 1h, not '{ttl}' — Orkeon refuses the crew at load since main at "
                            "f80665f; leave it out for the vendor default")
    if ttl is not None and get(cache, "system") is not True and get(cache, "tools") is not True:
        report.error(where, "cache ttl caches nothing on its own: mark the system prompt or the tools as well. Orkeon "
                            "refuses the crew at load since main at 0ea39d9 — set system: true or tools: true, or remove "
                            "the ttl (cache: {} is the explicit off)")


def check_guardrails(report, where, block):
    check_keys(report, where, block, "guardrails")
    check_enum(report, where, get(block, "preset"), "guardrailPreset", "guardrails preset")


def check_circuit(report, where, block, guidance):
    if block is not None:
        report.error(where, f"circuitBreaker is removed from Orkeon, which refuses it at load (main at a2bb6c3): {guidance}")


def check_retry(report, where, retry, decision):
    """A task's `retry:` block (`YamlCrewMapper`, Orkeon 1.2.0, each refusal checked on the CLI): `attempts` is
    required, 1 or more; `backoffMs` is never negative; `backoff` is fixed or exponential; a decision task, which
    runs no agent, takes none."""
    if retry is None:
        return
    check_keys(report, where, retry, "retry")
    if not isinstance(retry, dict):
        return
    if decision is not None:
        report.error(where, "a decision task takes no retry: Orkeon refuses the crew at load — remove one of 'decision' and 'retry'")
    attempts = get(retry, "attempts")
    if attempts is None:
        report.error(where, "attempts is required, the number of times the task may run (1 or more): Orkeon refuses the crew at load")
    elif not isinstance(attempts, int) or isinstance(attempts, bool) or attempts < 1:
        report.error(where, f"attempts: {attempts} — a task runs at least once: use 1 or more, or remove retry. Orkeon refuses "
                            "the crew at load")
    wait = get(retry, "backoffMs")
    if wait is not None and (not isinstance(wait, int) or isinstance(wait, bool) or wait < 0):
        report.error(where, f"backoffMs: {wait} — a wait in milliseconds, 0 or more: Orkeon refuses the crew at load")
    backoff = get(retry, "backoff")
    if backoff is not None and str(backoff).strip().lower() not in ENUMS["retryBackoff"]:
        report.error(where, f"backoff '{backoff}' is unknown, use fixed or exponential: Orkeon refuses the crew at load")


def check_filesystem(report, where, entries, points):
    """An agent's `filesystem:` (Orkeon 1.2.0, `YamlCrewMapper`): the only virtual paths its tools may touch, a list
    of paths or of `{path, access}` — a lone path, a map or an empty list fails the load, and so does an unknown key
    or access. An entry under no mount point, or above the rights of its mount point, is refused when the run starts."""
    if entries is None:
        return
    if not isinstance(entries, list) or not entries:
        report.error(where, "'filesystem' is a list of virtual paths, or of { path, access }, with one entry at least: "
                            "Orkeon refuses the crew at load (leave the key out for no declaration)")
        return
    order = {"ro": 0, "rwnd": 1, "rw": 2}
    for entry in entries:
        path, access = entry, None
        if isinstance(entry, dict):
            check_keys(report, where, entry, "filesystemEntry")
            path, access = get(entry, "path"), get(entry, "access")
            if access is not None and access not in MOUNT_ACCESSES:
                report.error(where, f"access '{access}' is not one of {', '.join(MOUNT_ACCESSES)}: Orkeon refuses the crew at load")
                access = None
        if not isinstance(path, str) or not path.startswith("/"):
            report.error(where, f"'{path}' is not a virtual path (/input, /output/drafts...)")
            continue
        if not points:
            continue
        mount = next(((root, rights) for root, rights, _ in points if path == root or path.startswith(f"{root}/")), None)
        if mount is None:
            report.error(where, f"'{path}' lies under no mount point of the team ({', '.join(root for root, _, _ in points)}): "
                                "Orkeon refuses the run at its start")
        elif access is not None and order[access] > order[mount[1]]:
            report.error(where, f"'{path}' asks for {access}, above the {mount[1]} of the mount point {mount[0]}: an entry "
                                "narrows its mount, never widens it — Orkeon refuses the run at its start")


def check_graph(report, where, graph, process, tasks):
    """The `graph:` block of a `process: graph` crew (Orkeon 1.2.0, `GraphYamlConfig`): start, nodes {id, task},
    edges {from, to, when} and the budgets circuitBreakerPreset, maxTransitions, maxVisits, maxTotalDurationSeconds.
    Outside process: graph it is refused at load; so are a node naming no task, an edge naming no node, and a
    task-level `when:` or `dependencies:` beside nodes or edges (checked on the CLI). The topology itself (orphan
    node, no way to END, the edges of a decision) is `orkeon run --validate`'s to judge."""
    if graph is None:
        return
    check_keys(report, where, graph, "graph")
    if not isinstance(graph, dict):
        return
    if process != "graph":
        report.error(where, f"graph: is refused at load by process: {process} — remove it, or use process: graph")
    # The load checks neither the preset nor the budgets (checked on the CLI): a wrong one shows at run time only.
    check_enum(report, where, get(graph, "circuitBreakerPreset"), "circuitPreset", "circuitBreakerPreset")
    for key in ("maxTransitions", "maxVisits", "maxTotalDurationSeconds"):
        value = get(graph, key)
        if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value < 1):
            report.error(where, f"{key}: {value} — a limit of the graph is a whole number, 1 or more (leave it out for its "
                                "computed default); `orkeon run --validate` does not catch it")
    nodes, edges = get(graph, "nodes"), get(graph, "edges")
    for name, value in (("nodes", nodes), ("edges", edges)):
        if value is not None and not isinstance(value, list):
            report.error(where, f"'{name}' must be a list")
    nodes = nodes if isinstance(nodes, list) else []
    edges = edges if isinstance(edges, list) else []
    ids = set()
    for node in nodes:
        check_keys(report, f"{where} nodes", node, "graphNode")
        if not isinstance(node, dict):
            continue
        node_id, task = get(node, "id"), get(node, "task")
        if not node_id or str(node_id) in ("START", "END"):
            report.error(f"{where} nodes", f"a node needs an id, other than START and END (found '{node_id}')")
        else:
            ids.add(str(node_id))
        if str(task) not in tasks:
            report.error(f"{where} nodes", f"node '{node_id}': task '{task}' names no file in crew/tasks/")
    if not nodes:
        ids = set(tasks)  # one implicit node per task, its id the task's name
    else:
        named = {str(get(node, "task")) for node in nodes if isinstance(node, dict)}
        for task_id in tasks:
            if task_id not in named:
                report.error(f"{where} nodes", f"no node names the task '{task_id}': with nodes given, Orkeon refuses a task "
                                               "no node runs")
    for edge in edges:
        check_keys(report, f"{where} edges", edge, "graphEdge")
        if not isinstance(edge, dict):
            continue
        source, target = get(edge, "from"), get(edge, "to")
        if str(source) not in ids:
            report.error(f"{where} edges", f"from '{source}' names no node of the graph")
        if str(target) not in ids and target != "END":
            report.error(f"{where} edges", f"to '{target}' names no node of the graph (END ends the run)")
    start = get(graph, "start")
    if start is not None and str(start) not in ids:
        report.error(where, f"start '{start}' names no node of the graph")
    if nodes or edges:
        for task_id, task in tasks.items():
            for key in ("when", "dependencies"):
                if isinstance(task, dict) and get(task, key):
                    report.error(where, f"the task '{task_id}' carries '{key}:' beside the graph's nodes or edges: the edges "
                                        "order the tasks, and Orkeon refuses the crew at load — move the condition to an edge")


# The named profiles of the team's settings file (Llm:Profiles:<id>), lower-cased; None when the team
# has no settings file of its own. Set by main() before the crew is checked.
TEAM_PROFILES = None
# The decision profiles of the same file (Orkeon:Decision:Profiles:<name>), lower-cased: Orkeon registers each as a
# profile a crew may name (`DecisionProfileServiceCollectionExtensions`, Orkeon 1.2.0). Empty without a file.
DECISION_PROFILES = set()


def check_profile(report, where, profile):
    """`llm: { profile: <id> }` (crew, agent) or `llmOverride: { profile: <id> }` (task): the agent calls the
    named profile Llm:Profiles:<id> of the settings the run reads — `default` is the Llm section itself. An
    unknown profile fails the load."""
    name = str(profile).strip()
    if not name or name.lower() == "default":
        return
    if name.lower() in DECISION_PROFILES:
        report.warn(where, f"profile '{name}' is a decision profile (Orkeon:Decision:Profiles:{name}): Orkeon registers it "
                           "with or without a decision provider, and without one (the workshop's default) the agent's "
                           "first call fails ('no decision model is registered') — no fallback; a stub run (L2) points "
                           "it at the stub. Name its target LLM profile unless TEAM.md declares a decision model")
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


def check_tools(report, where, tools, catalogue):
    if tools is None:
        return
    if not isinstance(tools, list):
        report.error(where, "'tools' must be a list of names")
        return
    for tool in tools:
        if tool in COWORKER_TOOLS:
            report.error(where, f"'{tool}' is added automatically by allowDelegation — do not list it")
        elif tool in UNAVAILABLE_TOOLS:
            report.error(where, f"'{tool}' is not available to a team run by Studio / orkeon run")
        elif tool == "brave_search" and tool not in catalogue:
            report.error(where, "'brave_search' only exists when BRAVE_API_KEY is set — use web_search")
        elif tool not in catalogue:
            report.error(where, f"unknown tool '{tool}' (see `orkeon run --list-tools`)")


class CrewLoader(yaml.SafeLoader):
    """PyYAML's safe loader, noting what Orkeon refuses at load and PyYAML lets through: a key written twice
    in one block (PyYAML keeps the last) and a merge key `<<:` (PyYAML merges it; Orkeon 1.2.0)."""

    def __init__(self, stream):
        super().__init__(stream)
        self.faults = []

    def construct_mapping(self, node, deep=False):
        if isinstance(node, yaml.MappingNode):
            seen = set()
            for key_node, _ in node.value:
                line = key_node.start_mark.line + 1
                if key_node.tag == "tag:yaml.org,2002:merge":
                    self.faults.append(f"line {line}: a merge key (<<) is refused at load — write the keys out, or share "
                                       "a text block under 'anchors:'")
                elif isinstance(key_node, yaml.ScalarNode):
                    if key_node.value in seen:
                        self.faults.append(f"line {line}: duplicate key '{key_node.value}' — Orkeon refuses the crew at load")
                    seen.add(key_node.value)
        return super().construct_mapping(node, deep)


def load_yaml(report, path):
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        report.error(path.name, "not UTF-8")
        return None
    if "{{" in text:
        report.error(str(path), "template placeholder '{{…}}' left in the file")
    loader = CrewLoader(text)
    try:
        data = loader.get_single_data()
    except yaml.YAMLError as exc:
        report.error(str(path), f"invalid YAML: {exc}")
        return None
    finally:
        loader.dispose()
    for fault in loader.faults:
        report.error(str(path), fault)
    return data


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


def check_settings_content(report, where, entries):
    """What a team's settings file must not hold: a secret (keys stay in the environment), a machine-wide
    setting that opens code execution, a weakened protection of the web tools (security.md § 2, § 4, § 7),
    mount points or allowed folders that mounts.json does not judge, a token store moved out of the
    machine's folder, a variable reference or a model address Orkeon refuses at start. Keys compare ignoring
    case, as .NET reads them."""
    for key, value in entries:
        lowered = key.lower()
        last = lowered.rsplit(":", 1)[-1].replace("_", "")
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
    if not (crew / "config.yaml").is_file():
        report.error("crew/", "crew/config.yaml is missing")
    for sub in ("agents", "tasks"):
        if not (crew / sub).is_dir():
            report.error("crew/", f"crew/{sub}/ is missing")
    for pattern in ("*.ork.ts", "*.ork.js"):
        for script in crew.glob(pattern):
            report.error(str(script.relative_to(team)), "a script next to a YAML layout makes the folder ambiguous")
        for script in team.glob(pattern):
            report.error(str(script.relative_to(team)), "a script at the root of a YAML team: Orkeon runs crew/ and sets it "
                                                        "aside — one format per team")
    nested = crew / "crew"
    if any((nested / sub).is_dir() for sub in ("agents", "tasks")) or all((nested / flat).is_file() for flat in
                                                                         ("crew.yaml", "agents.yaml", "tasks.yaml")):
        report.error("crew/crew/", "a crew inside crew/: `orkeon run crew` reads a crew/ sub-folder first and would load this "
                                   "one instead of the team's (Orkeon 1.2.0) — move or rename it")
    for flat in ("agents.yaml", "tasks.yaml", "crew.yaml"):
        if (crew / flat).exists():
            report.error(f"crew/{flat}", "flat-triplet file next to the multi-file layout")

    card, legacy = team / TEAM_CARD, team / LEGACY_TEAM_CARD
    if legacy.is_file():
        report.error(LEGACY_TEAM_CARD, "the Studio card is team.json since Orkeon 1.0.0-rc.7: the engine no longer reads this "
                                       "name — run `orkeon-bench scaffold <team>`, which carries it over and removes it")
    if not card.is_file():
        if not legacy.is_file():
            report.error(TEAM_CARD, "missing")
    else:
        try:
            data = json.loads(card.read_text(encoding="utf-8"))
            for field in ("name", "description"):
                if not data.get(field):
                    report.warn(TEAM_CARD, f"'{field}' is empty")
            if "{{" in card.read_text(encoding="utf-8"):
                report.error(TEAM_CARD, "template placeholder left")
        except json.JSONDecodeError as exc:
            report.error(TEAM_CARD, f"invalid JSON: {exc}")

    run_sh, run_cmd = team / "run.sh", team / "run.cmd"
    if not run_sh.is_file():
        report.error("run.sh", "missing")
    else:
        text = run_sh.read_text(encoding="utf-8")
        if "{{" in text:
            report.error("run.sh", "template placeholder left")
        if '"$DIR/crew"' not in text:
            report.error("run.sh", "must run \"$DIR/crew\"")
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
    catalogue = load_catalogue(orkeon)
    check_layout(report, team)
    source, points = mount_points(report, team)
    check_mounts(report, team, source, points)
    settings = check_settings(report, team)
    global TEAM_PROFILES, DECISION_PROFILES
    TEAM_PROFILES = None if settings is None else {
        k.lower().split(":")[2] for k, _ in settings if re.fullmatch(r"llm:profiles:[^:]+(:.*)?", k.lower())}
    DECISION_PROFILES = set() if settings is None else {
        k.lower().split(":")[3] for k, _ in settings if re.fullmatch(r"orkeon:decision:profiles:[^:]+(:.*)?", k.lower())}
    writable = writable_roots(points)

    crew_dir = team / "crew"
    config = load_yaml(report, crew_dir / "config.yaml") if (crew_dir / "config.yaml").is_file() else None
    # Orkeon reads the .yaml and the .yml files of agents/ and tasks/ (Orkeon 1.2.0), the stem as the id.
    files = {}
    for folder in ("agents", "tasks"):
        found = sorted([*(crew_dir / folder).glob("*.yaml"), *(crew_dir / folder).glob("*.yml")]) \
            if (crew_dir / folder).is_dir() else []
        files[folder] = {}
        for p in found:
            if p.stem in files[folder]:
                report.error(f"crew/{folder}/{p.name}", f"'{p.stem}' is written under both extensions, beside "
                                                        f"{files[folder][p.stem].name}: Orkeon refuses the crew at load — keep one")
            else:
                files[folder][p.stem] = p
    agents = {stem: load_yaml(report, p) for stem, p in files["agents"].items()}
    tasks = {stem: load_yaml(report, p) for stem, p in files["tasks"].items()}
    if not agents:
        # A crew of decision tasks only is refused too: the processes would run it with no agent since Orkeon main at
        # c101cbd, but `CrewDefinitionValidator` still requires one at load (`orkeon run --validate`, YAML and .ork.ts).
        only_decisions = bool(tasks) and all(isinstance(t, dict) and get(t, "decision") is not None for t in tasks.values())
        report.error("crew/agents/", "no agent: Orkeon refuses the crew at load (At least one agent is required.)"
                                     + (", a crew of decision tasks only included" if only_decisions else ""))
    if not tasks:
        report.error("crew/tasks/", "no task")

    # Crew settings.
    where = "crew/config.yaml"
    if isinstance(config, dict):
        for inline in ("agents", "tasks", "crew"):
            if get(config, inline) is not None:
                report.error(where, f"'{inline}:' in config.yaml is refused at load: the settings file carries crew settings "
                                    "only, the agents and tasks are the files of agents/ and tasks/ (Orkeon 1.2.0)")
        check_keys(report, where, {k: v for k, v in config.items() if norm(k) not in ("agents", "tasks", "crew", "circuitbreaker")}, "crew")
        for field in ("name", "goal"):
            if not get(config, field):
                report.error(where, f"'{field}' is required")
        process = get(config, "process")
        check_enum(report, where, process, "process", "process")
        check_enum(report, where, get(config, "memoryProvider"), "memoryProvider", "memoryProvider")
        check_positive(report, where, config, "maxRpm", "the model requests the crew's agents may make per minute", "no limit of its own")
        if get(config, "memoryProvider") is not None and get(config, "memory") is not True:
            report.error(where, "memoryProvider without memory: true is refused at load")
        manager = get(config, "managerAgent")
        if str(process or "").lower() == "hierarchical" and not manager:
            report.error(where, "process: hierarchical requires managerAgent: <agent id>")
        if manager and manager not in agents:
            report.error(where, f"managerAgent '{manager}' names no file in crew/agents/")
        if (manager and str(process or "").lower() == "hierarchical" and isinstance(agents.get(manager), dict)
                and get(agents[manager], "maxExecutionTime") is not None):
            report.error(where, f"the manager '{manager}' declares maxExecutionTime: a hierarchical manager runs no task "
                                "of its own, and Orkeon refuses the crew at load (remove it)")
        if manager and str(process or "sequential").lower() not in ("hierarchical", "consensual"):
            report.error(where, f"managerAgent is refused at load by process: {process or 'sequential'} — only hierarchical "
                                "(the manager) and consensual (the arbiter) use one")
        if get(config, "mounts") is not None:
            report.error(where, "no 'mounts:' block: the mount points of the team are declared in mounts.json")
        check_llm(report, f"{where} llm", get(config, "llm"), "llm")
        check_circuit(report, f"{where} circuitBreaker", get(config, "circuitBreaker"), GRAPH_CONFIG_GUIDANCE)
        check_graph(report, f"{where} graph", get(config, "graph"), str(process or "sequential").lower(), tasks)
        if get(config, "announceMounts") is not None and not isinstance(get(config, "announceMounts"), bool):
            report.error(where, "announce_mounts is true or false")
        rag = get(config, "rag")
        check_keys(report, f"{where} rag", rag, "rag")
        collections = get(rag, "collections")
        for name, collection in (collections.items() if isinstance(collections, dict) else []):
            check_keys(report, f"{where} rag.collections.{name}", collection, "ragCollection")
            check_keys(report, f"{where} rag.collections.{name}.chunking", get(collection, "chunking"), "ragChunking")
        check_keys(report, f"{where} rag.defaults", get(rag, "defaults"), "ragDefaults")
        for link in get(config, "links") or []:
            check_keys(report, f"{where} links", link, "link")
            check_enum(report, f"{where} links", get(link, "direction"), "linkDirection", "direction")
        budget = get(config, "budget")
        if budget is not None:
            # A crew's budget bounds an autonomous run only, each limit 1 or more (`CrewDefinitionValidator`, Orkeon 1.2.0).
            check_keys(report, f"{where} budget", budget, "budget")
            if str(process or "sequential").lower() != "autonomous":
                report.error(where, f"budget: is refused at load by process: {process or 'sequential'}, which spends no "
                                    "budget — remove it, or use process: autonomous")
            for key in ALLOWED["budget"]:
                check_positive(report, f"{where} budget", budget, key, "a limit of the crew's budget", "its default")
    elif config is not None:
        report.error(where, "must be a mapping")

    # Agents.
    for agent_id, agent in agents.items():
        where = f"crew/agents/{files['agents'][agent_id].name}"
        if not re.fullmatch(r"[A-Za-z0-9_-]+", agent_id):
            report.error(where, "file name (the agent id) must be ASCII letters, digits, '_' or '-'")
        if not isinstance(agent, dict):
            report.error(where, "must be a mapping")
            continue
        check_keys(report, where, agent, "agent")
        mode = get(agent, "permissionMode")
        if mode is not None and str(mode).strip().lower() not in {known.lower() for known in PERMISSION_MODES}:
            report.error(where, f"permissionMode: '{mode}' is not one of {', '.join(PERMISSION_MODES)}: Orkeon refuses the crew at load")
        check_filesystem(report, f"{where} filesystem", get(agent, "filesystem"), points)
        if not get(agent, "goal"):
            report.error(where, "'goal' is required")
        if not get(agent, "role"):
            report.warn(where, "no 'role': the id is used")
        if get(agent, "allowDelegation") is None:
            report.warn(where, "allowDelegation defaults to TRUE in YAML — set it explicitly")
        check_tools(report, where, get(agent, "tools"), catalogue)
        check_llm(report, f"{where} llm", get(agent, "llm"), "llm")
        check_guardrails(report, f"{where} guardrails", get(agent, "guardrails"))
        for entry in get(agent, "knowledge") or [] if isinstance(get(agent, "knowledge"), list) else []:
            for key in entry if isinstance(entry, dict) else []:
                if not any(norm(key) == norm(known) for known in KNOWLEDGE_KEYS):
                    report.error(f"{where} knowledge", f"'{key}' is not a key Orkeon reads, and it refuses the crew at load "
                                                       f"(accepted: {', '.join(KNOWLEDGE_KEYS)})")
        check_positive(report, where, agent, "maxIter", "the turns the agent may take on a task", "20 turns")
        check_positive(report, where, agent, "maxRpm", "the model requests the agent may make per minute", "no limit of its own")
        check_positive(report, where, agent, "maxExecutionTime", "the seconds a task may take on the agent", "no limit")
        limit = get(agent, "maxExecutionTime")
        if isinstance(limit, int) and not isinstance(limit, bool) and limit > MAX_EXECUTION_SECONDS:
            report.error(where, f"maxExecutionTime: {limit} — above {MAX_EXECUTION_SECONDS} s, the longest Orkeon accepts: "
                                "it refuses the crew at load")
    check_shell(report, settings, [f"crew/agents/{files['agents'][agent_id].name}" for agent_id, agent in agents.items()
                                   if isinstance(agent, dict) and isinstance(get(agent, "tools"), list)
                                   and "shell_command" in get(agent, "tools")])

    # Tasks.
    deliverables = 0
    for task_id, task in tasks.items():
        where = f"crew/tasks/{files['tasks'][task_id].name}"
        if not re.fullmatch(r"[A-Za-z0-9_-]+", task_id):
            report.error(where, "file name (the task id) must be ASCII letters, digits, '_' or '-'")
        if not isinstance(task, dict):
            report.error(where, "must be a mapping")
            continue
        check_keys(report, where, {k: v for k, v in task.items() if norm(k) not in ("circuitbreaker", "outputfile")}, "task")
        for field in ("description", "expectedOutput"):
            if not get(task, field):
                report.error(where, f"'{field}' is required")
        agent = get(task, "agent")
        decision = get(task, "decision")
        check_decision(report, where, task_id, task, decision, agent, tasks, config)
        if agent is None:
            if decision is None:
                report.warn(where, "no 'agent': the orchestrator assigns one")
        elif agent not in agents:
            report.error(where, f"agent '{agent}' names no file in crew/agents/")
        deps = get(task, "dependencies") or []
        if not isinstance(deps, list):
            report.error(where, "'dependencies' must be a list of task ids")
            deps = []
        for dep in deps:
            if dep not in tasks:
                report.error(where, f"dependency '{dep}' names no file in crew/tasks/")
            elif dep == task_id:
                report.error(where, "a task cannot depend on itself")
        if get(task, "asyncExecution") is True and str(get(config, "process") or "sequential").lower() not in ASYNC_PROCESSES:
            report.error(where, f"asyncExecution: true is refused at load by process: {get(config, 'process')}, which orders "
                                "the tasks itself (sequential and parallel only)")
        context = get(task, "context")
        if context is not None and not isinstance(context, dict):
            report.error(where, "'context' is a mapping of data, not a list of tasks — use 'dependencies'")
        check_tools(report, where, get(task, "tools"), catalogue)
        check_llm(report, f"{where} llmOverride", get(task, "llmOverride"), "llmOverride")
        check_guardrails(report, f"{where} guardrails", get(task, "guardrails"))
        check_circuit(report, f"{where} circuitBreaker", get(task, "circuitBreaker"), TASK_BREAKER_GUIDANCE)
        check_retry(report, f"{where} retry", get(task, "retry"), decision)
        deliverable = get(task, "deliverable")
        if deliverable is not None:
            deliverables += 1
            check_keys(report, f"{where} deliverable", deliverable, "deliverable")
            source = get(deliverable, "source")
            check_enum(report, f"{where} deliverable", source, "deliverableSource", "source")
            check_enum(report, f"{where} deliverable", get(deliverable, "format"), "deliverableFormat", "format")
            if source is None:
                report.warn(f"{where} deliverable", "no 'source': tool_call is assumed (the agent must write "
                                                    "the file itself) — prefer source: final_message")
            path = str(get(deliverable, "path") or "")
            if not path:
                report.error(f"{where} deliverable", "'path' is required")
            elif any(path == root or path.startswith(f"{root}/") for root in RESERVED_ROOTS):
                report.error(f"{where} deliverable", f"'{path}' is under a root reserved to the runner")
            elif points and not any(path.startswith(f"{root}/") for root in writable):
                report.error(f"{where} deliverable", f"'{path}' is not under a writable mount point of the team "
                                                    f"({', '.join(writable) or 'none'})")
            if str(source or "").lower() == "structured_output" and not (
                    get(deliverable, "schemaPath") or get(deliverable, "schemaInline")):
                report.error(f"{where} deliverable", "structured_output requires schemaPath or schemaInline")
        if get(task, "outputFile") is not None:
            report.error(where, "'outputFile' is retired, and Orkeon refuses the crew at load: the framework writes a task's "
                                "file from its deliverable: block — write deliverable: { path: /output/report.md }")
    if tasks and deliverables == 0:
        report.warn("crew/tasks/", "no task has a deliverable: nothing will be written to a mount point")
    check_studio(report, team)

    for line in report.errors + report.warnings:
        print(line)
    print(f"{'FAILED' if report.errors else 'OK'}: {len(agents)} agent(s), {len(tasks)} task(s), "
          f"{len(report.errors)} error(s), {len(report.warnings)} warning(s)")
    sys.exit(1 if report.errors else 0)


if __name__ == "__main__":
    main()
