# Orkeon's tools in Claude Code

*English · [Français](../fr/guides/orkeon-tools.md)*

Orkeon carries tools Claude Code has none of its own for: a code index, readers of office
documents, an HTTP client, scrapers, a document search. The workshop gives them to Claude Code over MCP
(Model Context Protocol), through a server named `orkeon` (D112). They need **no model and no key**: with
a Claude plan alone, Claude Code is the model, and Orkeon gives it tools.

In Claude Code they are named `mcp__orkeon__<tool>`: `mcp__orkeon__codebase_search`,
`mcp__orkeon__pdf_reader`… You do not call them yourself: Claude uses them when the work asks for it, and
`/mcp` in Claude Code lists the server and its tools.

## How it is set up

Nothing to do. At the start of the container, the synchronisation of the harness:

- registers the server in the `.mcp.json` of your folder:

  ```json
  { "mcpServers": { "orkeon": { "command": "orkeon-mcp", "args": [] } } }
  ```

- enables it in `.claude/settings.local.json` (`"enabledMcpjsonServers": ["orkeon"]`), so that Claude Code
  starts it without asking.

A workshop made before November 2026 gets both at its first start on the new image. The synchronisation
leaves alone:

| What it finds | What it does |
|---|---|
| your own servers in `.mcp.json` | keeps them, adds `orkeon` beside them |
| an `orkeon` entry already there, changed or not | keeps it as it is |
| `orkeon` in `disabledMcpjsonServers` of `.claude/settings.local.json` | enables nothing: that is your no |
| a `.mcp.json` git tracks, in a checkout | does not touch it, and says which entry to add yourself |
| a `.mcp.json` or a `settings.local.json` that is not a JSON object, or a symbolic link | does not touch it, and says so |

To turn the whole step off, set `HARNESS_ORKEON_MCP=0` on the container (`-e HARNESS_ORKEON_MCP=0`). To
turn the server off in one folder, list `orkeon` in `disabledMcpjsonServers`; removing the entry from
`.mcp.json` only lasts until the next synchronisation (a new image, or `sync-harness.sh --force`), which
adds it again.

## What is served

`orkeon-mcp` ends as `orkeon mcp serve`, with the folder of the session mounted read-write at
`/workspace` and a short list of tools — 39 on Orkeon 1.2.0, out of the 111 the server can serve:

| Group | Tools |
|---|---|
| the code index | `index_codebase`, `index_status`, `incremental_reindex`, `is_path_indexed`, `codebase_search`, `codebase_map`, `symbol_source`, `symbol_detail`, `node_outline`, `node_read`, `dependency_graph`, `impact_analysis`, `affected_tests`, `flow_trace`, `package_summary`, `complexity_report`, `structural_search`, `graph_schema`, `access_cost`, `documented_in`, `documents_of`, `statement_query`, `list_mounts` |
| document readers | `csv_reader`, `pdf_reader`, `docx_reader`, `xlsx_reader`, `json_tool`, `xml_parser`, `email_parser`, `pdf_search`, `txt_search`, `mdx_search` |
| not served | `docx_writer`, `xlsx_writer`, `rag_ingest`: they write files the hooks of the harness do not see; `local_embed_text`, `sub_graph`: like those three, their required argument is an array, which Orkeon 1.2.0 refuses over MCP |
| the network | `http_api`, `web_scrape`, `scrape_element` |
| document search (RAG) | `rag_search`, `rag_eval`, `semantic_search` — over a collection filled from a terminal by `orkeon rag ingest` |
| with a key in the environment | `web_search` with `TAVILY_API_KEY`, `brave_search` with `BRAVE_API_KEY` |

**Never served by default**: Orkeon's file, edit and shell tools. Claude Code has its own, and the hooks
of the harness see those alone. Nor the mail and drive tools, the databases, the event hub.

```bash
orkeon-mcp --print-tools           # the list this container would serve, one name per line
```

The tools read and write paths under `/workspace`: `/workspace/src/app.ts` is `src/app.ts` of your folder.

### Changing the list

Two variables of the container, read by `orkeon-mcp`:

| Variable | Effect |
|---|---|
| `WORKSHOP_MCP_EXTRA_TOOLS` | a comma-separated list added to the default one |
| `WORKSHOP_MCP_TOOLS` | a comma-separated list that replaces the default one; `all` serves everything Orkeon serves |

A name this Orkeon does not have is left out, with a line on stderr. `all` also serves Orkeon's file and
shell tools, which the hooks of the harness do not see: choose it knowingly. To serve a team as a tool,
change the entry of `.mcp.json` yourself — `"args": ["--crew", "<the team's crew file>"]`: the
arguments go to `orkeon mcp serve`, which serves the team as the tool `run_crew_<name>`; a team run this
way calls its model.

A search key is a tool secret, outside the two [modes of the model keys](./keys.md):
`workshop --secret TAVILY_API_KEY`, then the tool appears at the next start of Claude Code.

## The limits

- **An array argument is refused.** Over MCP, Orkeon 1.2.0 answers `Parameter '<name>' has invalid type.
  Expected: array` to an argument that is an array (`edge_kinds` of `dependency_graph`, for instance):
  the tools are called without their array filters (V-60).
- **The code index writes in your folder.** Its cache goes under `.orkeon/` at the top of the folder. The
  workshop's `.gitignore` lists it; a workshop versioned with git before November 2026 gets the line at
  its next start ([Updating](./updating.md#the-harness)), and in a checkout the harness lists `.orkeon/` in
  `.git/info/exclude`.
- **The network tools reach what the firewall allows.** `http_api` and the scrapers go through the
  container's firewall: a host outside its list needs `FIREWALL_EXTRA_DOMAINS`
  ([configuration](../reference/configuration.md#firewall)).
- **These tools are logged, not guarded.** The guards of the harness watch Claude Code's own file tools and
  its shell. A call to one of Orkeon's tools is only written down: one line in
  `.claude/local/mcp-calls.tsv` — the time (UTC), the session, the subagent's type or `main`, the tool's
  name — and nothing of its arguments, which may hold a path or a text you did not mean to keep.
  `HARNESS_MCP_LOG=0` in the `env` block of `.claude/settings.local.json` stops the log. That is why what writes a file — `docx_writer`, `xlsx_writer`, `rag_ingest` — is not served by
  default: added with `WORKSHOP_MCP_EXTRA_TOOLS`, they would write under `/workspace` without the phase
  guard or the key guard — and on Orkeon 1.2.0 they cannot be called at all, their required argument being
  an array. Orkeon's own Guardian still checks every call (path traversal, SSRF).
- **What was measured** (V-60): the server starting with no settings and no model, the list, the mount,
  `index_codebase` and `codebase_search` on a folder of one file. Not measured: the index on a real
  repository, and whether its embedding model is carried by the tool or downloaded at first use.

## When a tool is missing

| You see | Cause | Do |
|---|---|---|
| no `orkeon` server under `/mcp` | the container runs with `HARNESS_ORKEON_MCP=0`, the entry is listed in `disabledMcpjsonServers`, or the `.mcp.json` is the repository's | read the `[harness] .mcp.json…` line of the start; add the entry by hand in a checkout |
| the server is listed as failed | `orkeon-mcp` could not start: `orkeon` missing, or `orkeon run --list-tools` failing | run `orkeon-mcp --print-tools` in a terminal of the container and read its error |
| `web_search` answers `Secret 'TAVILY_API_KEY' was not found` | the key is not in the environment | `workshop --secret TAVILY_API_KEY` |

Next: [Orkeon Code and Studio's terminal applications](./orkeon-code.md).
