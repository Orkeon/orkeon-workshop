#!/usr/bin/env python3
"""Arithmetic and consistency checks of a /quality-report JSON (schema quality-report/1).

Adapted from claude-code-toolkit/scripts/quality-report-check.py (MIT, see THIRD-PARTY.md):
the JavaScript half, Stryker, pages and endpoints are gone; the steps the report ran are
checked against their exit codes; thresholds come from the report, not from this file; and
the value of SONAR_TOKEN, when set, must appear in neither the JSON nor the REPORT.md
beside it. The judgement checks (wording, status of each section) stay in the skill.

Usage:
    python3 quality-report-check.py <todo/quality-YYYY-MM-DD/REPORT.json>

Exit 0 when every check passes (warnings allowed), 1 when one fails, 2 when the file
cannot be read or is not shaped like a report (one line, no traceback).
"""

import json
import os
import sys

SCHEMA = "quality-report/1"
STEPS = ("build", "test", "coverage", "sonar")
STATUSES = ("passed", "failed", "not_run")
GATES = ("OK", "ERROR", "WARN", "NONE")

problems = []
warnings = []


class Unreadable(Exception):
    """The report is not shaped like one: no check can be made."""


def fail(message):
    problems.append(message)


def warn(message):
    warnings.append(message)


def number(value):
    if isinstance(value, bool):
        return None
    return value if isinstance(value, (int, float)) else None


def check_steps(report):
    steps = report.get("steps")
    if not isinstance(steps, dict):
        fail("steps missing")
        return {}
    for name in STEPS:
        if name not in steps:
            fail(f"steps.{name} missing (a step that did not run is status not_run with a reason)")
    for name, step in steps.items():
        if step is None:
            continue
        if not isinstance(step, dict):
            fail(f"steps.{name} must be an object")
            continue
        status, code = step.get("status"), step.get("exit_code")
        if status not in STATUSES:
            fail(f"steps.{name}.status = {status!r}, expected one of {', '.join(STATUSES)}")
            continue
        if status == "not_run":
            if not str(step.get("reason") or "").strip():
                fail(f"steps.{name}: not_run without a reason")
            if code is not None:
                fail(f"steps.{name}: not_run but exit_code = {code}")
            continue
        if not str(step.get("command") or "").strip():
            fail(f"steps.{name}: ran without its command recorded")
        if not isinstance(code, int) or isinstance(code, bool):
            fail(f"steps.{name}.exit_code must be an integer when the step ran")
        elif status == "passed" and code != 0:
            fail(f"steps.{name}: passed with exit_code {code}")
        elif status == "failed" and code == 0:
            fail(f"steps.{name}: failed with exit_code 0")
        duration = step.get("duration_seconds")
        if not isinstance(duration, int) or isinstance(duration, bool) or duration < 0:
            fail(f"steps.{name}.duration_seconds must be a whole number of seconds")
    return steps


def suites(tests):
    return [n for n, v in tests.items() if n != "total" and isinstance(v, dict)]


def check_tests(report, steps):
    tests = report.get("tests")
    test_step = steps.get("test") or {}
    if not isinstance(tests, dict):
        if test_step.get("status") in ("passed", "failed"):
            fail("tests missing although steps.test ran")
        return
    total = tests.get("total") or {}
    if not isinstance(total, dict):
        raise Unreadable("tests.total is not an object")
    names = suites(tests)
    for field in ("passed", "failed", "skipped"):
        expected = sum(number(tests[s].get(field)) or 0 for s in names)
        got = number(total.get(field))
        if got is None:
            fail(f"tests.total.{field} missing")
        elif got != expected:
            fail(f"tests.total.{field} = {got}, sum per suite = {expected}")
    durations = [number(tests[s].get("duration_seconds")) for s in names]
    known = [d for d in durations if d is not None]
    got = number(total.get("duration_seconds"))
    if known and got is not None and abs(got - sum(known)) > 1:
        fail(f"tests.total.duration_seconds = {got}, sum per suite = {sum(known)}")
    failed = number(total.get("failed")) or 0
    if failed > 0 and test_step.get("status") == "passed":
        fail(f"steps.test is passed but tests.total.failed = {failed}")
    if failed == 0 and test_step.get("status") == "failed":
        warn("steps.test failed with no failed test: say what failed instead (build, crash, timeout)")
    limit = number((report.get("thresholds") or {}).get("test_seconds"))
    if limit is not None and got is not None and got > limit:
        warn(f"tests took {got}s, above the threshold of {limit}s")


