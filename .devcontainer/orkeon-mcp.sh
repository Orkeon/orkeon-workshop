#!/usr/bin/env bash
# orkeon-mcp — Orkeon's tools served to Claude Code over MCP (D112).
#
# The `.mcp.json` of a workshop names this command (sync-harness.sh writes the entry): Claude Code
# starts it, and it ends as `orkeon mcp serve` over stdio, with
#
#   - the folder of the session mounted read-write at /workspace (the code index keeps its cache
#     under <folder>/.orkeon/cache; read-only, Orkeon refuses to write it and indexes again at every
#     session — V-60). The mount is given through the environment, at an index no settings file
#     uses, so the settings chain of `orkeon` is read as usual (the user's file, its Llm section);
#   - a short list of tools (`--tools`), crossed with what this Orkeon has: a name it does not have
#     refuses the start (V-60), and a tool added to the list below must not break an older CLI.
#
# What is served by default — what Claude Code has no tool of its own for:
#   the code index (index, search, symbols, dependency graph and sub-graphs, impact, flows), the document readers
#   (csv, pdf, docx, xlsx, json, xml, eml), http_api and the scrapers, the RAG search. With a key in
#   the environment: web_search (TAVILY_API_KEY), brave_search (BRAVE_API_KEY). Never by default: what writes a file of the folder — the file, edit and shell
#   tools, which Claude Code has and the hooks of the harness see, and docx_writer, xlsx_writer and
#   rag_ingest, which those hooks would not see —, the e-mail and drive tools, the databases, the
#   event hub. Nor local_embed_text, whose answer is vectors, of no use to a model.
#   The code index alone writes, under <folder>/.orkeon/: its own cache.
#
# Two variables change the list (neither starts with ORKEON_: Orkeon loads every such variable into
# its configuration):
#   WORKSHOP_MCP_TOOLS         `all`: no --tools, everything Orkeon serves; else a comma-separated
#                              list that replaces the default one
#   WORKSHOP_MCP_EXTRA_TOOLS   a comma-separated list added to the default one
#
# Arguments are passed on to `orkeon mcp serve` (`--crew teams/<slug>/config.yaml` serves a team as
# the tool run_crew_<name>). `orkeon-mcp --print-tools` prints the list it would serve and exits.
#
# An argument that is an array or an object reaches the tool as such from Orkeon's main at 4709278 on
# (Orkeon#402, V-63; in the releases 1.3.0, V-66, and 1.4.0 the image installs); Orkeon 1.2.0 handed it over as its JSON text, which a tool refused
# (V-60, V-62). rag_search finds what `orkeon rag ingest` put in a collection.
set -euo pipefail

DEFAULT_TOOLS="index_codebase index_status incremental_reindex is_path_indexed codebase_search codebase_map
symbol_source symbol_detail node_outline node_read dependency_graph sub_graph impact_analysis affected_tests flow_trace
package_summary complexity_report structural_search graph_schema access_cost documented_in
documents_of statement_query list_mounts
csv_reader pdf_reader docx_reader xlsx_reader json_tool xml_parser email_parser pdf_search txt_search mdx_search
http_api web_scrape scrape_element
rag_search rag_eval semantic_search"

print_only=0
if [ "${1-}" = --print-tools ]; then print_only=1; shift; fi

command -v orkeon >/dev/null 2>&1 || { echo "orkeon-mcp: orkeon is not on the PATH" >&2; exit 127; }

root="${CLAUDE_PROJECT_DIR:-${ORKEON_WORKSHOP:-$PWD}}"
[ -d "$root" ] || { echo "orkeon-mcp: $root is not a folder" >&2; exit 2; }
root="$(cd "$root" && pwd -P)"

tools_arg=()
if [ "${WORKSHOP_MCP_TOOLS:-}" != all ]; then
  wanted="${WORKSHOP_MCP_TOOLS:-$DEFAULT_TOOLS}"
  [ -n "${WORKSHOP_MCP_TOOLS:-}" ] || {
    [ -n "${TAVILY_API_KEY:-}${ORKEON_TAVILY_API_KEY:-}" ] && wanted="$wanted web_search"
    [ -n "${BRAVE_API_KEY:-}" ] && wanted="$wanted brave_search"
  }
  wanted="$wanted ${WORKSHOP_MCP_EXTRA_TOOLS:-}"
  # What this Orkeon has: one name per line. A failure here is the failure the serve would have.
  have="$(cd "$root" && orkeon run --list-tools 2>/dev/null)" || { echo "orkeon-mcp: orkeon run --list-tools failed" >&2; exit 1; }
  list=""
  for tool in $(printf '%s' "$wanted" | tr ',' ' '); do
    case "$tool" in human_input) continue ;; esac
    if printf '%s\n' "$have" | grep -qxF "$tool"; then
      case ",$list," in *",$tool,"*) ;; *) list="${list:+$list,}$tool" ;; esac
    else
      echo "orkeon-mcp: $tool is not a tool of this Orkeon: left out" >&2
    fi
  done
  [ -n "$list" ] || { echo "orkeon-mcp: no tool to serve" >&2; exit 1; }
  tools_arg=(--tools "$list")
fi

if [ "$print_only" = 1 ]; then
  if [ "${#tools_arg[@]}" -gt 0 ]; then printf '%s\n' "${tools_arg[1]}" | tr ',' '\n'; else (cd "$root" && orkeon run --list-tools 2>/dev/null | grep -vx human_input); fi
  exit 0
fi

cd "$root"
export "ORKEON_Orkeon__FileSystem__Mounts__90=$root:/workspace:rw"
# From the sources of 1.3.0 on the server writes no null member (Orkeon#405, on main since 0dc7068, before the
# version moved to 1.3.0 at 1b480bd; V-65): its stream reaches Claude Code as it is, and a null a tool's result
# carries on purpose stays.
ver="$(orkeon --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1)" || ver=""
if [ -n "$ver" ] && [ "$(printf '1.3.0\n%s\n' "$ver" | sort -V | head -n 1)" = 1.3.0 ]; then
  exec orkeon mcp serve --allow-external-mounts "${tools_arg[@]}" "$@"
fi

command -v jq >/dev/null 2>&1 || { echo "orkeon-mcp: jq is not on the PATH" >&2; exit 127; }
# Orkeon 1.2.0 (and main before 0dc7068) writes "error": null beside every result and "result": null
# beside every error, which JSON-RPC 2.0 forbids, and null for the optional fields it leaves out
# (nextCursor, a text content's mimeType and data, an error's data). The MCP client of Claude Code
# refuses such a message, so the answer to `initialize` never arrives and the connection times out
# (V-64). Main fixes it at 0dc7068 (Orkeon#405, V-65): for an older Orkeon only — 1.2.0 put back by
# `orkeon-update`, a build of an earlier commit —, each line Orkeon writes loses its null-valued keys
# before it reaches Claude Code, except the message's own "id", which a parse error's answer carries as
# null; a tool's answer is a string, which this does not touch; a line that is not JSON goes through as it is.
exec orkeon mcp serve --allow-external-mounts "${tools_arg[@]}" "$@" \
  > >(exec jq -R -r --unbuffered '. as $l | try (fromjson | . as $m | walk(if type == "object" then with_entries(select(.value != null)) else . end)
    | if ($m | type) == "object" and ($m | has("id")) then .id = $m.id else . end | tojson) catch $l')
