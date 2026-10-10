# /quality-report — the report

Adapted from claude-code-toolkit `skills/quality-report` (MIT, see THIRD-PARTY.md): the .NET half, the
JSON schema and the tone rules, without Stryker, the JavaScript half, the git activity figures and the
page or endpoint inventories.

## 1. REPORT.json — schema `quality-report/1`

Missing data is `null`. Durations are whole seconds. Percentages have at most two decimals.

```json
{
  "schema": "quality-report/1",
  "metadata": { "date": "YYYY-MM-DD", "repository": "github.com/<owner>/<repo>", "branch": "<branch>", "commit": "<sha>" },
  "thresholds": { "coverage_lines_pct": null, "test_seconds": null },
  "steps": {
    "build":            { "command": "...", "status": "passed|failed|not_run", "exit_code": 0, "duration_seconds": 0, "log": "logs/build.log", "reason": null },
    "test":             { "...": "same shape" },
    "coverage":         { "...": "same shape" },
    "test_integration": null,
    "sonar":            { "command": null, "status": "not_run", "exit_code": null, "duration_seconds": null, "log": null, "reason": "SONAR_HOST_URL is not set" }
  },
  "tests": {
    "<suite, e.g. fast or Orkeon.Domain.Tests>": { "passed": 0, "failed": 0, "skipped": 0, "duration_seconds": 0 },
    "total": { "passed": 0, "failed": 0, "skipped": 0, "duration_seconds": 0 }
  },
  "coverage": {
    "lines":    { "pct": 0.0, "covered": 0, "total": 0 },
    "branches": { "pct": 0.0, "covered": 0, "total": 0 },
    "by_assembly": { "<assembly>": 0.0 }
  },
  "sonarqube": null
}
```

- `thresholds`: only values the repository or the user states; never invented. `null` = no check.
- `tests`: one suite per test project when the runner reports them, else one `fast` suite; the
  integration run adds its own suite. `total` is the sum (the script checks it).
- `coverage`: what the coverage command measured (for Orkeon: the fast suites, Cobertura, ReportGenerator
  `Summary.txt`); say in `REPORT.md` what it covers and what it does not.
- `sonarqube`, when Sonar ran: `{ "quality_gate": "OK|ERROR|WARN|NONE", "coverage_pct", "bugs",
  "vulnerabilities", "code_smells", "duplication_pct", "issues_open_total", "issues_by_severity": {
  "BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO" } }`. Every issue count comes from
  `api/issues/search` with `resolved=false`; the measures (`bugs`, `code_smells`) from
  `api/measures/component`, already open-only. Read them with `curl -su "$SONAR_TOKEN:" ...`, the
  token expanded by the shell, never written out.

## 2. REPORT.md

```markdown
# Quality report — <repository> — YYYY-MM-DD

Branch `<branch>` at `<commit 12>`. Commands from <repo.yaml path | the user>.

## 1. Summary
| Dimension | Status | Value |
|---|---|---|
| Build | passed/failed/not run | <duration>, warnings as errors |
| Tests (fast) | ... | <passed> passed, <failed> failed, <skipped> skipped, <duration> |
| Tests (integration) | ... | ... or not run: <reason> |
| Coverage | ... | <lines>% lines, <branches>% branches (<scope>) |
| Sonar | ... | gate <OK/ERROR>, <open issues> open issues, or not run: <reason> |

## 2. Build   ## 3. Tests   ## 4. Coverage   ## 5. Sonar
(one section each: the command, the figures, what they mean, the failures with their log lines)

## 6. Risks
| Zone | Risk | Figure | Priority |

## 7. Check
<the last line of quality-report-check.py, and every WARN line>
```

Tone: a snapshot, not a celebration. A figure gets its meaning ("62% branches: about one condition
in three never runs both ways"). What is weak gets more room than what holds. `passed` is a fact, not
an achievement. No trend, no delta, no comparison with an earlier report.

## 3. The subagent's return contract

Each step's subagent returns this block and nothing else:

```text
step: <name>
command: <as run>
exit_code: <n>
duration_seconds: <n>
log: <path>
figures: <key=value pairs: passed, failed, skipped per suite; lines covered/valid; gate; counts>
failures: <at most 15 lines, verbatim from the log>
```

The test runner's totals are read from its own summary lines, never counted by hand. The coverage
figures are read from the Cobertura root (`lines-covered`, `lines-valid`, `branches-covered`,
`branches-valid`) and per assembly from ReportGenerator's `Summary.txt`.
