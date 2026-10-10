# /contrib-validate — details

## 1. Why a fork's pull request is refused

`orkeon-update --source <ref>` clones `https://github.com/Orkeon/orkeon.git` and fetches `<ref>` from
it (`.devcontainer/orkeon-update.sh`, `fetch_source`): a branch, a tag or a commit of that repository.
A pull request from a fork has its head branch in the fork, which that fetch never sees. The record
says so in one line, with what would make it possible: the author pushes the branch to
`Orkeon/orkeon`, or the fix is merged and validated on `main` (`/contrib-validate main <slug>`).

## 2. Closed and merged pull requests

| State | What to do |
|---|---|
| `OPEN` | build `headRefName` |
| `MERGED`, branch still on the repository (`git ls-remote https://github.com/<owner>/<repo>.git refs/heads/<headRefName>` answers) | build it, and say the fix is merged |
| `MERGED`, branch deleted | refuse; `main` holds the merge: propose `/contrib-validate main <slug>`, which builds `main` and records `validated on main` |
| `CLOSED` | refuse: the change was not taken |

## 3. PR-<n>-COMMENT.md

```markdown
Validated against the reproduction of <issue url, when RECORD.md has a `filed` entry>.

- Built: `<headRefName>` at `<commit>` (`orkeon --version`: `<version>`), with `orkeon-update --source`
- Steps: <the steps of the record, as commands>
- Result: **fixed** | **not fixed** | **inconclusive** — <one sentence: what was observed>
- Environment: <the environment line of the record>
```

No log is pasted whole: at most the lines that show the verdict, keys redacted.
