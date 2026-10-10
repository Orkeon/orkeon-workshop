# todo/release-<version>/ — the release record

One folder per version, in the checkout, outside git (`todo/` is excluded by the harness in a source
space). Written by `/release-prepare`, `/release-evidence` and `/release-verify`; read by people.

| File | Written by | Holds |
|---|---|---|
| `RECORD.md` | the three skills | dated entries, appended, never rewritten |
| `NOTES.md` | `/release-prepare` | the draft release notes |
| `evidence/ci-<job>.txt` | `/release-evidence` | the conclusion, steps and last log lines of a Windows job |
| `evidence/pasted-<n>.txt` | `/release-evidence`, `/release-verify` | what the user pasted, verbatim, keys redacted |
| `assets/` | `/release-verify` | the checksum files and the asset names of the published release |

## RECORD.md

```markdown
# Release <version>

Repository: github.com/<owner>/<repo> · tag `<tag>`

## YYYY-MM-DD HH:MM — prepare

Commit `<sha>`.

| Check | Verdict | Evidence |
|---|---|---|
| version file | ready | `src/Directory.Build.props`: 1.0.0-rc.5 |
| ... | | |

Notes: todo/release-<version>/NOTES.md

## YYYY-MM-DD HH:MM — evidence
...
## YYYY-MM-DD HH:MM — tag handed over
## YYYY-MM-DD HH:MM — verify
```

A verdict is one of `ready`, `not ready`, `not checked`, `not applicable (no <key>)` (prepare); `success`, `failure`, `missing`,
`pasted` (evidence); `published`, `missing`, `wrong`, `not checked` (verify). A verdict without evidence
is not written.
