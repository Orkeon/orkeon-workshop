# Third-party material

## claude-code-toolkit

Part of this harness is adapted from **claude-code-toolkit** by Pierre Belin, a `.claude` starter kit
for .NET / DDD repositories. The harness reuses its mechanics — the Bash dispatcher and its modules,
the read bounds, the delegation guard, the report-shape check, the session cleanup, the eval runner —
and none of its .NET-specific content. It is distributed under the MIT licence:

```
MIT License

Copyright (c) 2026 Pierre Belin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### What was adapted

Paths on the left are relative to this folder, paths on the right to the toolkit.

| Harness file | Toolkit file | What changed |
|---|---|---|
| `claude/hooks/bash-dispatch.sh` | `hooks/bash-dispatch.sh` | module list reduced to `guard-git`, `guard-cat-bounds`, `guard-diff-bounds`, `rewrite-rtk`; exits 0 on empty input or without `jq` |
| `claude/lib/guard-git.sh` | `lib/guard-git.sh` | off unless `HARNESS_GUARD_GIT=1` (the harness proposes commits, it does not forbid them by default); refusal reworded |
| `claude/lib/guard-cat-bounds.sh` | `lib/guard-cat-bounds.sh` | `HARNESS_*` thresholds; no reference to the toolkit's graph tool |
| `claude/lib/guard-diff-bounds.sh` | `lib/guard-diff-bounds.sh` | `HARNESS_DIFF_BOUNDS_LINES`; tolerates an empty command |
| `claude/lib/bounds-common.sh` | `lib/bounds-common.sh` | `HARNESS_*` thresholds; references and templates added to the files read whole; outlines for YAML, Python and JSONL; the third way out is a delegation instead of the `bulk-read` tool |
| `claude/lib/rewrite-rtk.sh` | `lib/rewrite-rtk.sh` | the `dotnet test\|restore\|format` prefixing removed; passes silently when `rtk` is absent; the fallback that emitted the normalised command with an `allow` when rtk answered nothing is gone — the answer of rtk is passed through untouched and nothing else is emitted; the path normalisation applies in command position only (the original also stripped a path used as an argument) and skips a command carrying a heredoc |
| `claude/lib/batching-nudge.sh` | `lib/batching-nudge.sh` | `HARNESS_*` variables; passes when `python3` is absent |
| `claude/lib/delegation-nudge.sh` | `lib/delegation-nudge.sh` | counts the source and definition files of a workshop instead of `.cs` only; message reworded |
| `claude/hooks/read-bounds.sh` | `hooks/read-bounds.sh` | exits 0 on empty input; refusal reworded |
| `claude/hooks/delegation-guard.sh` | `hooks/explore-guard.sh` | renamed; the appended contract is the `DONE` / `BLOCKED` report of the harness, in English; any explicit model passes (`HARNESS_EXPLORE_MODEL` pins one for `Explore`); looks for the agent charter in the workshop then beside the hooks; the line cap depends on the agent (a review is longer); the original prompt and the other fields of the call are kept |
| `claude/hooks/subagent-report-shape.sh` | `hooks/subagent-report-shape.sh` | labels `DONE` / `BLOCKED` and their fields instead of `RED` / `GREEN`; `BLOCKED` is checked too; `none` accepted on the `Command` line; also checks the review `team-reviewer` returns (verdict, gap table, fix table); reads the agent transcript when the payload carries no message; ASCII-escaped output |
| `claude/hooks/session-cleanup.sh` | `hooks/session-cleanup.sh` | the prefix list is the harness's own; the part restoring a third-party plugin flag removed |
| `claude/rules/markdown-output.md` | `rules/markdown-output.md` | families and language restated for a workshop; the frozen-literal table moved to `FROZEN-LITERALS.md` |
| `evals/run.sh` | `evals/run.sh` | resolves the repository, image and workshop layouts from its own location; hermetic environment; one fixtures folder per run and per case file; placeholders expanded in expectations; reads Stop-style `decision` / `reason`; fixture kinds reduced to `sparse`, `flat`, `md`, `text`, plus `exec` (an executable stub standing for a binary a hook calls); skipped cases counted apart, and failed under `HARNESS_EVALS_STRICT=1` |
| `evals/cases/guard-git.json`, `read-bounds.json`, `cat-bounds.json`, `diff-bounds.json`, `session-cleanup.json`, `subagent-report-shape.json` | the cases of the same names | payloads and expectations rewritten for the adapted hooks; the diff cases build their own repository |

Ideas taken without code: the chain of artefacts between skills, the orchestrator that delegates and
judges, the separation between test author and implementer, the read-only reviewer in a forked
context, the batch sheet with its anchors, assumptions and proof ticks, the frozen-literal table.

### What was not taken

The layer rules, skills and agents for .NET / DDD; the hooks and modules tied to tools the image
does not rely on (`graphify-*`, `affected-blast-radius`, `caveman-skill-ultra`,
`rewrite-piped-filter`, `guard-integration-filter`); `clear-nudge`, `context-log`,
`implement-tdd-guard`, `handler-claude-md-check`; the statusline; `tools/doctor` and
`tools/bulk-read`; the `scripts/` folder.

Known defects of the toolkit that were not carried over: a report contract and a worker prompt
asking for French while the kit is otherwise English; a PostToolUse hook printing to stdout, a
channel that never reaches the model; emitter/parser pairs left out of step by a partial
translation — which is why every frozen literal here has an eval on both sides.

## The skills

`claude/skills/orkeon-tour`, `orkeon-crew-yaml`, `orkeon-crew-typescript`, `orkeon-update` and
`clean-restore` were written for this image; they are not third-party material. So was the workshop's
VS Code configuration, `claude/devcontainer.workshop.json`: it does not derive from Anthropic's
reference devcontainer.
