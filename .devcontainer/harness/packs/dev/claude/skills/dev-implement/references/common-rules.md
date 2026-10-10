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
   through the behaviour it serves.
2. **GREEN** — the least code that passes this test alone. No branch, option or abstraction it does not
   demand. Build, narrowed test, green.
3. **REFACTOR** — duplication and naming first, behaviour unchanged; then delete what an invariant of
   the sheet makes impossible (a defensive branch, a grouping), a wrapper with a single caller, a
   parameter never read, an abstraction with one implementer. Re-run, green.
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
  with the shape of an existing one is a rename, not a copy.
- A hand-written double mirrors its production adapter: it throws only what the adapter throws; an
  adapter change updates its double in the same batch.

### Stop and go back to RED when you think

"Too simple to test" · "I'll test afterwards" · "already tested by hand" · "this case is different" ·
"while I'm here" · "configurable, just in case".

## 3. Git

Never commit, branch, push, stash or rewrite history. The user commits.

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
