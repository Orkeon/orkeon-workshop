# contrib/<slug>/ — the record and the issue

## RECORD.md

One file per reproduction, entries appended, newest last, never rewritten.

```markdown
# <slug>

Repository: github.com/<owner>/<repo>

## YYYY-MM-DD HH:MM — reproduced

- Version: <orkeon --version>
- Channel: <orkeon-update --check: channel, and the commit for a source build>
- Environment: <uname -sr> / .NET SDK <dotnet --version> / <provider> <model>
- Steps:
  1. `<command, run from the workshop root>`
- Expected: <quoted from the user or from the page that promises it, with its path>
- Actual: <the exact error line>
- Evidence: contrib/<slug>/evidence/<YYYYMMDD-HHMM>-run.log
```

Other entry kinds, same heading shape: `not reproduced`, `filed` (the issue URL), `validated on PR #<n>`
or `validated on main` (written by `/contrib-validate`: commit built, verdict `fixed` / `not fixed` /
`inconclusive`, evidence),
`refused PR #<n>` (the reason).

## ISSUE.md

```markdown
Title: <one line: what fails, where>

### <label of field 1>

<value>

### <label of field 2>
...
```

Only input fields (`input`, `textarea`, `dropdown`, `checkboxes`), never the `markdown` blocks.

## Offline shapes — Orkeon's three templates

The shapes a workshop uses (it holds no repository pack), read on Orkeon main at ce9ec1f (2026-10-09)
in `.github/ISSUE_TEMPLATE/`. Copy an option from the live template when it is reachable.

### `bug` — `bug_report.yml`, all required

| id | Label | Kind |
|---|---|---|
| `version` | Orkeon version | input: `orkeon --version`, the package version, or the commit SHA of a source build |
| `channel` | Install channel | dropdown: `NuGet packages (embedded in my app)`, `orkeon CLI — Windows zip / MSI`, `orkeon CLI — Debian package`, `orkeon CLI — macOS tarball`, `dotnet tool install`, `Container image (orkeon-runners)`, `Source build` |
| `environment` | Environment | input: OS + version, .NET SDK/runtime, LLM provider |
| `repro` | Steps to reproduce | textarea: exact commands, crew YAML or `.ork.ts` snippet, trimmed to the minimum that fails |
| `expected` | Expected behavior | textarea |
| `actual` | Actual behavior | textarea: the exact error line, a log excerpt (`--llm-log`), keys redacted |

A workshop's Orkeon comes from `Source build` (the image builds it) unless `orkeon-update --check`
names another channel.

### `docs` — `documentation.yml`, all required, the title starting `[docs]: `

| id | Label | Kind |
|---|---|---|
| `page` | Page | input: path or URL of the affected page |
| `kind` | Kind of problem | dropdown: `Factually wrong (does not match the code)`, `Outdated (was true, is not anymore)`, `Missing (undocumented feature or behavior)`, `Broken link or navigation`, `EN/FR mirrors disagree`, `Typo / wording` |
| `what` | What is wrong, and what would be right | textarea: the current text quoted, and the code that contradicts it (path or type name) |

### `feature` — `feature_request.yml`

| id | Label | Kind |
|---|---|---|
| `problem` | The problem | textarea, required: what Orkeon makes hard or impossible today |
| `proposal` | Proposed solution | textarea, required: YAML or API sketches welcome |
| `alternatives` | Alternatives considered | textarea, optional: workarounds tried, why the extension points are not enough |
| `area` | Area | dropdown, required: `Orchestration (processes, FSM, graph, autonomous)`, `Tools`, `LLM providers`, `Memory / RAG`, `Scripting DSL / CLI`, `Packaging / install channels`, `Documentation`, `Other` |
