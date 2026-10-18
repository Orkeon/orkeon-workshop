# Common rules — the two coding agents

Read by `dev-test-author` and `dev-implementer`. The repository's own conventions (naming, folders,
doubles, analyzers, comments) arrive with its layer rules (`.claude/rules/*.md`, loaded when a file of
that layer is read): they win over anything generic here.

## 1. Test first — the iron law

```
NO PRODUCTION CODE WITHOUT A RED TEST FIRST
```

Code written before its test is deleted and written again after it. Not kept "for reference", not
adapted while writing the test.

Per behaviour (a use case, a service operation, an adapter operation — a domain method through what
calls it, unless the repository's rules test the domain directly):

1. **RED** — a test of an observable behaviour, tied to an id, that fails **on its assertion**. A
   compile failure is not a red test. A sheet step named after a mechanism ("scan", "map") is tested
   through the behaviour it serves. A behaviour that reads a grammar (an option line, an address, a
   reference syntax) is red on each class of its input, as theory rows: every spelling (long and short
   name, each value type), each shape (with and without a path, a prefix, an operator), every form the
   code it replaces accepted, and the near forms it must refuse or leave unnamed. A refusal that
   suggests a fix asserts the suggestion whole, and one row feeds it back and sees it accepted.
2. **GREEN** — the least code that passes this test alone. No branch, option or abstraction it does not
   demand. Build, narrowed test, green.
3. **REFACTOR** — duplication and naming first, behaviour unchanged; then delete what an invariant of
   the sheet makes impossible (a defensive branch, an empty branch, a grouping, a `Trim()` on a value its
   pattern already bounds), a wrapper with one caller or none left, a parameter never read, an
   abstraction with one implementer, a value computed twice on one path (the same parse, scan or
   filter: once, its error kept with its result). After a correction too: a fix that narrows a value
   orphans the guards on it. Re-run, green.
4. **COST** — count the IO calls of the behaviour through its ports (reads, writes, external calls).
   Bounded and independent of the input size: N inputs are not N calls. An IO call inside a loop over
   the input goes back to design, not to a cosmetic refactor.

A behaviour already covered by an existing test: no new test; implement until that one is green.

## 2. Scope

- Every changed line ties to the behaviour at hand. No tidying, renaming or reformatting of working
  code next door; the file's local style wins.
- Delete the orphans **your** change created (`using`, variable, method, type). Pre-existing dead code,
  an adjacent bug, a stale comment elsewhere: **reported** (`path:line`), not fixed.
- Reuse before creating: an existing element that covers 80 % of the need is extended; a second type
  with the shape of an existing one is a rename, not a copy. A reading, a refusal message or a format
  that has an owner (a value object, a messages class, a `Quote`/`Format` helper) is called at every
  site, never re-written there: no check of your own before it, no message of your own after it. The
  implementer, before DONE, greps the hand-written form it replaces (its literal, pattern or
  interpolation) in the projects touched: a site left is fixed when the contract names its file,
  reported otherwise.
- A hand-written double mirrors its production adapter: it throws only what the adapter throws; an
  adapter change updates its double in the same batch.

### Stop and go back to RED when you think

"Too simple to test" · "I'll test afterwards" · "already tested by hand" · "this case is different" ·
"while I'm here" · "configurable, just in case".

## 3. Git

Never commit, branch, push, stash or rewrite history. The batch is committed by the context that
orchestrates it (D71): `/dev-implement` run inline, which pushes it, or the `dev-batch` agent in its
worktree, which never pushes (D79) — never by you.

## 4. When a rule gives way — only these

1. **Signature stub to make RED observable**: the test cannot compile without a type, member or return
   type that does not exist. Write the strict minimum — the declaration, a body that throws
   (`throw new NotImplementedException()` in C#, `throw new Error("not implemented")` in TypeScript) —
   and list it. No logic, no branch. The test must then fail on its assertion.
2. **The batch asks for a deletion**: when a step *is* the deletion of pre-existing code, it is in scope.
3. **A user instruction, restated after you named the rule**: do it, record it as `Hn`.
4. **Data loss or a security hole on the path the batch touches**: stop and report at once — no silent
   fix, no line buried in a summary.
5. **Declarative artefacts written by the orchestrator** (a DTO, a registration, a configuration
   entry): no red test before them; the test of the behaviour they serve covers them. One that carries
   a branch, a validation or a mapping decision is not declarative and goes through RED.

Anything else is an ambiguity: report it, never decide it in silence.

## 5. Build and test output

A build or a test run never prints into your context: `<cmd> > "${TMPDIR:-/tmp}/dev-F<n>-<role>-<Class>-<suite>.txt" 2>&1; echo "exit=$?"; tail -15 "${TMPDIR:-/tmp}/dev-F<n>-<role>-<Class>-<suite>.txt"`
(`F<n>` the contract's `Batch:` line, `<Class>` the class of its `Test command`: the batches of a run and
the REDs of one message share `/tmp`) — the exit code and the last fifteen lines are what you read; a
failure you must understand is grepped for in that file, then read as a range. Your report carries the
exit code, never the log (`/dev-implement` § 3 applies the same rule to the orchestrator).

## 6. One restore per batch, and the test project only

Never `dotnet restore`, never a `dotnet build` or `dotnet test` without `--no-restore` or `--no-build`:
the orchestrator restored once, at the batch's entry, and every command the contract gives you carries
the flag (`Build command`, `Test command`). A restore error — `NETSDK1004`, a `project.assets.json`
missing or stale — is `## BLOCKED` with the line, never a restore of your own: a package or a project
file changed, and the orchestrator alone restores again, once, saying it. The `guard-restore` module
refuses you the rest. You build the test project the contract names, never the solution: the solution
is built once, by the orchestrator (`/dev-implement` § 3). A build that fails outside that project is
`## BLOCKED` with the file — a contract hole, not yours to absorb.
