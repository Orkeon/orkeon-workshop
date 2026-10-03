# I/O contracts — what a team reads, writes and keeps

> Reference document of the Orkeon harness (the workshop's `references/design/`). Established on Orkeon main at 24ab0d0 (2026-09-30, after 1.0.0-rc.4).
> Sources: `src/core/Orkeon.Domain/FileSystem/FileSystemMount.cs` and `FileAccessRights.cs`,
> `src/constants/Orkeon.Constants.FileSystem/RunnerVirtualRoots.cs`, `src/core/Orkeon.Infrastructure/FileSystem/FileSystemService.Enumeration.cs`,
> `src/hosting/Orkeon.Hosting/RunnerExecution.cs` (`DetectOutputMountPath`), `src/core/Orkeon.Infrastructure/Crew/AutoSummaryWriter.cs`,
> `src/core/Orkeon.Domain/Task/ValueObjects/TaskDeliverable.cs`, `src/core/Orkeon.Infrastructure/Configuration/Yaml/YamlConfigModels.cs`
> and `YamlCrewMapper.cs`, `src/scripting/Orkeon.Scripting/Adapters/JsCrewConfigurationAdapter.cs`,
> `src/core/Orkeon.Application/Crew/DeliverableResolvers/*.cs`, `src/core/Orkeon.Application/Crew/Execution/ChatOptionsComposer.cs`
> and `ConversationPolicy.cs`, `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`, `docs/guides/email.md` (main at 24ab0d0);
> harness `claude/templates/mounts.json`, `FROZEN-LITERALS.md`, `references/orkeon/studio-layout.md`,
> `references/process/workflow.md` § 8, plan § 3.5.

A team's contract is the list of its virtual roots, what each holds, who writes it, and the exact shape of
every file it produces. Agents see nothing else: no disk path, no environment. The layout of a team folder
and its card are in `orkeon/studio-layout.md`; the mount workflow (declare, scaffold, test) in
`process/workflow.md` § 8. This document is about designing the contract.

## 1. The roots a team sees

| Root | What | Access | Who mounts it |
|---|---|---|---|
| the team's mount points (`/mailbox`, `/reports`, `/state`… or the generic `/workspace` + `/output`) | inputs, deliverables, state | as declared: `ro`, `rw`, `rwnd` | the launchers and the Studio card, from `mounts.json` |
| `/crew` (YAML) · `/script` (TypeScript) | the definition folder `crew/`, with the fixed data shipped with it (`/crew/style-guide.md`, `/crew/schemas/…`) | read | the runner, always |

Reserved by the runner (`RunnerVirtualRoots.All`): `/crew`, `/script`, `/llm-logs`, `/sandbox`, `/credentials`.
Each command refuses as a user mount the roots it mounts itself — a YAML run on the main build answered
"'/credentials' is a virtual root reserved by the runner … (reserved here: /crew, /llm-logs, /sandbox,
/credentials)" — and every command refuses `/credentials`, the internal mount that holds the tokens of OAuth
e-mail accounts out of reach of the agents' tools. The harness refuses all five (`FROZEN-LITERALS.md`). An
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
| registry, done markers, watermark | `/state` | `rw` or `rwnd` | `state` |
| processed inputs moved aside, by a C# tool | `/archive` | `rwnd` | `archive` |

Rules. Read-only unless the team writes there. **Never a writable point over the inputs** (a model that
can overwrite its inputs will, once). `/state` as soon as there is resume or incremental processing, apart
from the deliverables: a run that cleans `/output` must not wipe the registry (`INV-RESUME`). Fixed data
(templates, the style guide, schemas) goes in `crew/`, read as `/crew/<file>`. The `default` folder is
`./input` for `/workspace`, `./<name>` otherwise, inside the team; `~`, `$`, `%` and reserved roots are
refused. A writable root whose name starts with `/output` also receives `AUTO_SUMMARY.md` after every run
(tasks, agents, durations, tokens — `RunnerExecution.DetectOutputMountPath`): exclude it from golden
comparisons, or name the deliverables point otherwise.

**What its agents may reach** (D40). The folder behind a point is all its agents reach through the VFS. A
mount point may not use: the team folder itself; `crew/`, or a folder named `agents`, `tasks`,
`appsettings` or `_shared` at the root of the team; outside the team, a folder that holds the team folder,
the workshop or the home folder, or that is or lies inside the workshop's `settings/`, `workbooks/`,
`tests/`, `.claude/`, `library/`, `references/`, `.devcontainer/` or `.git/`, an `appsettings/` or
`_shared/` folder above the team, a hidden folder of the home folder (`~/.config`, `~/.claude`, `~/.ssh`…),
the user's `AppData`, `/proc`, or another team's folder or mount set. A `/plugins` mount point is
read-only. Any other folder outside the team passes with a warning: Orkeon Studio launches the team only
when that folder is declared, spelled exactly, in its Authorized folders. The Windows spellings of these
folders (`C:\Users\<you>\Orkeon\settings`, `C:\Users\<you>\.claude`, `C:\Users\<you>\AppData\…`) are
refused the same way. Paths are judged as written: a symbolic link is not followed, and a folder name ending
with a dot or a space is refused, since Windows drops them (`./crew.` is `crew/` there). Folders compare
ignoring case, the configured workshop `$ORKEON_WORKSHOP` and `$XDG_CONFIG_HOME/Orkeon` are guarded too,
and `orkeon-bench scaffold` and `mounts`, `check_crew.py` / `check_team.py` and the C# runner and host
refuse the same folders (`reliability/security.md` § 8).

## 3. Other folders for the same points

