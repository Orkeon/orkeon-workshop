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
`main` at 24ab0d0. This rule only states what to hold while editing; it never replaces those files.
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
- Nothing but the definition under `crew/`. Never an `agents/` or `tasks/` folder at the team root
  (Studio takes the team folder for the crew and the launch fails), never a `*.ork.ts` beside the YAML
  (`orkeon run` refuses an ambiguous folder, Studio finds no crew).

## Keys

- **camelCase** keys (the loader also accepts snake_case; keep one style per team). An unknown key is
  ignored without an error: a typo silently disables a setting (`maxIter`, not `maxIterations`).
- Required: crew `name` + `goal`; agent `goal`; task `description` + `expectedOutput`.
- `allowDelegation: false` on every agent, unless the mode is `hierarchical` / `autonomous` or the
  design asks for delegation (the YAML default is `true`).
- **No `model`**, no provider, no key: the LLM comes from the team's settings file
  `settings/<slug>/appsettings.json`, which the launchers pass, else from the machine's settings —
  `ORKEON_Llm__*` variables override both; in Studio, from Studio's settings or the profile the card
  names (D33). Model settings go on the **task**, `llmOverride:` (`temperature`, `maxTokens`,
  `thinking`, `responseFormat`): on Orkeon `main` an agent's or the crew's `llm:`, an agent's
  `guardrails:` and `maxRpm` are read and dropped (`references/orkeon/orkeon-reference.md` § 1).
- `tools:` goes on the **agent**: catalogue names only, the bare minimum per agent; never
  `ask_question_to_coworker` / `delegate_work_to_coworker` (added automatically). A task's `tools:` is
  read and dropped on Orkeon `main` — the agent keeps its own (`check_crew.py` refuses it). The binary
  is the catalogue: `orkeon run --list-tools`.
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

- Inputs are untrusted: every task that reads files or mail carries `guardrails` rules against following
  instructions found in them (task level: an agent's `guardrails` are dropped), and the team uses
  `email_draft`, never `email_send`, unless the need authorises it (`email_send` only reaches the
  addresses of `Send:AllowedRecipients`).
- No `shell_command` for an agent that reads untrusted input, and never in a team with a mail account:
  it reads the machine's settings, the mail tokens, Claude Code's credentials and, through `/proc`, the
  model's key (V-16, `references/reliability/security.md` § 7).
- Do not rely on task-level `circuitBreaker` or `asyncExecution`: `circuitBreaker` goes at crew level
  (read by `process: graph` only), `process: parallel` instead of `asyncExecution`.
- Only `sequential` (and `graph` when its breaker trips) fails the run when a task fails: with another
  mode, the tests check the deliverables and the `task.completed` events with `success: false`.
- Strings containing `:`, `#` or `"` go in a `|` block or in quotes.

## Before saying it is done

`python3 .claude/skills/orkeon-crew-yaml/scripts/check_crew.py <team>` then, from the team folder,
`./run.sh --validate` — in that order: `--validate` lets unknown keys and dangling ids through.
