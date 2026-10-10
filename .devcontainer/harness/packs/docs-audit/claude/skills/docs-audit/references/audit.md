# /docs-audit — method and report

Stance adapted from claude-code-toolkit `agents/adversarial-reviewer.md` (MIT, see THIRD-PARTY.md):
find what the page gets wrong, never praise what it gets right; every finding carries its evidence.

## 1. Claims worth checking

A claim is checked when the code can decide it. In order of value:

| Kind | Example | Where the code decides |
|---|---|---|
| command, flag, option | "`--source <ref>` takes a branch, tag or commit" | the argument parser, its help text |
| default value, limit | "120 seconds by default" | the constant, the options class, the settings file |
| setting key, variable | "`Llm:StreamIdleSeconds`", "`SONAR_HOST_URL`" | where it is read |
| path, file name | "writes `todo/quality-<date>/REPORT.md`" | the code that writes it |
| type, member, endpoint | "`IFileSystemService`" | its declaration |
| count | "nine packages", "48 src projects" | the list it counts (count it) |
| behaviour | "refuses a tag that does not match" | the branch that refuses, and a test that proves it |

Not checked: wording, opinions, plans, what a third party does. A claim the repository's own doc
checks already enforce (a count checked by a script) is cited as `holds (checked by <script>)` when
that check passed.

Evidence is `path:line` at the commit audited (`git rev-parse --short HEAD`). A search that finds
nothing is not proof of `stale`: it is `unverifiable` unless the code that should hold it is found and
says otherwise.

## 2. REPORT.md

```markdown
# Docs audit — <repository> — YYYY-MM-DD

Commit `<sha 12>`, reference `<tag or commit>`, <n> pages audited (<m> not audited, listed at the end).

## 1. Doc checks
| Command | Exit | Failures |

## 2. Links and anchors
| Page:line | Link | Why |

## 3. Claims
| Page | Claim | Code location | Verdict |
|---|---|---|---|
| docs/guides/x.md:42 | "--source takes a branch, tag or commit" | `scripts/update.sh:93` | holds |

## 4. Stale claims
<one paragraph each: the page says, the code says, both quoted, the fix the owner may make>

## 5. Not audited
<pages beyond the cap, claims beyond the cap>
```

Nothing is fixed: the report is the deliverable. A mirrored page (a translation) is audited on its
source page; its own claims are checked only when they differ.
