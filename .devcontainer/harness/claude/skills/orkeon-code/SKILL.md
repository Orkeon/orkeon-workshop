---
name: orkeon-code
description: "Hands a piece of development work to Orkeon Code, the coding agent built on Orkeon and installed in the image: one of its crews run in one shot (a coding request, a code review, an analysis of the codebase, a step of its spec-plan-batch-audit chain), or the way into its REPL for the steps that ask questions. Use it when the user asks for Orkeon Code, for /dev-spec, /dev-plan, /dev-batches, /dev-verify, /dev-status or /dev-learn, or for a second model's work on the code."
argument-hint: "<crew> [request]"
---

# /orkeon-code — a piece of work for Orkeon Code

Orkeon Code is its own agent, with its own model: a set of commands (`/dev-spec`, `/dev-plan`,
`/dev-batches`, `/review`, `/analyze`, `/commit`…) whose work is done by crews that Orkeon runs. The
harness no longer carries a spec, plan, batch and audit chain of its own (D114): that chain is Orkeon
Code's. This skill starts one of its crews for the user, or tells them how to open it themselves.

Arguments: $ARGUMENTS

## 1. What it runs on

Orkeon Code needs a model **of its own**: the local one (Ollama) or a provider whose key is set
(`workshop setup keys`, typed by the user in a terminal). It cannot use a Claude plan — the sign-in
of a plan is reserved to Anthropic's own applications. Before the first launch of a session:

```bash
orkeon-bench setup status          # the mode, the model of the teams, local or remote (paid)
orkeon-code-run --list             # the crews, each with the inputs it reads
```

- No model (`no Llm section`, or a key variable `NOT SET`): stop and say which of the two the user
  can do — a local model (`orkeon init --provider ollama --model <model>`) or `workshop setup keys`.
- A remote model is a paid run: say so and ask before the first launch (AskUserQuestion, once per
  session), with the model and what is about to run.

## 2. Two ways in

**The REPL, for the user.** `/dev-spec` settles its decisions one question at a time, `/dev-batches`
runs a whole plan and asks at each gate: both need someone at the keyboard, and a launch from here
has none — a question gets no answer and the crew reads it as "nobody answered". For those, tell the
user to open it in a terminal of the container, at the top of the project (`workshop code` is
`orkeon-code` with the keys of `workshop setup keys`, which a terminal does not have by itself):

```bash
workshop code            # then /dev-spec <code> <request>, /dev-plan <code>, /dev-batches <code>, /dev-status
```

**One crew, in one shot, from here.** For what needs no answer on the way:

```bash
orkeon-code-run <crew> --inputs '<json>'      # the workspace is the folder of this session
```

| Asked for | Crew | Inputs |
|---|---|---|
| a coding request ("add a --json flag, with a test") | `main-loop` | `{"prompt": "…", "permissionMode": "plan"}` |
| a review of the diff, of files or of a commit | `code-review` | `{}`, `{"files": ["…"]}` or `{"commit": "<sha>"}` |
| a map of the codebase and its business objects | `analyze` | `{}` |
| the plan of a spec already written | `dev-plan` | `{"source": "<code>"}` |
| the audit of a batch already implemented | `dev-verify` | `{"batch": "F<n>", "plan": "<code>"}` |
| the proposals learnt from past audits | `dev-learn` | `{"list": true}` |

The header of `<crew>/crew.ork.ts` is the contract of each: `orkeon-code-run --list` prints its first
line, and the file is under `/usr/local/lib/orkeon-code/current/src/crews/`.

## 3. The permission mode is yours to choose, and to say

The mode travels in the inputs (`permissionMode`); without one the crew runs in `default`.

| Mode | What the crew may do in a launch from here |
|---|---|
| `plan`, `dontAsk` | read only |
| `default` | read only, a `github` read action and a plain `http_api` GET included |
| `acceptEdits` | read and edit files (a `github` read and an `http_api` GET too); no shell |
| `bypassPermissions` | everything, the shell included |

The mode bounds the tool calls of the crew's agents; what the crew's own code does (its state under
`.orkeon/`, its own `tools.*` calls) does not go through it (Orkeon Code 1.0.0-rc.3, `docs/headless.md`).

Start with `plan` for a question or a review. An edit needs `acceptEdits`, and a request that must
run the tests needs `bypassPermissions`: say which mode you chose and why before launching, and ask
(AskUserQuestion) before the first `bypassPermissions` of a session. A call the mode refuses is not
an error — the run still exits `0`.

## 4. Launch, then read

1. The workspace must be a folder Orkeon Code trusts. Exit `3` means it is not: the user trusts it
   themselves (`orkeon-code trust add <folder>`, in a terminal). Do not pass `--trust` for them.
2. Run it in the background when it may take more than two minutes (a `main-loop` turn is bounded
   at 30 minutes and 200 tool calls), stdout to a file: the result is one JSON object,
   `result.finalOutput` its answer.
3. Exit `0`: the script completed — read the JSON to know what was done, then look at what changed
   (`git status --short`, `git diff --stat`): the agent is an operator with the rights of its mode,
   not a reviewer of its own work. `1`: a script error, `2`: a runtime error (the model unreachable,
   a rate limit: its last lines on stderr say which), `75`: it stopped on a question, `130`: cancelled.
4. Report in a few lines: the crew, the mode, the model, what it answered, the files it changed, and
   what you checked yourself. What Orkeon Code wrote under `.orkeon/` (its plans, its state) is its
   own: leave it.

## 5. What this skill does not do

- It does not replay Orkeon Code's chain by hand: a spec, a plan or a batch is written by its crews,
  in its formats, under `.orkeon/dev/<code>/`.
- It does not run a team of the workshop: that is `/team-run`.
- It does not set a key: `workshop setup keys` asks for it on the terminal, where the conversation
  does not see it.
