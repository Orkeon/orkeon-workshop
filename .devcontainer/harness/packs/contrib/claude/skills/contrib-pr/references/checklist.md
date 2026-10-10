# /contrib-pr — how a checklist line is checked

A line of `contrib.checklist` is matched to the first row below whose subject it names. A line no row
covers is `to confirm`, with the question the user must answer.

| Subject | Check | `met` when |
|---|---|---|
| branch | `git branch --show-current` against `contrib.branch` | not the default branch, prefix allowed, slug lowercase and hyphenated |
| build, warnings, public API | the build of § 2 | exit 0; an RS0016/RS0017 error names the `PublicAPI.Unshipped.txt` to complete |
| examples, changed public signature | `git diff <base>... -- '**/PublicAPI.*.txt'` | no change, or the examples solution the line names builds (run it then, same subagent rule) |
| tests | the tests of § 2; `git diff --stat <base>... -- tests/` | exit 0, and a behaviour change comes with a test change |
| docs, mirror | each `commands.docs_checks` entry whose subject is the mirror or parity | exit 0; `not applicable` when no doc and no behaviour changed |
| changelog | `git diff <base>... -- CHANGELOG.md` | a line added under `## [Unreleased]`; `not applicable` for a change no user sees |
| executable bit | for each added file starting with `#!`: `git ls-files -s <file>` (staged) or `test -x` (untracked) | mode `100755`; else hand over `git add --chmod=+x <file>` |
| credential, key | `gitleaks detect --no-banner --log-opts "<base>..HEAD"` when `gitleaks` is installed; otherwise a read of the diff for key-shaped values | nothing found; without gitleaks, `to confirm` |
| comments, accents | the script the line names (for Orkeon `python3 scripts/check-comment-accents.py`) | exit 0 |
| commit message | the message proposed in § 5 | follows `contrib.commit` |
| `System.IO`, analyzers | covered by the build | build exit 0 |
| CLA, first contribution | — | `to confirm` |

Never record `met` on a check that was not run; never run a check that writes a tracked file.
