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
#   the code index (index, search, symbols, dependency graph, impact, flows), the document readers
#   (csv, pdf, docx, xlsx, json, xml, eml), http_api and the scrapers, the RAG search. With a key in
#   the environment: web_search (TAVILY_API_KEY), brave_search (BRAVE_API_KEY). Never by default: what writes a file of the folder — the file, edit and shell
#   tools, which Claude Code has and the hooks of the harness see, and docx_writer, xlsx_writer and
#   rag_ingest, which those hooks would not see —, the e-mail and drive tools, the databases, the
#   event hub. Nor a tool whose required argument is an array, which Orkeon 1.2.0 refuses over MCP
#   (V-60, V-62): local_embed_text, sub_graph, and the two document writers; rag_ingest reads an
#   array as one path and ingests nothing. The server hands an array to the tool as its JSON text.
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
# An argument that is an array is refused by Orkeon 1.2.0 over MCP (D107, V-60): call the tools
# without their array filters. access_cost and affected_tests then work from the git diff alone, and
# rag_search finds what `orkeon rag ingest` put in a collection (rag_ingest, given an array, ingests nothing).
set -euo pipefail

DEFAULT_TOOLS="index_codebase index_status incremental_reindex is_path_indexed codebase_search codebase_map
symbol_source symbol_detail node_outline node_read dependency_graph impact_analysis affected_tests flow_trace
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
exec orkeon mcp serve --allow-external-mounts "${tools_arg[@]}" "$@"
