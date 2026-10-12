# cc-usage

The composition of one Claude Code session's context, and its cost at the API list price: what
filled the context (`(startup)`, each tool, the replayed output, the compactions), the subagents,
the cache rebuilt after an idle gap, a grade A to F. It complements `claude-usage-dashboard`, which
aggregates per day, model and project. The skill `/token-usage` (pack `usage`,
`docs/profiles-design.md` § 8.5) is how a session reads it.

## Changes

Each is marked `orkeon-workshop:` in the code.

1. **`CLAUDE_CONFIG_DIR`** (`cc-usage.py`): transcripts are looked up under
   `$CLAUDE_CONFIG_DIR/projects` when the variable is set (the workshop's seeded `devcontainer.json` and the root one of
   the image's repository set it to `/home/node/.claude`; `dind/`, `host-socket/`, the image and a plain `docker run` do not), else under
   `~/.claude/projects`; the user's `CLAUDE.md`, counted in the instructions a session carries, is
   read from the same folder.
2. **`--session <id|path> --json`** (`cc-usage.py`): prints the session's payload, the one the
   dashboard reads (`session_payload`), as JSON. Its `sources` hold the `(startup)` line, whose
   `added` is the tokens of the first request: system prompt, `CLAUDE.md`, rules, tool and skill
   definitions. An id or path that matches no transcript with a usable turn prints nothing on
   stdout, a line on stderr, and exits 1. Without `--json`, `--session` prints the upstream text.
3. **`--agent <id|path>`** (`cc-usage.py`): one subagent's transcript,
   `<project>/<session>/subagents/agent-<id>.jsonl`, measured as its own chain — its turns carry
   `isSidechain: true`, which `--session` keeps apart as `(subagents)`; here they are the main chain of
   that context, so the same report comes out (text, or `--json`): cost, final context, what filled the
   context, the costliest calls. The id is the one the `Agent` tool returns at launch (a prefix is enough),
   or the path `SubagentStop` reports as `agent_transcript_path`. The agents a subagent spawned itself are
   not under its path: they sit beside it, in the session's `subagents/`, and `--session` lists them. Added
   for `/token-usage --agent` and the `dev-batch` agent of `/dev-batches` (plan § 11.1, 2026-10-12).
4. **Python 3.11** (`dashboard_model.py`): one f-string nested the quote of its enclosing string,
   which needs Python 3.12; the image runs Debian bookworm's Python 3.11, on which the module did
   not import, and `cc-usage.py` imports it. The expression is concatenated instead; the output is
   the same.

## In the image

The whole folder — the four Python files, `LICENSE`, this README and `tests/` — is copied to
`/usr/local/share/cc-usage/`, and a `cc-usage` command on the `PATH` runs
`python3 /usr/local/share/cc-usage/cc-usage.py "$@"` (Dockerfile, lot 11, D53).
Nothing to install with pip: the standard library only. Prices come from LiteLLM, cached 24 h in
`~/.cache/cc-usage/`; `--no-fetch` stays offline.

## Tests

```bash
cd .devcontainer/cc-usage && python3 -m unittest discover -s tests -t .
```

The harness evals run them too (`evals/cases/pack-usage.json`) when this folder is reachable, and so at
image build, where the evals run after the copy.

## Origin and licence

This folder is a vendored copy, with the changes listed above, of **claude-code-token-usage** by Pierre
Belin: <https://github.com/pierrebelin/claude-code-token-usage>, commit
`79e1a25337d08ece6f364d139c90aa11e292a00e` (2026-09-04). It is used under the MIT licence; the licence
text and its copyright notice are kept verbatim in `LICENSE`, and each change is marked
`orkeon-workshop:` in the code so that the upstream work and this project's are told apart.

| File here | Upstream file |
|---|---|
| `cc-usage.py` | `src/cc-usage.py` (changed, see *Changes*) |
| `session_grade.py`, `dashboard_template.py` | `src/` of the same names, unchanged |
| `dashboard_model.py` | `src/dashboard_model.py` (changed, see *Changes*) |
| `tests/test_cc_usage.py`, `test_session_grade.py`, `test_dashboard_model.py`, `fixtures/claude/` | `tests/` of the same names, unchanged |
| `tests/__init__.py`, `tests/collectors.py` | `tests/` of the same names: the modules sit one level up, not in `src/`; only `cc-usage.py` is loaded |
| `tests/test_workshop_changes.py` | new: tests of the changes above |

Line endings are LF (the repository's `.gitattributes`). Not copied: the Codex half
(`codex-usage.py`, `codex_grade.py`, `codex_log.py`), the dashboard front
(`usage-dashboard-template.html`, `usage-dashboard-base.css`) and the `--serve` gateway
(`usage-dashboard.py`), with their tests. `--dashboard` and `--serve` therefore stop on
`template not found`; `claude-usage-dashboard` serves the aggregated view in the image.
