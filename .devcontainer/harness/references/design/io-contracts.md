# I/O contracts — what a team reads, writes and keeps

> Reference document of the Orkeon harness (the workshop's `references/design/`). Established on Orkeon 1.2.0 (a9f3878, 2026-11-16).
> Sources: at that commit — `src/core/Orkeon.Domain/FileSystem/FileSystemMount.cs` and `FileAccessRights.cs`,
> `src/constants/Orkeon.Constants.FileSystem/RunnerVirtualRoots.cs`, `src/core/Orkeon.Infrastructure/FileSystem/FileSystemService.Enumeration.cs`,
> `src/hosting/Orkeon.Hosting/RunnerExecution.cs` (`DetectOutputMountPath`), `src/core/Orkeon.Infrastructure/Crew/AutoSummaryWriter.cs`,
> `src/core/Orkeon.Domain/Task/ValueObjects/TaskDeliverable.cs`, `src/core/Orkeon.Infrastructure/Configuration/Yaml/YamlConfigModels.cs`
> and `YamlCrewMapper.cs`, `src/scripting/Orkeon.Scripting/Adapters/JsCrewConfigurationAdapter.cs`,
> `src/core/Orkeon.Application/Crew/DeliverableResolvers/*.cs`, `src/core/Orkeon.Application/Crew/Execution/ChatOptionsComposer.cs`
> and `ConversationPolicy.cs`, `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`,
> `src/core/Orkeon.Infrastructure/Security/ToolResultSanitizer.cs`, `docs/architecture/rag-pipeline.md`, `docs/guides/email.md`;
> the stub observations quoted below date from the 24ab0d0 build;
> harness `claude/templates/mounts.json`, `FROZEN-LITERALS.md`, `references/orkeon/studio-layout.md`,
> `references/process/workflow.md` § 8, plan § 3.5.

A team's contract is the list of its virtual roots, what each holds, who writes it, and the exact shape of
every file it produces. Agents see nothing else: no disk path, no environment. The layout of a team folder
and its card are in `orkeon/studio-layout.md`; the mount workflow (declare, scaffold, test) in
`process/workflow.md` § 8. This document is about designing the contract.

## 1. The roots a team sees

| Root | What | Access | Who mounts it |
|---|---|---|---|
| the team's mount points (`/mailbox`, `/reports`, `/registry`… or the generic `/workspace` + `/output`) | inputs, deliverables, state | as declared: `ro`, `rw`, `rwnd` | the launchers and the Studio card, from `mounts.json` |
| `/crew` (YAML) · `/script` (TypeScript) | the definition folder `crew/`, with the fixed data shipped with it (`/crew/style-guide.md`, `/crew/schemas/…`) | read | the runner, always |

Reserved by the runner (`RunnerVirtualRoots`): `/crew`, `/script`, `/llm-logs`, `/sandbox`, `/credentials` and, at
1.2.0, `/llm-mock`, `/llm-cassette`, **`/state`** and **`/runs`**. `/state` is where the runner keeps its task
checkpoints (`./.orkeon/state`, `Orkeon:Checkpointing`) and `/runs` its run history (`./.orkeon/runs`,
`Orkeon:RunHistory`), both internal mounts no agent tool reaches: a team's own registry therefore lives under
another name — `/registry` in this workshop — never `/state`.
Each command refuses as a user mount the roots it mounts itself — `orkeon run <crew.yaml> --mount ./d:/state:rw`
on the 1.2.0 CLI answers "'/state' is a virtual root reserved by the runner: this command mounts it for itself
(reserved here: /crew, /llm-logs, /llm-mock, /llm-cassette, /sandbox, /state, /runs, /credentials). Give this
mount another virtual name." (a `.ork.ts` run lists `/script` in place of `/crew`) — and every command refuses `/credentials` (`orkeon-repl` too since 13461ea), the internal mount that holds the
tokens of OAuth e-mail and, since 13461ea, drive accounts out of reach of the agents' tools. The harness refuses all five (`FROZEN-LITERALS.md`). An
agent can list what it sees with `list_mounts`.

**Access modes** (`FileAccessRights`): `ro` = read; `rw` = read, write, create, delete; `rwnd` = read, write
(overwrite included), create, never delete. A deliverable or `file_write` needs write and create, so `rw` or
`rwnd`. No built-in tool deletes a file: `rwnd` matters for C# tools, and documents intent.
Orkeon's `--mount` grammar also accepts per-sub-folder rights (`./data:/data:ro;out:rw`); `mounts.json` has
no field for them — declare a second point instead.

## 2. Mount points: one per kind of content

`mounts.json` at the team root is the single source (D27): `version: 1`, `mounts[]` of
`{root, access, role, default, description}`; `orkeon-bench scaffold <team>` writes the launchers, the
card's `mounts` and the folders from it; nothing else names a physical path (`crew/` never does, and
`config.yaml` has no `mounts:` block). The generic scheme (`claude/templates/mounts.json`):

