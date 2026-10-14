#!/usr/bin/env python3
"""The test projects a batch reaches: the ones it changed and the ones that depend on a project it changed.

Run after the whole suite of a batch has run once (/dev-implement section 3), for every run that follows -
a red suite fixed, a correction of the audit - so that a correction round runs the test projects it can
break instead of the whole solution (2026-10-14, GAP-43-44: `dotnet test Orkeon.sln`, about 21 900 tests,
ran 28 times for 43 minutes, two to six times per batch).

The changed files are `git diff --name-only <base>` and the untracked files git does not ignore (the batch
is uncommitted until its verdict, or folded back by `git reset --soft` before the gate). Each is owned by the
nearest project file above it (`*.csproj`, `*.fsproj`, `*.vbproj`); the projects are listed by
`git ls-files`, never by walking the tree (a 9p mount pays every directory read), and their
`<ProjectReference Include="...">` give the graph. A test project is one whose path holds `test` (any
case). Printed, one per line: the folder of each test project changed or depending, at any distance, on a
changed project - what `commands.test_project` of the repository pack takes as `<test project>`.

`all` alone on the first line instead: a changed file no project owns (a `Directory.Build.props`, a
`.sln`, a shared `.props` or `.targets`, a `global.json`, a package version file) can change every project,
and only the whole suite proves it. Nothing printed: no project reached (documentation, the work folder).
The work folder and the files under `.claude/` are left out.

`<base>` by default: in a `dev-batch` worktree, the `base <sha>` of `.claude/local/batch-state.txt` at the
top of the work tree (the state line the charter rewrites, "Checkpoints"), so that the steps already
committed as checkpoints still count as changed; HEAD when the file is absent or names no base.

Usage: affected-tests.py [--base <rev>]   (default: the batch's base, else HEAD)
Exit 0; 2 outside a git work tree or on a usage error.
"""
import os
import re
import subprocess
import sys

PROJECT_SUFFIXES = (".csproj", ".fsproj", ".vbproj")
REFERENCE = re.compile(r'<ProjectReference\s+[^>]*Include\s*=\s*"([^"]+)"', re.IGNORECASE)
STATE_BASE = re.compile(r"(?:^|\s)base ([0-9a-fA-F]{4,40})\b")
NEUTRAL = re.compile(r'(\.md|\.txt|\.png|\.jpg|\.svg|LICENSE[^/]*|\.gitignore|\.gitattributes|\.editorconfig)$', re.IGNORECASE)


def git(*args):
    out = subprocess.run(["git", *args], capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or "git %s failed" % " ".join(args))
    return [line for line in out.stdout.splitlines() if line]


def norm(path):
    return os.path.normpath(path).replace(os.sep, "/")


def state_base():
    """The `base <sha>` of the batch's state line, when it names one git knows; else None."""
    try:
        with open(os.path.join(".claude", "local", "batch-state.txt"), encoding="utf-8") as handle:
            found = STATE_BASE.findall(handle.read())
    except OSError:
        return None
    if not found:
        return None
    try:
        git("rev-parse", "--verify", "--quiet", found[-1] + "^{commit}")
    except RuntimeError:
        return None
    return found[-1]


def main(argv):
    base = None
    if argv[:1] == ["--base"] and len(argv) == 2:
        base = argv[1]
    elif argv:
        print("usage: affected-tests.py [--base <rev>]", file=sys.stderr)
        return 2
    try:
        top = git("rev-parse", "--show-toplevel")[0]
        os.chdir(top)
        base = base or state_base() or "HEAD"
        changed = set(git("diff", "--name-only", base)) | set(git("ls-files", "--others", "--exclude-standard"))
        projects = [norm(p) for p in git("ls-files", "--cached", "--others", "--exclude-standard", "*.csproj", "*.fsproj", "*.vbproj")]
    except RuntimeError as error:
        print("affected-tests: %s" % error, file=sys.stderr)
        return 2
    work = os.environ.get("HARNESS_WORK_DIR", "").strip("/")
    folders = {os.path.dirname(p): p for p in projects}

    def owner(path):
        folder = os.path.dirname(path)
        while True:
            if folder in folders:
                return folders[folder]
            if not folder:
                return None
            folder = os.path.dirname(folder)

    reached = set()
    for path in sorted(changed):
        path = norm(path)
        if path.startswith((".claude/", "todo/")) or (work and path.startswith(work + "/")):
            continue
        project = owner(path)
        if project:
            reached.add(project)
        elif not NEUTRAL.search(path):
            print("all")
            return 0
    # Who references whom, from the project files themselves.
    dependents = {p: set() for p in projects}
    for project in projects:
        try:
            with open(project, encoding="utf-8-sig") as handle:
                text = handle.read()
        except OSError:
            continue
        for include in REFERENCE.findall(text):
            target = norm(os.path.join(os.path.dirname(project), include.replace("\\", "/")))
            if target in dependents:
                dependents[target].add(project)
    queue = list(reached)
    while queue:
        for dependent in dependents.get(queue.pop(), ()):
            if dependent not in reached:
                reached.add(dependent)
                queue.append(dependent)
    for project in sorted(reached):
        if "test" in project.lower():
            print(os.path.dirname(project) or ".")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