A **mount set** `mounts.<name>/<slug>/<point>/` next to `teams/` gives each point another folder, for a
trial, a demonstration, another environment: `TEAM_ENV=<name> ./run.sh`, `orkeon-bench mounts <team> --env
<name>` (D28). Studio always runs the team's own folders: it accepts a `./<folder>` inside the team or a
folder declared in Settings › Authorized folders, nothing else (V-12). A folder outside the team folder
needs `--allow-external-mounts`, which the launchers add. Tests bind each point to
`tests/<slug>/datasets/<set>/<point>/` (`process/workflow.md` § 8).

## 4. Inputs: formats and how much a read returns

Every tool result reaches the model **truncated to 4,000 characters** — 32,000 for `file_read` — followed by
`[... truncated, N chars omitted. Use more specific parameters to narrow results.]` (`ConversationPolicy`,
`AgentDefaults`). Design the inputs, or the reading, accordingly:

| Input | Read with | Bound the read |
|---|---|---|
| text, Markdown, JSON, XML | `file_read` | `max_length`; one file per call |
| a folder | `directory_read` | `pattern`, `recursive`, `max_results` (500 by default) — 4,000 characters of listing |
| CSV | `csv_reader` (structured) or `file_read` (more rows per call) | `max_rows`; a large table is a unit-of-work design or a C# tool |
| PDF | `pdf_reader` | `page_range` |
| DOCX · XLSX | `docx_reader` · `xlsx_reader` (`file_path`) | `sheet_name` |
| `.eml` | `email_parser` (`path`, `offset`, `max_chars`; `.msg` is not supported) | the body in slices of 200 to 3,000 characters (2,500 by default), `next_offset` continues |

A **mailbox** is an input outside the VFS: an e-mail account the operator declares in the settings
(`design/tools-selection.md` § 3), which agents name as `account` in `email_search` / `email_read` — a search
page holds up to `limit` messages (1 to 50) cut to fit 4,000 characters, `next_cursor` continues; message ids
are opaque and change when an IMAP message moves. Its outputs stay in the mailbox too: `email_draft` saves in
Drafts, `email_move` files a message — the contract then names the account, its rights and the folders, as
it names mount points. Attachments come into the VFS only through `email_save_attachment`, into a writable
point of their own.

The need states, per input, its format, volume and encoding (`NEED.md`, `## Inputs`); the test plan has an
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
- A deliverable that cannot be persisted — empty answer, no JSON, read-only or unmounted path — is logged
  as a warning and **the task still succeeds** (main build: a `final_message` aimed at a `ro` root left no
  file and a successful task). An acceptance criterion checks every expected file exists;
  `check_crew.py` / `check_team.py` check every path sits under a writable point.
- One deliverable per task. Several files from one task need `file_write` (or a C# tool) with paths the
  description spells out.

## 6. JSON deliverables and their schema

What Orkeon does with `structured_output` at 24ab0d0 (`ChatOptionsComposer`, `StructuredOutputResolver`):

1. It converts the schema (`schemaInline`, else the file at `schemaPath`) to a GBNF grammar passed to the
   provider; only llama.cpp-style back-ends honour it — do not count on it.
2. From the last message it takes candidates — the whole message if it starts with `{` or `[`, the first
   code fence, then every balanced `{…}`/`[…]` block (objects first when `schemaInline` says
   `"type": "object"`) — and keeps the first that parses **and** has the top-level `required` keys of
   **`schemaInline`**.
3. None has them: it writes the first parseable one anyway (`partial_extraction`, a warning). None parses:
   no file. The JSON is written as it was found, followed by a newline. On the main build, a schema
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
- To constrain the provider as well, add `llmOverride: { responseFormat: json_object }` on the task, or
  `responseFormat: json_schema` with `responseSchema: { name, schema: '<JSON string>', strict }` — an option
  the provider cannot honour gives a warning, not an error (`orkeon-reference.md` § 7). The agent-level `llm`
  block does not reach the model (`design/prompting.md` § 7).
- The prompt asks for the JSON only (`design/prompting.md` § 4); the empty case has a shape too
  (`{"items": []}`, not prose).

## 7. File naming

- **Deterministic names**: the same inputs give the same paths — no date, time or random part
  (`INV-IDEMP`); a timestamp belongs inside the file if anywhere. `file_write`'s `create_backup: true` leaves
  `<name>.backup_<timestamp>.<ext>` copies: do not use it.
- Lowercase ASCII, kebab-case, the extension matching the format: `/reports/weekly-summary.md`,
  `/state/registry.json`.
- Per-unit files are named after the unit's stable key: `/drafts/<message-id>.md`, `/state/done-<key>.json`
  — the key a message id, a business id or a content hash, never the input's path (`INV-INCR`;
  `reliability/incremental-patterns.md` § 2).
- `AUTO_SUMMARY.md` is the runner's name in `/output…`; do not use it.

## 8. State and registries

The team carries resume and incremental processing (no `--resume`, checkpoints only at the end of a run —
V-08, still true at 24ab0d0): a registry under `/state`, written **after** the work it records, keyed by a
stable id, read at the start of the next run — one marker file per unit written with `file_write`, or a
whole registry that only a deterministic tool rewrites, never the model. Shapes and done rule:
`reliability/resume-patterns.md` § 4–5; the key, memory or registry, and purge:
`reliability/incremental-patterns.md` § 2, § 4 and § 5; invariants `INV-RESUME`, `INV-INCR`.

## 9. Check

- `mounts.json` lists every root the descriptions and deliverables name, with the right access;
  `orkeon-bench mounts <team>` prints the bindings; `check_crew.py` / `check_team.py` and `./run.sh --validate`
  are green.
- Every deliverable: path under a `rw`/`rwnd` point, `source` written, a schema for JSON, an AC that it exists.
- `INV-FS` (writes only under writable roots) and `INV-SCHEMA` are declared in `ACCEPTANCE.md` when they apply.