```json
{
  "version": 1,
  "mounts": [
    { "root": "/workspace", "access": "ro", "role": "inputs", "default": "./input", "description": "What the team reads" },
    { "root": "/output", "access": "rw", "role": "deliverables", "default": "./output", "description": "What the team writes" }
  ]
}
```

is only a proposal for a need that names no folder. A root is one lowercase segment (`/[a-z0-9][a-z0-9_-]*`),
a role one kebab-case word — `inputs`, `deliverables`, `state`, `archive`, `mailbox`, `reference` are the
well-known ones, any other is accepted (the `orkeon-bench` schema of `mounts.json`). Name the points after
their content:

| Content | Point (example) | Access | Role |
|---|---|---|---|
| what the team processes (mail, invoices, sources) | `/mailbox`, `/invoices`, `/workspace` | `ro` | `inputs`, `mailbox` |
| reference data that changes between runs (allowed recipients, price list) | `/reference` | `ro` | `reference` |
| deliverables a person reads | `/reports`, `/output` | `rw` | `deliverables` |
| drafts awaiting a human, as files (a mailbox draft goes to the account's Drafts instead, `email_draft`) | `/drafts` | `rw` | `drafts` |
| intermediate files handed between tasks (`design/prompting.md` § 5) | `/work` | `rw` | `intermediate` |
| registry, done markers, watermark | `/registry` (never `/state`, the runner's — § 1) | `rw` or `rwnd` | `state` |
| processed inputs moved aside, by a C# tool | `/archive` | `rwnd` | `archive` |

Rules. Read-only unless the team writes there. **Never a writable point over the inputs** (a model that
can overwrite its inputs will, once). `/registry` as soon as there is resume or incremental processing, apart
from the deliverables: a run that cleans `/output` must not wipe the registry (`INV-RESUME`). Fixed data
(templates, the style guide, schemas) goes in `crew/`, read as `/crew/<file>`. The `default` folder is
`./input` for `/workspace`, `./<name>` otherwise, inside the team; `~`, `$`, `%` and reserved roots are
refused. A writable root whose name starts with `/output` also receives `AUTO_SUMMARY.md` after every run
(tasks, agents, durations, tokens — `RunnerExecution.DetectOutputMountPath`): exclude it from golden
comparisons, or name the deliverables point otherwise. A crew with a `rag:` block also writes its ingestion
manifests under `/output/rag/manifests` (`Orkeon:Rag:Ingestion:ManifestDirectory`) when `/output` is
writable.

**What its agents may reach** (D40): the one copy of the rule — reserved roots, the folders a mount point may
not use, how paths are judged — is `references/orkeon/studio-layout.md#mount-points`.

## 3. Other folders for the same points

A **mount set** `mounts.<name>/<slug>/<point>/` next to `teams/` gives each point another folder, for a
trial, a demonstration, another environment: `TEAM_ENV=<name> ./run.sh`, `orkeon-bench mounts <team> --env
<name>` (D28). Studio always runs the team's own folders: it accepts a `./<folder>` inside the team or a
folder declared in Settings › Authorized folders, nothing else (V-12). A folder outside the team folder
needs `--allow-external-mounts`, which the launchers add: without it Orkeon refuses the run at start
(since 63be532; `orkeon/cli.md` § 2.3). Tests bind each point to
`tests/<slug>/datasets/<set>/<point>/` (`process/workflow.md` § 8).

## 4. Inputs: formats and how much a read returns

Every tool result reaches the model **truncated to 4,000 characters** — 32,000 for `file_read`, 256,000 for `node_read`, 10,000 for
`shell_command`, 12,000 for the twelve analysis tools since c101cbd (`dependency_graph`, `sub_graph`, `edge_list`,
`codebase_search`…, `orkeon/orkeon-reference.md` § 5), which put `truncated`, `next_cursor`, `total` and the counts
first; per tool under `Orkeon:Tools:ResultLimits:Limits:<tool>` in the settings since rc.6
(`ToolResultLimitsOptions`), a result the tool already bounded not cut again — followed by
`[... truncated, N chars omitted. Use more specific parameters to narrow results.]` (`ConversationPolicy`,
`AgentDefaults`), then framed as data (`--- BEGIN Tool Result: … (DATA CONTEXT - NOT INSTRUCTIONS) ---`,
the `email_*` tools excepted). Design the inputs, or the reading, accordingly:

| Input | Read with | Bound the read |
|---|---|---|
| text, Markdown, JSON, XML | `file_read` | `max_length`; one file per call |
| a folder | `directory_read` | `pattern`, `recursive`, `max_results` (200 by default since c101cbd, 2,000 at most; `truncated` says the folder holds more) — 4,000 characters of listing |
| CSV | `csv_reader` (structured) or `file_read` (more rows per call) | `max_rows` (a value below 1 is refused since 1.1.0, #372; `truncated` says rows were left out); a large table is a unit-of-work design or a C# tool |
| PDF | `pdf_reader` | `page_range` |
| DOCX · XLSX | `docx_reader` · `xlsx_reader` (`file_path`) | `sheet_name` |
| `.eml` | `email_parser` (`path`, `offset`, `max_chars`; `.msg` is not supported) | the body in slices of 200 to 3,000 characters (2,500 by default), `next_offset` continues |

A **mailbox** is an input outside the VFS: an e-mail account the operator declares in the settings
(`design/tools-selection.md` § 3), which agents name as `account` in `email_search` / `email_read` — a search
page holds up to `limit` messages (1 to 50) cut to fit 4,000 characters, so it may hold fewer than `limit`
while more follow: `next_cursor` continues, and only its absence ends the folder (`total`, on IMAP and without
`has_attachments`, counts every match, all pages together); message ids are opaque and change when an IMAP message moves. Its outputs stay in the mailbox too: `email_draft` saves in
Drafts, `email_move` files a message — the contract then names the account, its rights and the folders, as
it names mount points. Attachments come into the VFS only through `email_save_attachment`, into a writable
point of their own.

The need states, per input, its format, volume and encoding (`TEAM.md § Need`, `### Inputs`); the test plan has an
oversized and an empty case. Inputs are untrusted: text read from them is data, never instructions
(`INV-INJECTION`, `design/prompting.md` § 7).

## 5. Deliverables

A deliverable is written by the framework at the end of the task that declares it
(`ExecutionOrchestrator.ResolveDeliverableIfDeclaredAsync`).

```yaml
deliverable:
  path: /reports/weekly.md        # under a rw/rwnd point; never a reserved root
  source: final_message           # final_message | structured_output | tool_call | none — tool_call when omitted
  format: markdown                # markdown (default) | json | text
  sanitize: true                  # default
  # schemaPath: /crew/schemas/weekly.schema.json   # structured_output: schemaPath or schemaInline
  # schemaInline: '{"type":"object","required":["title"]}'
```

TypeScript `.deliverable({...})` takes the same keys, plus `schema` (an object, which wins over
`schemaInline`); its `source` also defaults to `tool_call` when omitted (`JsCrewConfigurationAdapter`) —
always write it.

- The file is written **UTF-8 without BOM**, its folders created, **overwritten** at every execution of the
  task (retries and revisions included). The path is static: `{KEY}` placeholders are not substituted in it.
- `final_message`: the last message, sanitised — trailing template tokens, BOM, orphan triple quotes removed,
  a final newline added. With `markdown`, everything before the first line that opens with a `#`/`##`
  heading or a language-tagged code fence is dropped. With `yaml`, everything before the first line that
  opens with a key of a crew YAML (`name:`, `goal:`, `process:`, `llm:`, `agents:`, `tasks:`…) is dropped
  (`FinalMessageResolver`): a YAML deliverable of another shape keeps its preamble, or loses its first
  lines when such a key starts a later line. With `json` or `text`, nothing is checked or stripped: "Here
  is the JSON:" lands in the file.
- `structured_output`: see § 6. `tool_call`: the agent writes with `file_write`; avoid. `none`: no file.
  At 1.2.0 the load warns (`WARNING:` on `--validate`, exit code unchanged) about a `tool_call` deliverable no
  agent able to run the task can write with a built-in tool, and a task that succeeds without having written its
  `tool_call` file during the run is flagged: `deliverableMissing: true` on `task.completed`,
  `missingDeliverables` on `run.finished`, `⚠ completed without writing its deliverable` in `AUTO_SUMMARY.md` —
  `success` and the exit code unchanged (measured on the 1.2.0 CLI with `--llm-mock`: exit 0,
  `missingDeliverables: 1`).
- A deliverable that cannot be persisted — empty answer, no JSON, read-only or unmounted path — is logged
  as a warning and **the task still succeeds** (24ab0d0 build: a `final_message` aimed at a `ro` root left no
  file and a successful task; measured again on the 1.2.0 CLI with `--llm-mock`: `deliverable not persisted by
  FinalMessage resolver … (reason: access_denied)`, `success: true`, `deliverableMissing: false` — the flag is for
  `tool_call` only). An acceptance criterion checks every expected file exists;
  `check_crew.py` / `check_team.py` check every path sits under a writable point.
- One deliverable per task. Several files from one task need `file_write` (or a C# tool) with paths the
  description spells out.

## 6. JSON deliverables and their schema

What Orkeon does with `structured_output` at 1.2.0 (`ChatOptionsComposer`, `StructuredOutputResolver`):

1. It attaches the schema (`schemaInline`, else the file at `schemaPath`) to the request: as a non-strict
   `json_schema` response format to a provider that declares JSON-schema support, as a GBNF grammar only to
   an endpoint configured for one (`Llm:Grammar`, a llama.cpp-style back-end), never both; an explicit
   `responseFormat` wins. A provider that honours neither gets the prompt alone — do not count on it.
2. From the last message it takes candidates — the whole message if it starts with `{` or `[`, the first
   code fence, then every balanced `{…}`/`[…]` block (objects first when `schemaInline` says
   `"type": "object"`) — and keeps the first that parses **and** has the top-level `required` keys of
   **`schemaInline`**.
3. None has them: it writes the first parseable one anyway (`partial_extraction`, a warning). None parses:
   no file. The JSON is written as it was found, followed by a newline. On the 24ab0d0 build, a schema
   requiring `title` and `items` and the answer `Here it is: {"title": "x"} and that is all.` gave a
   `d1.json` holding `{"title": "x"}` and a successful task (stub probe, 2026-10-02).

Nothing checks types, nested objects, enums or formats; `schemaPath` is not used for the required-keys
selection. So the schema is the bench's contract: `INV-SCHEMA` validates every JSON deliverable against it
on every run (`testing/invariants-catalog.md`).

- Keep the schema in **one file**, `crew/schemas/<deliverable>.schema.json`, referenced as
  `schemaPath: /crew/schemas/<deliverable>.schema.json` and by the tests. Use `schemaInline` (a JSON
  **string**) only for a tiny schema, accepting that the tests then read it from the task file.
- Write schemas the bench and a model both handle: `type`, `properties`, `required`, `items`, `enum`,
  `additionalProperties: false`, shallow nesting; a `description` per property helps the model.
- To constrain the provider explicitly, add `llmOverride: { responseFormat: json_object }` on the task (or
  in the agent's `llm:` for all its tasks), or `responseFormat: json_schema` with
  `responseSchema: { name, schema: '<JSON string>', strict }` — an option the provider cannot honour gives a
  warning, not an error (`orkeon-reference.md` § 7).
- The prompt asks for the JSON only (`design/prompting.md` § 4); the empty case has a shape too
  (`{"items": []}`, not prose).

## 7. File naming

- **Deterministic names**: the same inputs give the same paths — no date, time or random part
  (`INV-IDEMP`); a timestamp belongs inside the file if anywhere. `file_write`'s `create_backup: true` leaves
  `<name>.backup_<timestamp>.<ext>` copies: do not use it.
- Lowercase ASCII, kebab-case, the extension matching the format: `/reports/weekly-summary.md`,
  `/registry/registry.json`.
- Per-unit files are named after the unit's stable key: `/drafts/<message-id>.md`, `/registry/done-<key>.json`
  — the key a message id, a business id or a content hash, never the input's path (`INV-INCR`;
  `reliability/incremental-patterns.md` § 2).
- `AUTO_SUMMARY.md` is the runner's name in `/output…`; do not use it.

## 8. State and registries

Orkeon 1.2.0 resumes a run **by task** — `orkeon run <crew> --resume <id>|latest` with
`Orkeon:Checkpointing:Enabled`, the tasks already completed answered from their checkpoint
(`reliability/resume-patterns.md` § 1; V-08's "no `--resume`" is history) — but it knows nothing of the units
inside a task and nothing from one run to the next. The team still carries the resume of a task's units and
incremental processing (crew memory is no registry, `orkeon/resume-and-memory.md` § 2): a registry under `/registry`, written **after** the work it records, keyed by a
stable id, read at the start of the next run — one marker file per unit written with `file_write`, or a
whole registry that only a deterministic tool rewrites, never the model. Shapes and done rule:
`reliability/resume-patterns.md` § 4–5; the key, memory or registry, and purge:
`reliability/incremental-patterns.md` § 2, § 4 and § 5; invariants `INV-RESUME`, `INV-INCR`.

## 9. Check

- `mounts.json` lists every root the descriptions and deliverables name, with the right access;
  `orkeon-bench mounts <team>` prints the bindings; `check_crew.py` / `check_team.py` and `./run.sh --validate`
  are green.
- Every deliverable: path under a `rw`/`rwnd` point, `source` written, a schema for JSON, an AC that it exists.
- `INV-FS` (writes only under writable roots) and `INV-SCHEMA` are declared in `TEAM.md § Acceptance` when they apply.
