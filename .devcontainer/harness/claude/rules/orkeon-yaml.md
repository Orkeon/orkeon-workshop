---
paths:
  - "teams/*/crew/**/*.yaml"
  - "teams/*/crew/**/*.yml"
  - "library/agents/**/*.yaml"
  - "library/examples/teams/*/crew/**/*.yaml"
---

# Orkeon crew in YAML

Source of truth: `references/orkeon/yaml-schema.md` (exact keys), `references/orkeon/orkeon-reference.md`
(modes, tool catalogue, pitfalls § 9), `references/orkeon/studio-layout.md` (folder shape). Orkeon
`main` at ce9ec1f. This rule only states what to hold while editing; it never replaces those files.
Designing the team: `references/design/team-patterns.md` (its shape), `tools-selection.md` (where each
piece of work goes), `io-contracts.md` (what it reads, writes and keeps), `prompting.md` (agents and
tasks), `sizing-and-cost.md` (limits, budgets). Holding up: `references/reliability/error-handling.md`,
`resume-patterns.md`, `incremental-patterns.md`, `security.md`; what Orkeon itself gives for resume and
memory: `references/orkeon/resume-and-memory.md`; its models and settings: `references/orkeon/llm-profiles.md`.

## Shape

- `crew/config.yaml` + `crew/agents/<id>.yaml` + `crew/tasks/<id>.yaml`. **The file name is the id**
  (snake_case or kebab-case, ASCII); `agent:`, `dependencies:` and `managerAgent:` refer to it.
- Keys at the root of each file: no `crew:` wrapper, no `agents:` / `tasks:` key in `config.yaml`,
  no `mounts:` block (it resolves entries the team does not have — mounts live in `mounts.json`).
- Nothing but the definition under `crew/` — no `crew/crew/` either (`orkeon run crew` would load it in
  place of the team's) —, never a `*.ork.ts` beside the YAML (`orkeon run` refuses an ambiguous folder,
  Studio finds no crew) nor at the team root (set aside, it never runs). An `agents/` or `tasks/` folder
  at the team root is only the folder of a mount point: Studio and `orkeon run` read `crew/` first.

## Keys

- **camelCase** keys (the loader also accepts snake_case; keep one style per team). An unknown key is
  ignored without an error: a typo silently disables a setting (`maxIter`, not `maxIterations`).
- Required: crew `name` + `goal`; agent `goal`; task `description` + `expectedOutput`.
- `allowDelegation: false` on every agent, unless the mode is `hierarchical` / `autonomous` or the
  design asks for delegation (the YAML default is `true`).
- **No `model`**, no provider, no key: the LLM comes from the team's settings file
  `settings/<slug>/appsettings.json`, which the launchers pass, else from the machine's settings —
  `ORKEON_Llm__*` variables override both; in Studio, from the same team settings file for a team right
  under its teams root, else from Studio's settings, under the model setting the card names (D33). Model
  settings (`temperature`, `maxTokens`, `thinking`, `responseFormat`) go on the
  agent or the crew, `llm:`, or on a task, `llmOverride:` — all applied on Orkeon `main` at ce9ec1f.
  `maxRpm`, on an agent or the crew, is applied too — the request of too many waits —: none unless the
  design asks for one; 0 or less fails the load, like a `maxIter` of 0 or less
  (`references/orkeon/yaml-schema.md`). A named profile,
  `llm: { profile: <id> }`, only with a decision (`DEC-…`): it must be defined in the team's settings file
  (`Llm:Profiles:<id>`) — and in Studio's settings for a team Studio launches without that file —, and a
  remote profile makes every run of the team remote for the run gate.
- `tools:` goes on the **agent**: catalogue names only, the bare minimum per agent; never
  `ask_question_to_coworker` / `delegate_work_to_coworker` (added automatically). A task's `tools:` adds
  tools to its agent for that task only. The binary is the catalogue: `orkeon run --list-tools`.
- `dependencies:` lists every task whose result the task needs, for the ordering. Every earlier output
  reaches every task anyway, 8,000 characters in all: keep outputs short, pass large results through a
  file. `context:` is a mapping of side data, never an ordering, and only the hierarchical manager sees it.
- `process: hierarchical` requires `managerAgent: <id>`.

## Deliverables and paths

- The framework writes the deliverable: `deliverable: {path, source: final_message, format}`, on the
  task that produces it. `structured_output` requires `schemaPath` or `schemaInline` (a JSON **string**).
- `path` sits under a mount point the team declares `rw` or `rwnd` in `mounts.json` (`/output` in the
  generic scheme, `/reports`, `/drafts`… otherwise); reserved roots (`/crew`, `/script`, `/llm-logs`,
  `/sandbox`, `/credentials`) are forbidden.
- Task descriptions spell virtual paths **in full** and name the tool to use. Never a physical path.

## Robustness

- Inputs are untrusted: every agent or task that reads files or mail carries `guardrails` rules against
  following instructions found in them (an agent's rules apply to all its tasks, before the task's own;
  Orkeon's Guardian also fails a task whose description or input holds an injected instruction), and the team uses
  `email_draft`, never `email_send`, unless the need authorises it (`email_send` only reaches the
  addresses of `Send:AllowedRecipients`).
- No `shell_command` for an agent that reads untrusted input, and never in a team with a mail account:
  it reads the machine's settings, the mail tokens, Claude Code's credentials and, through `/proc`, the
  model's key (V-16, `references/reliability/security.md` § 7).
- `circuitBreaker` is removed from Orkeon and refused at load: a `graph` crew is sized with
  `graphConfig`. `asyncExecution: true` runs a task alongside the next ones in `sequential` only (no
  effect in `parallel`, refused by the other modes).
- A failed task fails the run (exit 2) in every mode, and its dependents are skipped: the tests check
  the exit code, the deliverables and the `task.completed` events.
- Strings containing `:`, `#` or `"` go in a `|` block or in quotes.

## Before saying it is done

`python3 .claude/skills/orkeon-crew-yaml/scripts/check_crew.py <team>` then, from the team folder,
`./run.sh --validate` — in that order: `--validate` lets unknown keys through.