def check_coverage(report, steps):
    coverage = report.get("coverage")
    ran = (steps.get("coverage") or {}).get("status") == "passed"
    if not isinstance(coverage, dict):
        if ran:
            fail("coverage missing although steps.coverage passed")
        return
    for name, entry in coverage.items():
        if name == "by_assembly":
            continue
        if not isinstance(entry, dict):
            continue
        pct, covered, total = (number(entry.get(k)) for k in ("pct", "covered", "total"))
        if pct is not None and not 0 <= pct <= 100:
            fail(f"coverage.{name}.pct = {pct} outside [0, 100]")
        if covered is not None and total is not None:
            if covered > total:
                fail(f"coverage.{name}: {covered} covered > {total} total")
            elif total and pct is not None and abs(pct - covered / total * 100) > 0.1:
                fail(f"coverage.{name}.pct = {pct}, recomputed {covered}/{total} = {covered / total * 100:.2f}")
    for assembly, value in (coverage.get("by_assembly") or {}).items():
        if number(value) is None or not 0 <= value <= 100:
            fail(f"coverage.by_assembly.{assembly} must be a percentage, not {value!r}")
    limit = number((report.get("thresholds") or {}).get("coverage_lines_pct"))
    lines = number((coverage.get("lines") or {}).get("pct"))
    if limit is not None and lines is not None and lines < limit:
        warn(f"line coverage {lines}% is below the threshold of {limit}%")


def check_sonar(report, steps):
    sonar = report.get("sonarqube")
    status = (steps.get("sonar") or {}).get("status")
    if status == "not_run":
        if sonar is not None:
            fail("sonarqube holds figures although steps.sonar is not_run")
        return
    if sonar is None:
        if status in ("passed", "failed"):
            warn("steps.sonar ran but sonarqube is null: say where its figures are")
        return
    gate = sonar.get("quality_gate")
    if gate is not None and gate not in GATES:
        fail(f"sonarqube.quality_gate = {gate!r}, expected one of {', '.join(GATES)}")
    if gate == "ERROR" and status == "passed":
        warn("the Sonar quality gate is ERROR while steps.sonar passed")
    severities = sonar.get("issues_by_severity")
    open_total = number(sonar.get("issues_open_total"))
    if isinstance(severities, dict) and open_total is not None:
        expected = sum(number(v) or 0 for v in severities.values())
        if expected != open_total:
            fail(f"sonarqube.issues_open_total = {open_total}, sum per severity = {expected} (resolved=false on both?)")


def check_secret(path):
    token = os.environ.get("SONAR_TOKEN", "")
    if len(token) < 8:
        return
    for candidate in (path, os.path.join(os.path.dirname(path), "REPORT.md")):
        if os.path.isfile(candidate):
            with open(candidate, encoding="utf-8", errors="replace") as handle:
                if token in handle.read():
                    fail(f"{candidate} holds the value of SONAR_TOKEN: remove it")


def main():
    if len(sys.argv) != 2:
        print("usage: quality-report-check.py <REPORT.json>")
        return 2
    path = sys.argv[1]
    try:
        with open(path, encoding="utf-8") as handle:
            report = json.load(handle)
    except (OSError, ValueError) as error:
        print(f"quality-report-check: cannot read {path}: {error}")
        return 2
    try:
        if not isinstance(report, dict):
            raise Unreadable("the top level is not a JSON object")
        if report.get("schema") != SCHEMA:
            fail(f"schema = {report.get('schema')!r}, expected {SCHEMA!r}")
        steps = check_steps(report)
        check_tests(report, steps)
        check_coverage(report, steps)
        check_sonar(report, steps)
        check_secret(path)
    except (Unreadable, AttributeError, TypeError) as error:
        # AttributeError, TypeError: a section of another shape than the schema's (a list, a string
        # where an object is read), which the checks above do not name one by one.
        print(f"quality-report-check: cannot read {path}: {error}")
        return 2

    print(f"quality-report-check: {path}")
    for message in warnings:
        print(f"  WARN {message}")
    for message in problems:
        print(f"  FAIL {message}")
    if problems:
        print(f"quality-report-check: {len(problems)} failed, {len(warnings)} warning(s)")
        return 1
    print(f"quality-report-check: ok ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
