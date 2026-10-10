# Tools selection — where each piece of work goes

> Reference document of the Orkeon harness (the workshop's `references/design/`). Established on Orkeon main at ce9ec1f (2026-10-09, after 1.0.0-rc.4).
> Sources: at that commit — `src/core/Orkeon.Infrastructure/Configuration/CrewFactory.cs`, `src/core/Orkeon.Infrastructure/Tools/ToolRegistry.cs`,
> `src/hosting/Orkeon.Hosting/RunnerHost.cs`, `McpStartup.cs`, `src/core/Orkeon.Infrastructure/MCP/McpToolAdapter.cs`,
> `src/tools/Orkeon.Tools.Email/DependencyInjection/EmailToolsServiceCollectionExtensions.cs`, `docs/guides/email.md`,
> `docs/adr/ADR-012-email-tool-family.md`, `src/tools/Orkeon.Tools.Web/DependencyInjection/WebToolExtensions.cs`,
> `WebSearchTool.cs`, `HttpApiTool.cs`, `ImageGenerationTool.cs`, `src/core/Orkeon.Infrastructure/Configuration/UrlSecurityOptions.cs`,
> `src/tools/Orkeon.Tools.Abstractions/Security/HttpHeaderSanitizer.cs`, `src/tools/Orkeon.Tools.Code/ShellCommandTool.cs` and
> `DependencyInjection/CodeToolExtensions.cs`, `src/tools/Orkeon.Tools.FileSystem/FileWriteTool.cs`, `src/tools/Orkeon.Tools.Rag/`,
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
   rule `R-nn` of `NEED.md` → a **deterministic tool**, unit-tested at L1. The LLM judges, classifies,
   extracts meaning and writes; a script checks what it can (principle 6 of `process/workflow.md`).
2. **Does a built-in tool do it?** Look in § 5 of the reference, check its arguments, and avoid the tools
   with an empty schema (§ 4). Built-in first: no code, no test to write, same in Studio. Mail is built-in on
   main: thirteen `email_*` tools (§ 3).
3. **Must the tool itself read or write files, use the network, a key, a .NET library or heavy
   computation?** Yes → **C#**. No → **pure TypeScript** (`toolBuilder`), if the team can be TypeScript.
4. **Must Studio launch the team?** A C# tool reaches a YAML or TypeScript team only through the harness
   runner `orkeon-harness-run` (plugin route) or a C# host; Studio launches the real `orkeon`, which loads no
   plugin (V-07; still true at ce9ec1f: no shipped composition root calls `AddOrkeonPlugins`). If the team
   must run from Studio, the work stays in built-in or TypeScript tools.

## 2. Decision table

| The work | Where | Why |
|---|---|---|
| Read text, JSON, XML | `file_read` | built-in |
| Read an `.eml` file from a mount point | `email_parser` (`path`, `offset`, `max_chars`) | built-in, no account; `.msg` is not supported |
| Read, search, sort a real mailbox (IMAP, POP3, Microsoft Graph) | `email_search`, `email_read`, `email_move`, `email_mark`… | built-in; an account the operator declares (§ 3) |
| Prepare a reply for a human | `email_draft` (saved in the mailbox's Drafts, never sent) or a draft file under `/drafts` | the review path; `NEED.md` says which |
| Send mail | `email_send`, only when `NEED.md` authorises sending | built-in, closed until `Send:AllowedRecipients` lists the recipients |
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

YAML teams have no custom tools of their own. At ce9ec1f every registered tool is attachable (the `ITool`
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

| Tool | Needs | Notes at ce9ec1f |
|---|---|---|
| the twelve mailbox tools (`email_accounts` … `email_send`) | an account under `Orkeon:Tools:Email:Accounts:<name>` in the settings the run resolves (`orkeon/cli.md` § 5): `Provider`, `Address`, a **mandatory** `Rights` — one string of names separated by commas (`"Read, Organize, Draft"`; `Read`, `Organize`, `Draft`, `Send`, `Delete`, `Purge`) —, the **name** of the variable holding the password (`Auth:PasswordEnvVar`; the variable itself in the environment of the run — in the container nothing else is read; on Windows the user's scope too) or an OAuth2 sign-in (`orkeon email login <account>`, or « Sign in » in Studio's Settings › E-mail, which serves the runs of that Windows machine only); the mail servers reachable | always registered: until an account is declared every call fails — on the 24ab0d0 build `email_search` answered "No e-mail account is configured. Declare one under Orkeon:Tools:Email:Accounts (see the e-mail guide, docs/guides/email.md)." The agent names an `account`, never a server or a secret. An account holding a value that cannot be read or a key no account carries is set aside, and reported when a call names it; the others keep working. `Security: None` is accepted towards a loopback test server only — the way to test without a real mailbox |
| `email_parser` | nothing | reads an `.eml` from the VFS; same output as `email_read` |
| `web_search` | secret `TAVILY_API_KEY`, i.e. `ORKEON_TAVILY_API_KEY` in the environment; `api.tavily.com` reachable | the tool call fails at run time without it |
| `brave_search` | `BRAVE_API_KEY` when the run starts | otherwise the name is unknown and loading fails |
| `web_scrape`, `scrape_element` | the target hosts reachable | same guard as `http_api` |
| `http_api` | the target host reachable | `Security:Url`: `http`/`https` only, private and loopback addresses refused (DNS resolved first), sensitive ports blocked, `AllowedDomains` empty = any public host; redirects are not followed (a 3xx is the answer). `Host`, `Cookie`, `Proxy-Authorization`… headers are removed; `Authorization` is sent with a warning — its value would come from the prompt |
| `github` | nothing — and nothing can be given | built with no token: public reads only, at GitHub's anonymous rate; `create_issue` cannot authenticate |
| `image_generation` | secret `OPENAI_API_KEY`, i.e. `ORKEON_OPENAI_API_KEY` in the environment; `api.openai.com` reachable | the key is no longer an argument (24ab0d0 took it in the call); every image is a paid call to `api.openai.com`, whatever the run's LLM profile — only when `NEED.md` asks for images |
| database tools | a `connection_string` **as a call argument** | anything with a password in it is a secret in the prompt: use a C# tool |
| `shell_command` | its allowlist | default: `ls`, `cat`, `pwd`, `which`, `grep`, `wc`, `echo`, `git` (`status`/`log`/`diff`/`show`), `dir`, `type`, `where`; no shell operators (`;`, pipes, `$(`, back-ticks); 30 s; host privileges, no sandbox: the default `cat` reads the machine's settings, the mail OAuth tokens, Claude Code's credentials and, through `/proc`, the model key (V-16). Widened machine-wide by `Orkeon:Tools:Shell:ExtraAllowedCommands`, `AllowedCommands`, `AllowInterpreters` — never in a team's settings file (the checks refuse `Orkeon:Tools:Shell:*`) |
| `human_input` / `humanInput: true` | `--events jsonl` (Studio, the bench) to reach a person | without `--events` the provider auto-approves: "approved", `true`, the default value or the first choice. Under `--events` the run waits for the answer; when none can come (stdin closed, run cancelled), only a confirmation is refused — a text falls back to its default (else empty), a choice to its default (else the first option) (`orkeon/cli.md` § 2.5) |
| semantic search (`directory_search`, `txt_search`, `mdx_search`, `pdf_search`, `semantic_search`, `cache_search`) | embeddings (local by default) | approximate ranking: never the basis of an exact contract |
| `rag_search`, `rag_ingest`, `rag_eval` | the RAG subsystem (every runner registers it), embeddings; a collection, else `Orkeon:Rag:Collection` | attachable at ce9ec1f; for the crew's own corpus prefer `rag:` + `knowledge:` (`orkeon-reference.md` § 8) |
| tools of an MCP server | the server under `MCP:Servers` of the settings the run resolves, reachable | connected before the crew loads; a name a built-in holds is refused; not a team's own tool |
| code analysis (15 tools) | `RaggableTree:Enabled` not `false` | empty schemas (§ 4) |

Mail accounts are configuration, not crew definition: the e-mail guide puts them in the crew's own
`appsettings.json`, which agents can read; the harness keeps them in the team's settings file of the workshop,
`settings/<slug>/appsettings.json` (D33, `orkeon/studio-layout.md`), which holds variable names, never a
password. To test an `http_api` team against a local mock, the
test run needs `ORKEON_Security__Url__BlockPrivateIPs=false` (read in `UrlSecurityOptions`; not verified on
a binary). Neither belongs in the team's launchers, and the checks refuse the second in a team's settings file.

## 4. The tools with an empty schema

17 tools reach the model with no parameters although they read arguments (§ 5, footnote ¹; V-06, the same
17 in the tool schemas recorded on the 24ab0d0 build and on a build of fb26364, their request classes still
without `[FieldSchema]`): `memory_store`, `session_store`, `session_snip` and
14 of the 15 code-analysis tools (`index_codebase` … `statement_query`; `index_status` takes none). The
e-mail tools have full schemas. The model calls them blind and they run with their defaults
(`memory_store` lists). **Avoid them.** A design that needs one must name the arguments in the task
description and prove at L3, on the target model, that the call does what the task needs — an L2 scripted
call proves only that the tool accepts the arguments.

## 5. Tools that act, and their risk

| Tool | What it changes | Main risk | Keep it safe |
|---|---|---|---|
| `email_send` | sends mail from the account (`From` forced to its address) | an irreversible message on the user's behalf, steered by an injected mail | only when `NEED.md` authorises it; `Send:AllowedRecipients` = the need's list (empty = nobody; To, Cc, Bcc checked; the envelope is the checked list), `MaxRecipients`, `MaxPerHour` (per process); its agent reads no mail; `INV-EMAIL` |
| `email_draft` | saves a message in the mailbox's Drafts | little: a person sends it | the default for any reply leaving the user's own addresses |
| `email_move`, `email_mark`, `email_create_folder`, `email_rename_folder` | sorts the mailbox (`Organize` right) | mail hidden from its owner | grant `Organize` only to a sorting team; `INV-IDEMP` on reruns |
| `email_delete` | moves to the trash; `permanent: true` with `Purge` deletes for good; returns each deleted id, with its new id in the trash when the server gives one | loss of mail | do not grant `Delete` or `Purge` without a need that says so |
| `email_save_attachment` | writes attachments into a writable virtual directory | untrusted files in the team's folders | a dedicated point; it never overwrites and sanitises names |
| `file_write` | creates, overwrites or appends a file under a `rw`/`rwnd` root | writing beside the deliverables, appending twice, `create_backup` leaving timestamped copies | a `deliverable` instead; `/drafts`, `/state` as separate points; `append` only for a registry the design tests (`INV-IDEMP`) |
| `docx_writer`, `xlsx_writer` | create or overwrite an Office file (`append_to_existing` adds sheets) | same as `file_write` | same |
| `http_api` | anything the target API does on `POST`/`PUT`/`PATCH`/`DELETE` | an action on the user's behalf; injection driving the URL or body | only when `NEED.md` authorises the action; its agent reads no untrusted input; `Security:Url:AllowedDomains` on the machine |
| `shell_command` | whatever an allowed command does, with the host's privileges | the default allowlist already reads outside the VFS (V-16); widened allowlists are remote code execution | avoid it: the checks warn on it, and refuse it when the team (or, without a team file, the machine) declares a mail account (`reliability/security.md` § 7); never `AllowInterpreters` |
| `relational_database_query` and family | `query_type: Execute` writes | destructive SQL from a model | read-only credentials — which means a C# tool (§ 3) |
| `mongodb_query` | `InsertOne`, `UpdateOne`, `DeleteOne` | same | same |
| `publish_event`, `post_message`, `send_request`, `reply_to` | messages on the in-memory bus of the run | loops between agents | only in teams designed around the bus |
| `session_store`, `session_snip` | truncate the conversation | the agent forgets its task | do not give them |

Three rules: an **acting tool goes to one agent**, the one whose task performs the action; that agent
**does not read untrusted input** (another agent extracts, it acts on the extraction — `INV-INJECTION`);
the action is **idempotent** or guarded by a registry (`INV-IDEMP`). For mail, the account's `Rights` and
the send allow-list are enforced by Orkeon whatever the model says — grant the fewest (`Read, Organize,
Draft` covers triage and prepared replies). Nothing else is: there is no per-call approval for declarative
crews (`IPermissionGate` and the tools' `ToolAccess` classes serve the scripted `ctx.llm.act` loop only), and
the Guardian's tool phase at ce9ec1f blocks only path traversal, SSRF targets and SQL injection outside the
`*_query` tools, so for every other acting tool the design and the invariants are the guard.

## 6. Keeping each agent's list minimal

Every tool of an agent is sent with **every** request of every task it runs: a line in the system prompt
(name, description, required and optional arguments) and its JSON schema in `tools[]`. Measured on the V-06
request (1.0.0-rc.4), an agent with the 68 tools of that version sends an 11,330-character system prompt and
41,451 characters of schemas — about 13,000 tokens at four characters per token, before the task, more than
the 8,192-token context of the image's local model. A tool with parameters weighs 370 to 1,550 characters of
schema (median about 780), plus its line in the system prompt. The 24ab0d0 build listed 80 tools: the same
68 and the twelve mailbox tools; since a2bb6c3 `rag_search`, `rag_ingest` and `rag_eval` are listed too:
83 tools (V-01).

- List the tools the task descriptions name, nothing else. A writer whose output is a `final_message`
  deliverable needs **no tool**.
- One reading tool per format; do not give `file_read` *and* `directory_search` "to be safe".
- `allowDelegation: false` unless delegation is designed: in `sequential` and `graph` it adds two tools.
- `humanInput: true` adds `human_input` to that task only. Task-level `tools:` are added to the agent's
  for that task only (`TaskToolbelt`, a2bb6c3): a tool one task of the agent needs goes on that task, so the
  agent's other tasks do not carry its schema.
- Split an agent whose tasks need disjoint tool sets — for mail, the reader and the sender are two agents.

## 7. Check

- Every tool in `DESIGN.md` (`## Tools`) is in `orkeon run --list-tools`, or is a custom tool with its
  "why deterministic" and its L1 tests; no empty-schema tool without an L3 proof.
- Every key or account a tool needs is named in `NEED.md` (`## Security`) with where it lives — never a
  secret on disk; every mail account with the fewest `Rights` and, if it sends, its allow-list.
- `INV-TOOLS` compares the `tool.called` events with each agent's declared tools; `INV-FS`, `INV-SECRETS`,
  `INV-INJECTION`, `INV-EMAIL` apply as `testing/invariants-catalog.md` says.
