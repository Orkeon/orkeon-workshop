# Tools selection — where each piece of work goes

> Reference document of the Orkeon harness (the workshop's `references/design/`). Established on Orkeon 1.2.0 (a9f3878, 2026-11-16).
> Sources: at that commit — `src/core/Orkeon.Infrastructure/Configuration/CrewFactory.cs`, `src/core/Orkeon.Infrastructure/Tools/ToolRegistry.cs`,
> `src/hosting/Orkeon.Hosting/RunnerHost.cs`, `McpStartup.cs`, `src/core/Orkeon.Infrastructure/MCP/McpToolAdapter.cs`,
> `src/tools/Orkeon.Tools.Email/DependencyInjection/EmailToolsServiceCollectionExtensions.cs`, `docs/guides/email.md`,
> `src/tools/Orkeon.Tools.FileSystem/DependencyInjection/FileSystemToolExtensions.cs`,
> `src/tools/Orkeon.Tools.Analysis/DependencyInjection/RaggableToolsExtensions.cs`, `GitHubToolOptions.cs`,
> `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`, `src/core/Orkeon.Domain/Tools/ToolResultLimitsOptions.cs`,
> `docs/adr/ADR-012-email-tool-family.md`, `src/tools/Orkeon.Tools.Web/DependencyInjection/WebToolExtensions.cs`,
> `WebSearchTool.cs`, `HttpApiTool.cs`, `ImageGenerationTool.cs`, `src/core/Orkeon.Infrastructure/Configuration/UrlSecurityOptions.cs`,
> `src/tools/Orkeon.Tools.Abstractions/Security/HttpHeaderSanitizer.cs`, `src/tools/Orkeon.Tools.Code/ShellCommandTool.cs`,
> `DependencyInjection/CodeToolExtensions.cs` and `Confinement/ShellConfinementResolver.cs`, `docs/adr/ADR-014-shell-confinement-by-default.md`, `src/tools/Orkeon.Tools.FileSystem/FileWriteTool.cs`, `src/tools/Orkeon.Tools.Rag/`,
> `src/core/Orkeon.Infrastructure/HumanInput/AutoApproveHumanInputProvider.cs`,
> `src/scripting/Orkeon.Scripting.Cli/Commands/Run/JsonLinesHumanInputProvider.cs`,
> `src/scripting/Orkeon.Scripting/Configuration/ScriptingLimitsOptions.cs`, `src/scripting/Orkeon.Scripting/Runtime/JsTool.cs`,
> `src/core/Orkeon.Application/Crew/Execution/ChatOptionsComposer.cs` and `TaskToolbelt.cs`,
> `src/core/Orkeon.Application/Services/Security/ToolInvocationPipeline.cs`, `docs/architecture/security.md`,
> `docs/reference/limitations.md`; the request recorded for V-06 on 1.0.0-rc.4 (`.claude/harness/VERIFICATIONS.md`) and
> its replay on the 24ab0d0 build (80 tools) and on a build of fb26364 (83 tools); harness `references/orkeon/orkeon-reference.md` § 5.

The tool catalogue — names, arguments, which are required — is § 5 of `orkeon/orkeon-reference.md`;
this document does not repeat it. It says how to decide where each piece of work goes, what a tool needs
to work, which tools act on the world, and how to keep each agent's list short.

## 1. Four questions, in this order

1. **Is there one correct answer a program could compute from the inputs?** Counting, sorting, totals,
   dates, parsing a known format, deduplication keys, "already processed?", schema validation, a business
   rule `R-nn` of `TEAM.md § Need` → a **deterministic tool**, unit-tested at L1. The LLM judges, classifies,
   extracts meaning and writes; a script checks what it can (principle 6 of `process/workflow.md`).
2. **Does a built-in tool do it?** Look in § 5 of the reference and check its arguments; prove a call the
   design relies on (§ 4). Built-in first: no code, no test to write, same in Studio. Mail is built-in on
   main: thirteen `email_*` tools (§ 3).
3. **Must the tool itself read or write files, use the network, a key, a .NET library or heavy
   computation?** Yes → **C#**. No → **pure TypeScript** (`toolBuilder`), if the team can be TypeScript.
4. **Must Studio launch the team?** A C# tool reaches a YAML or TypeScript team only through the harness
   runner `orkeon-harness-run` (plugin route) or a C# host; Studio launches the real `orkeon`, which loads no
   plugin (V-07; still true at 1.2.0: neither `orkeon run` nor Studio calls `AddOrkeonPlugins` — only `orkeon-repl`, the
   interactive console, does since 13461ea; where plugins load, a plugin is since rc.7 a sub-folder holding a
   `plugin.json` manifest — `name`, `version`, `orkeonVersion`, `entryAssembly`, `tools` — and a `.dll` dropped
   flat is refused). If the team
   must run from Studio, the work stays in built-in or TypeScript tools.

## 2. Decision table

| The work | Where | Why |
|---|---|---|
| Read text, JSON, XML | `file_read` | built-in |
| Read an `.eml` file from a mount point | `email_parser` (`path`, `offset`, `max_chars`) | built-in, no account; `.msg` is not supported |
| Read, search, sort a real mailbox (IMAP, POP3, Microsoft Graph) | `email_search`, `email_read`, `email_move`, `email_mark`… | built-in; an account the operator declares (§ 3) |
| Prepare a reply for a human | `email_draft` (saved in the mailbox's Drafts, never sent) or a draft file under `/drafts` | the review path; `TEAM.md § Need` says which |
| Send mail | `email_send`, only when `TEAM.md § Need` authorises sending | built-in, closed until `Send:AllowedRecipients` lists the recipients |
| Read CSV, PDF, DOCX, XLSX | `csv_reader`, `pdf_reader`, `docx_reader`, `xlsx_reader` | built-in; `docx_*`/`xlsx_*` take `file_path` |
| Exact counts, presence of patterns in a file | `count_pattern` | deterministic, no LLM estimate |
| Query or reformat a JSON string | `json_tool` (`Parse`, `Query`, `Format`) | built-in |
| A computation on a few values (score, date arithmetic, normalisation, rule check, hash key) | custom TypeScript tool | pure, small inputs passed in the call |
| The same on a whole file, or on more than a few kilobytes | custom C# tool | it reads the file itself through the VFS |
| A state registry, done markers, a watermark | per-unit done markers written with `file_write`, or a whole registry kept by a deterministic tool (C#: a TypeScript tool cannot write a file); never the model's memory | idempotence, resume (`reliability/resume-patterns.md` § 4) |
| Call an API that needs a key | custom C# tool reading the key from the environment | a key never travels through a prompt |
| Call a public API without a key | `http_api` | built-in, SSRF guard |
| Search the web, read a page | `web_search` (key), `web_scrape`, `scrape_element` | built-in |
| Classify, summarise, extract meaning, write, judge quality | an agent | judgement |
| Ask a human | `humanInput: true` on the task | built-in, see § 3 |

YAML teams have no custom tools of their own. At 1.2.0 every registered tool is attachable (the `ITool`
filter is gone): the `rag_*` tools, and the tools of an MCP server the settings declare (`MCP:Servers`) —
but such a server is machine configuration, outside the team folder, so a team that names its tools fails
`--validate` wherever the server is absent; treat it like a C# plugin, recorded in a `DEC`. A YAML team that
needs a deterministic tool becomes a TypeScript team, or keeps YAML and uses a C# plugin through
`orkeon-harness-run`.

### Pure TypeScript or C#

| | Pure TypeScript (`toolBuilder`) | C# (`ToolBase<TReq,TRes>`) |
|---|---|---|
| Runs in | Jint, inside the run: no `fs`, `fetch`, `process`, `console` (`orkeon/typescript-dsl.md`) | .NET, I/O through `IFileSystemService` and virtual paths only (VFS analyser) |
| Its input | what the model copies into the call arguments — every byte is output tokens and a chance of a typo | a virtual path, an id; the tool reads the data |
| Limits | `Orkeon:Scripting:Limits`: 100 MB cumulative allocation, 30 s wall clock, recursion 64 by default | the run's |
| Team | `crew.ork.ts` only | YAML or TypeScript via `orkeon-harness-run`, or a C# host |
| Studio | yes | no |
| Tests (L1) | vitest on `domain.ts`, no Node API (`.claude/rules/orkeon-ts.md`) | the project's tests (`orkeon/csharp-tools.md` § 8) |

Rule of thumb: if the agent would have to read a file and paste it into the tool call, the tool is C#.
A script tool (`JsTool`) resolves by name like a built-in, and a name that collides with a registered tool
is refused.

## 3. What a tool needs to work

`--validate` resolves names only; a missing key, account or host passes it and fails at run time
(`orkeon/studio-layout.md`). Firewall openings: `orkeon/llm-profiles.md` § 6.

| Tool | Needs | Notes at 151a762 |
|---|---|---|
| the twelve mailbox tools (`email_accounts` … `email_send`) | an account under `Orkeon:Tools:Email:Accounts:<name>` in the settings the run resolves (`orkeon/cli.md` § 5): `Provider`, `Address`, a **mandatory** `Rights` — one string of names separated by commas (`"Read, Organize, Draft"`; `Read`, `Organize`, `Draft`, `Send`, `Delete`, `Purge`) —, the **name** of the variable holding the password (`Auth:PasswordEnvVar`; the variable itself in the environment of the run — in the container nothing else is read; on Windows the user's scope too) or an OAuth2 sign-in (`orkeon email login <account>`, or « Sign in » in Studio's Settings › E-mail, which serves the runs of that Windows machine only); the mail servers reachable | always registered: until an account is declared every call fails — on the 24ab0d0 build `email_search` answered "No e-mail account is configured. Declare one under Orkeon:Tools:Email:Accounts (see the e-mail guide, docs/guides/email.md)." The agent names an `account`, never a server or a secret. An account holding a value that cannot be read or a key no account carries is set aside, and reported when a call names it; the others keep working. `Security: None` is accepted towards a loopback test server only — the way to test without a real mailbox |
| `email_parser` | nothing | reads an `.eml` from the VFS; same output as `email_read` |
| the eleven drive tools (`drive_accounts` … `drive_share`, since 13461ea) | an account under `Orkeon:Tools:Drive:Accounts:<name>` in the settings the run resolves: `Provider` (`GoogleDrive` or `OneDrive`), a **mandatory** `Rights` (`Read`, `Write`, `Organize`, `Share`, `Delete`, `Purge`), optionally a `Root` folder, `Auth:ClientId` (and `Auth:ClientSecretEnvVar`, a variable **name**, for a Google desktop client), `Share:AllowedRecipients` / `Share:AllowPublicLinks` for `drive_share`; an OAuth2 sign-in (`orkeon drive login <account>`, or Studio's Drive tab); the provider's API hosts reachable | always registered: until an account is declared every call fails. The agent names an `account`, never a client or a token; `Root` confines the account (an item outside it is not found); `drive_read` screens the text it returns; a file is read with `drive_read` or downloaded with `drive_download` into a writable point and read with the file tools. Offline-tested only in Orkeon so far (DRIVE-07) |
| `web_search` | secret `TAVILY_API_KEY`, i.e. `ORKEON_TAVILY_API_KEY` in the environment; `api.tavily.com` reachable | the tool call fails at run time without it |
| `brave_search` | `BRAVE_API_KEY` when the run starts | otherwise the name is unknown and loading fails |
| `web_scrape`, `scrape_element` | the target hosts reachable | same guard as `http_api` |
| `http_api` | the target host reachable | `Security:Url`: `http`/`https` only, private and loopback addresses refused (DNS resolved first), sensitive ports blocked, `AllowedDomains` empty = any public host; redirects are not followed (a 3xx is the answer). `Host`, `Cookie`, `Proxy-Authorization`… headers are removed; `Authorization` is sent with a warning — its value would come from the prompt |
| `github` | a token for writes: `Orkeon:Tools:GitHub:Token`, else the variable `Orkeon:Tools:GitHub:TokenVariable` names (`GITHUB_TOKEN` by default), else `GH_TOKEN` (#222, `GitHubToolOptions.ResolveToken`, read once when the tool is built) | without one, public reads only, at GitHub's anonymous rate, and `create_issue` / `create_pr` are refused by GitHub (the description says so). With one, every run of the machine whose environment holds it acts as that GitHub account — a key the team does not own (`reliability/security.md`); its read actions are `Read`, its writes `Execute` (`AccessFor`, #219) |
| `image_generation` | secret `OPENAI_API_KEY`, i.e. `ORKEON_OPENAI_API_KEY` in the environment; `api.openai.com` reachable | the key is no longer an argument (24ab0d0 took it in the call); every image is a paid call to `api.openai.com`, whatever the run's LLM profile — only when `TEAM.md § Need` asks for images |
| database tools | a `connection_string` **as a call argument** | anything with a password in it is a secret in the prompt: use a C# tool |
| `shell_command` | its allowlist | default: `ls`, `cat`, `pwd`, `which`, `grep`, `wc`, `echo`, `git` (`status`/`log`/`diff`/`show`), `dir`, `type`, `where`; no shell operators (`;`, pipes, `$(`, back-ticks); 30 s; output cut at 10,000 characters (`AgentDefaults`); without `working_directory` it runs where relative paths resolve — the agent's root, else `/workspace` (`ShellCommandTool`, #199/#200, no longer the first mount); since 13461ea a command outside the read-only default list needs every right on the paths it names and on its working directory; one shell session per agent run (since fa46bb5; a timeout resets it). Confined by default since fa46bb5 (`Orkeon:Tools:Shell:Confinement:Mode` `Auto`: bubblewrap on Linux, Seatbelt on macOS, an AppContainer on Windows — the mounts, the system directories, no network, fail closed) **except in a container**, the workshop's included: there it runs with the host's privileges, and the default `cat` reads the machine's settings, the mail and drive OAuth tokens, Claude Code's credentials and, through `/proc`, the model key (V-16). A team released to Studio on Windows or to a host outside a container gets the confined shell: no network, no toolchain outside the system directories, unless that machine sets `Confinement:AllowNetwork`, `ReadOnlyPaths` or `Mode` `None` (`reliability/security.md` § 7). Widened machine-wide by `Orkeon:Tools:Shell:ExtraAllowedCommands`, `AllowedCommands`, `AllowInterpreters` — never in a team's settings file (the checks refuse `Orkeon:Tools:Shell:*`) |
| `human_input` / `humanInput: true` | `--events jsonl` (Studio, the bench) to reach a person | without `--events` the provider auto-approves: "approved", `true`, the default value, or the recommended choice (`recommended`) else the first (`AutoApproveHumanInputProvider`). Under `--events` the run waits for the answer; when none can come (stdin closed, run cancelled), only a confirmation is refused — a text falls back to its default (else empty), a choice to its default (else the first option) (`orkeon/cli.md` § 2.5). With `Orkeon:Checkpointing:Enabled` (1.2.0) the question is durable: a plain `orkeon run` with nobody to ask stops on it — exit **75**, `run.finished` `status: "waiting_for_input"` — and `orkeon run <crew> --resume <id> --input "…"` answers it (`reliability/error-handling.md` § 5) |
| semantic search (`directory_search`, `txt_search`, `mdx_search`, `pdf_search`, `semantic_search`, `cache_search`) | embeddings (local by default) | approximate ranking: never the basis of an exact contract |
| `rag_search`, `rag_ingest`, `rag_eval` | the RAG subsystem (every runner registers it), embeddings; a collection, else `Orkeon:Rag:Collection` | attachable at 1.2.0 (the CLI command is `orkeon eval rag` since rc.7, no longer `orkeon rag eval`; since 1.2.0 a collection indexed with another embedding model is refused — `orkeon rag ingest --reindex`); for the crew's own corpus prefer `rag:` + `knowledge:` (`orkeon-reference.md` § 8). `rag_search` knows only what was ingested: since c101cbd (#284) its description sends a code question to `codebase_search`, `grep` and `file_read` and no longer offers the code index as a collection (the tool still routes `collection: "raggable-tree"` to it, `RagSearchTool.cs`); `.json` / `.yaml` files have no loader, so a key or value of a configuration or data file is found with `grep` then `file_read`, never `rag_search` |
| tools of an MCP server | the server under `MCP:Servers` of the settings the run resolves, reachable | connected before the crew loads; a name a built-in holds is refused; a tool whose schema cannot be read is set aside with a warning, its server's others kept (from 1.3.0, #417); not a team's own tool |
| code analysis (29 tools: the 15 of rc.5, since rc.6 `node_read`, `node_outline`, `node_insert`, `node_replace`, `node_ensure`, `edit_batch`, `structural_search`, `structural_rewrite`, `batch_anchors`, `affected_tests`, `access_cost`, `documented_in`, `documents_of`, and since c101cbd `edge_list` — `RaggableToolsExtensions`) | `RaggableTree:Enabled` not `false` | every one sends its schema since c101cbd (#282; § 4); a result is cut at 12,000 characters, and `truncated` means more results exist (`orkeon-reference.md` § 5); which question goes to which tool: § 6.1. `node_*`, `edit_batch` and `structural_rewrite` **write** source files: an acting tool (§ 5) |
| `edit_file`, `glob`, `grep` (since rc.6, `FileSystemToolExtensions`) | nothing | exact-string edit of a file, file patterns, a content search over the mounts: the file tools of the agent loop; `edit_file` writes like `file_write`; a "how many" question takes one `grep` call with `output_mode: "count"` (since 8f4de67, #260), and its `total_matches` with `scan_complete: true` is exact even when the hits were cut at `max_results` (since 0ea39d9 `scan_complete` is `false` when a file over 1 MiB was skipped, and `truncated` is `true` when the count mode cut its counts) |
| `system_one_decide` | the active decision provider: registered only when one is — TypeSafe or Liquid deduced from their section or key, or one named by `Orkeon:Decision:Provider`, Kev included (`RunnerHost`, `AddOrkeonDecisionProvider`, since 0ea39d9; TypeSafe alone from b8833ca) | a call to that provider, paid for the hosted two; absent from `--list-tools` otherwise |

Since 23f4eae a mail tool listed by an agent or a task must have its base right on a **ready** account of the
settings the run resolves, or the crew does not load: `orkeon run` exits 2 before any model call with
`ERROR:` and one line per tool (`EmailRightsCheck`; `--validate` fails with the same lines;
`reliability/security.md` § 3). Since fa46bb5 the drive tools are judged the same way (`DriveRightsCheck`). A team
the workshop tests without a mailbox or a drive therefore lists no mail or drive tool — an `email_search` "to be
configured later" refuses the whole run. `orkeon forge` now offers the twelve
mailbox tools (only `shell_command`, `code_interpreter` and, since 13461ea, the eleven drive tools, which have no
trial drive yet, stay out of its catalogue) and tries them on a
fictitious mailbox (FORGE-10); a forged plan's `maxIterations` below 6 is raised to 6
(`design/sizing-and-cost.md` § 2).

Mail accounts are configuration, not crew definition: the e-mail guide puts them in the crew's own
`appsettings.json`, which agents can read; the harness keeps them in the team's settings file of the workshop,
`settings/<slug>/appsettings.json` (D33, `orkeon/studio-layout.md`), which holds variable names, never a
password. To test an `http_api` team against a local mock, the
test run needs `ORKEON_Security__Url__BlockPrivateIPs=false` (read in `UrlSecurityOptions`; not verified on
a binary). Neither belongs in the team's launchers, and the checks refuse the second in a team's settings file.

## 4. The tools that had an empty schema

Up to 83cd91d, 28 tools reached the model with no parameters, 21 of them although they read arguments (§ 5, footnote ¹ of the
reference; V-06 on 1.0.0-rc.4, V-55 at 83cd91d): `memory_store`, `session_store`, `session_snip` and most code-analysis
tools; the model called them blind and they ran with their defaults (`memory_store` listed). Since c101cbd (Orkeon
#282) every tool sends its parameter schema — names, descriptions, defaults, enums, required flags — and only the
seven parameterless tools send an empty one (`list_mounts`, `drive_accounts`, `email_accounts`, `session_stats`,
`session_cost`, `token_budget`, `index_status`). They are no longer to be avoided for that reason. What still holds:
a call is described, not proven — a design that relies on a precise use (an `edge_kinds`, a `direction`, an
`expand`) names the arguments in the task description and proves at L3, on the target model, that the call does
what the task needs; an L2 scripted call proves only that the tool accepts the arguments.

## 5. Tools that act, and their risk

| Tool | What it changes | Main risk | Keep it safe |
|---|---|---|---|
| `email_send` | sends mail from the account (`From` forced to its address) | an irreversible message on the user's behalf, steered by an injected mail | only when `TEAM.md § Need` authorises it; `Send:AllowedRecipients` = the need's list (empty = nobody; To, Cc, Bcc checked; the envelope is the checked list), `MaxRecipients`, `MaxPerHour` (per process); its agent reads no mail; `INV-EMAIL` |
| `email_draft` | saves a message in the mailbox's Drafts | little: a person sends it | the default for any reply leaving the user's own addresses |
| `email_move`, `email_mark`, `email_create_folder`, `email_rename_folder` | sorts the mailbox (`Organize` right) | mail hidden from its owner | grant `Organize` only to a sorting team; `INV-IDEMP` on reruns |
| `email_delete` | moves to the trash; `permanent: true` with `Purge` deletes for good; returns each deleted id, with its new id in the trash when the server gives one | loss of mail | do not grant `Delete` or `Purge` without a need that says so |
| `email_save_attachment` | writes attachments into a writable virtual directory | untrusted files in the team's folders | a dedicated point; it never overwrites and sanitises names |
| `drive_upload`, `drive_create_folder`, `drive_move` (since 13461ea) | put a file of the VFS on a cloud drive, replace a file's content (`replace_id`), create, move or rename an item | a change in the user's drive; a deliverable leaving the machine | `Write` / `Organize` only when `TEAM.md § Need` says so; a `Root` folder for the team |
| `drive_share` (since 13461ea) | gives addresses access to an item, or creates a public link | data handed to someone outside | `Share` only with the recipients written in the need and the same list in `Share:AllowedRecipients`; no `AllowPublicLinks` without a need that says so |
| `drive_delete` (since 13461ea) | moves to the trash; `permanent: true` with `Purge` deletes for good | loss of files | do not grant `Delete` or `Purge` without a need that says so |
| `file_write`, `edit_file` (rc.6) | creates, overwrites or appends a file under a `rw`/`rwnd` root; `edit_file` replaces a string in place | writing beside the deliverables, appending twice, `create_backup` leaving timestamped copies | a `deliverable` instead; `/drafts`, `/state` as separate points; `append` only for a registry the design tests (`INV-IDEMP`) |
| `docx_writer`, `xlsx_writer` | create or overwrite an Office file (`append_to_existing` adds sheets) | same as `file_write` | same |
| `http_api` | anything the target API does on `POST`/`PUT`/`PATCH`/`DELETE` | an action on the user's behalf; injection driving the URL or body | only when `TEAM.md § Need` authorises the action; its agent reads no untrusted input; `Security:Url:AllowedDomains` on the machine |
| `shell_command` | whatever an allowed command does, with the host's privileges (since 13461ea a writing command needs every right on the paths it names; outside a container, confined by default since fa46bb5, it sees only its mounts and the system directories, without network) | the default allowlist already reads outside the VFS (V-16); widened allowlists are remote code execution | avoid it: the checks warn on it, and refuse it when the team (or, without a team file, the machine) declares a mail or drive account (`reliability/security.md` § 7); never `AllowInterpreters` |
| `relational_database_query` and family | `query_type: Execute` writes | destructive SQL from a model | read-only credentials — which means a C# tool (§ 3) |
| `mongodb_query` | `InsertOne`, `UpdateOne`, `DeleteOne` | same | same |
| `publish_event`, `post_message`, `send_request`, `reply_to` | messages on the in-memory bus of the run | loops between agents | only in teams designed around the bus |
| `session_store`, `session_snip` | truncate the conversation (`session_store` also reads/writes several state keys and appends one message, `append_message`, since 151a762) | the agent forgets its task | do not give them |

Three rules: an **acting tool goes to one agent**, the one whose task performs the action; that agent
**does not read untrusted input** (another agent extracts, it acts on the extraction — `INV-INJECTION`);
the action is **idempotent** or guarded by a registry (`INV-IDEMP`). For mail, the account's `Rights` and
the send allow-list are enforced by Orkeon whatever the model says — grant the fewest (`Read, Organize,
Draft` covers triage and prepared replies); for a drive, the account's `Rights`, `Root` and share allow-list. Two
more guards exist at 1.2.0, both the host's or the agent's to turn on: the **permission gate** now reaches
declarative crews (`ToolInvocationPipeline` consults `IPermissionGate` after the Guardian) once
`Orkeon:Security:PermissionGate:Enabled` is `true` — off by default: "Left `false`, no tool call is gated"; on, "a
tool that only reads passes and the others need an approval, by permission mode" (`permissionMode:` on a YAML
agent — `default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk` —, else `PermissionGate:DefaultMode`),
and without an approval channel a call that needs one is refused, the model reading the reason as the tool's
result; and an agent's **`filesystem:`** list (paths or `{path, access}`, 1.1.0) narrows the mounts its tools may
touch, never widens them. Neither is on unless written: a team that relies on one says so in `TEAM.md § Design`
and proves it at L2. Beyond them,
the Guardian's tool phase blocks only path traversal, SSRF targets and SQL injection outside the
`*_query` tools, so for every other acting tool the design and the invariants are the guard.

## 6. Keeping each agent's list minimal

Every tool of an agent is sent with **every** request of every task it runs: a line in the system prompt
(name, description, required and optional arguments) and its JSON schema in `tools[]`. Measured on the V-06
request (1.0.0-rc.4), an agent with the 68 tools of that version sends an 11,330-character system prompt and
41,451 characters of schemas — about 13,000 tokens at four characters per token, before the task, more than
the 8,192-token context of the image's local model. A tool with parameters weighs 370 to 1,550 characters of
schema (median about 780), plus its line in the system prompt. The 24ab0d0 build listed 80 tools: the same
68 and the twelve mailbox tools; since a2bb6c3 `rag_search`, `rag_ingest` and `rag_eval` are listed too:
83 tools (V-01); since 13461ea the eleven `drive_*` tools as well: 94 (read in the sources); since e44df3f `edit_file`, `glob`,
`grep` and thirteen code-analysis tools as well: 110 without configuration at f80665f, 8f4de67, 151a762, 0ea39d9, c727c06 and 83cd91d, 111 with a
decision provider (`system_one_decide`; TypeSafe alone until 151a762); since c101cbd `edge_list` as well: 111, 112 with a decision provider;
at 1.2.0 `firefox` as well (a Firefox installed on the host, driven over WebDriver BiDi — an acting, network tool,
§ 5): **112** without configuration, 113 with a decision provider (`orkeon run --list-tools` of the 1.2.0 CLI).
Since c101cbd the analysis tools, `memory_store`, `session_store` and `session_snip` send their whole schema, so each
weighs more than it did when it was sent empty.

- List the tools the task descriptions name, nothing else. A writer whose output is a `final_message`
  deliverable needs **no tool**.
- One reading tool per format; do not give `file_read` *and* `directory_search` "to be safe".
- `allowDelegation: false` unless delegation is designed: in `sequential` and `graph` it adds two tools.
- `humanInput: true` adds `human_input` to that task only. Task-level `tools:` are added to the agent's
  for that task only (`TaskToolbelt`, a2bb6c3): a tool one task of the agent needs goes on that task, so the
  agent's other tasks do not carry its schema.
- Split an agent whose tasks need disjoint tool sets — for mail, the reader and the sender are two agents.

### 6.1 Telling an agent which tool answers which question

An agent handed analysis tools with no rule of use answers a structural question ("every base class", "who
inherits X") the way it knows best — a shell script of regular expressions over the files, slower than the index
and blind to what it resolved (Orkeon Code, 9d28846). When an agent holds code-analysis or file-search tools, its
`backstory` (or the task `description`) carries one line per question, **only for the tools that agent holds** —
a line naming a tool it lacks sends it looking for one. The argument names are the wire names of § 5 of the
reference (1.2.0):

| Question | Tool and the argument that makes it answer |
|---|---|
| the repository's shape | `codebase_map` (`level: "L1_Package"` first) |
| what one package holds and exposes | `package_summary(fqn)` |
| a symbol by name or meaning | `codebase_search(query)`, `filter_kinds: ["Class"]` for one kind |
| one type's bases and what derives from or implements it | `symbol_detail(fqn, expand: "Inheritance")`; its callers: `expand: "Callers"` |
| who calls or extends a symbol, over hops | `sub_graph(seeds: [fqn], direction: "Backward", edge_kinds: ["calls"])` or `["inherits"]` |
| every edge of one kind, across the index or under a `root_fqn` (every base class, implementation, import) | `edge_list(edge_kinds: ["inherits"])`, paged by `next_cursor` until null; `total` counts them (over `orkeon mcp serve`, the array needs Orkeon 1.3.0, the image's release (`main` from 4709278 on): 1.2.0 refuses it, `orkeon/orkeon-reference.md` § 5) |
| a call chain over several hops | `flow_trace(from, direction)` — `Forward`, `Backward` or `Both` |
| what breaks if a symbol changes | `impact_analysis(target)` |
| the tests a change concerns | `affected_tests(changed_files)`, or `base` for a git ref |
| how packages or modules depend on each other, and their cycles | `dependency_graph` (`scope: "L1_Package"` or `"L2_Module"`) |
| every place a code shape occurs | `structural_search` with its `language` |
| how many times a text occurs in one file | `count_pattern` |
| a text across many files, or a key or value of a configuration or data file | `grep` with a `glob` (`output_mode: "count"` for how many; since 1.1.0 `path` may be one file, searched alone — a `glob` beside a file is refused), then `file_read` on the range around the hit |

Three rules go with it, each only to an agent that holds the tools it names:

- **A truncated result is a sample.** `truncated: true` means more results exist than were returned: the
  answer says it is partial, and the agent narrows the question — one package, a `root_fqn`, a `glob` — or pages
  (`edge_list`'s `next_cursor`), **never** writes a script over every file (to the holder of `shell_command`).
  A limit that would return nothing is refused since 1.1.0 (#372: `max_rows`, `top_k`, `max_results`, `max_depth`…
  below 1, in a message naming the field and its default) instead of answering an empty success.
- **Edit by the smallest unique `old_string`.** `edit_file` changes an existing file after a `file_read` of the
  range around the change; when `old_string` is not unique, more context or `replace_all`. `file_write` is for a
  new file or a content rewritten whole (its description says so since c101cbd, #284).
- **The shell is not a reader.** `file_read`, `grep` and `glob` answer what `cat` and `find` would, for less;
  `shell_command` is for builds, tests, git and the project's scripts (Orkeon Code, fe29077).

## 7. Check

- Every tool in `TEAM.md § Design` (`### Tools`) is in `orkeon run --list-tools`, or is a custom tool with its
  "why deterministic" and its L1 tests; a tool the design relies on in a way its description does not state, proven at L3.
- Every key or account a tool needs is named in `TEAM.md § Need` (`### Security`) with where it lives — never a
  secret on disk; every mail account with the fewest `Rights` and, if it sends, its allow-list.
- `INV-TOOLS` compares the `tool.called` events with each agent's declared tools; `INV-FS`, `INV-SECRETS`,
  `INV-INJECTION`, `INV-EMAIL` apply as `testing/invariants-catalog.md` says.
