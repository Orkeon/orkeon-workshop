# Orkeon Code and Studio's terminal applications

*English · [Français](../fr/guides/orkeon-code.md)*

Besides Orkeon itself, the image carries two released products of the Orkeon family, each at a pinned
version (D110, D111):

| Product | Version in the image | Commands | What it is |
|---|---|---|---|
| Orkeon | 1.2.0, the CLI published on nuget.org | `orkeon` | the runtime of your teams |
| Orkeon Code | 1.0.0-rc.2, a release candidate | `orkeon-code`, `orkeon-code-run` | a coding agent built on Orkeon |
| Orkeon Studio | 1.2.0, its two terminal applications | `orkeon-studio-config`, `orkeon-studio-run` | a settings editor and a team launcher |

Studio's desktop application stays Windows-only: it is not in the image, and it still opens the teams of
your folder from Windows ([The workshop](../concepts/workshop.md)).

## Orkeon Code

Orkeon Code is its own agent, with its own commands (`/assistant`, `/review`, `/analyze`, `/commit`,
`/dev-spec`, `/dev-plan`, `/dev-batches`…), each run by a crew of Orkeon. Its documentation is at
<https://orkeon.github.io/orkeon-code/>. In the workshop it has two uses: a second agent on your code,
and the spec, plan, batch and audit chain the harness no longer carries
([Develop a feature](../workflows/develop.md)).

### What it runs on

A model **of its own**. It cannot run on a Claude plan.

| You have | Orkeon Code runs on | Cost |
|---|---|---|
| nothing but the Claude plan | the local model (Ollama), the one of Orkeon's settings | machine time; a small local model is slow and limited for coding work |
| a key set with `workshop setup keys` | the hosted model you named | paid per token, by that key |
| neither a key nor a local model | nothing: a crew has no model to call | — |

It reads its settings in this order: `~/.orkeon-code/appsettings.json` when you wrote one
(`orkeon-code setup` asks for the provider, the model and the name of the key variable), else Orkeon's own
`~/.config/Orkeon/appsettings.json` — the file the container writes for the local model and that
`workshop setup keys` updates ([Model keys](./keys.md)).

### Its REPL

In a terminal of the container, at the top of the project:

```bash
orkeon-code trust add "$PWD"       # once per folder: Orkeon Code works only in a folder you trust
orkeon-code                        # its REPL, on the local model
workshop code                      # its REPL, with the keys of `workshop setup keys` in its environment
orkeon-code --version              # its version, and the Orkeon it found
```

Free text is a request to its assistant; `plan: …` asks without editing, `acceptEdits: …` lets it edit;
`/mode` sets the permission mode of the session. The commands that ask questions — `/dev-spec`,
`/dev-batches` — are run here, with you at the keyboard.

Two things to know in the workshop:

- **In the `keys` mode, open it with `workshop code`.** A key set with `workshop setup keys` is given to
  what Claude Code starts, not to your terminal: `workshop code [arguments]` starts `orkeon-code` with
  the keys of setup in its environment, for that one command — nothing is exported into the shell. In
  the `subscription` mode it is the same as `orkeon-code`.
- **Its trust store and its state are in the container** (`~/.orkeon-code/`): a new container starts
  without them, and you trust the folder again. What it writes in the project (`.orkeon/`, its work
  folder) stays in your folder.

### From Claude Code: `/orkeon-code` and `orkeon-code-run`

The skill `/orkeon-code` (core pack: every profile, workshop and checkout alike) has Claude Code start one
crew of Orkeon Code in one shot, with the command `orkeon-code-run`:

```bash
orkeon-code-run --list                           # the crews, each with the inputs it reads
orkeon-code-run <crew> --inputs '<json>' [--workspace <dir>] [--settings <file>]
```

| Asked for | Crew | Inputs |
|---|---|---|
| a coding request | `main-loop` | `{"prompt": "…", "permissionMode": "plan"}` |
| a review of the diff, of files or of a commit | `code-review` | `{}`, `{"files": ["…"]}` or `{"commit": "<sha>"}` |
| a map of the codebase | `analyze` | `{}` |
| the plan of a spec already written | `dev-plan` | `{"source": "<code>"}` |
| the audit of a batch already implemented | `dev-verify` | `{"batch": "F<n>", "plan": "<code>"}` |
| the proposals learnt from past audits | `dev-learn` | `{"list": true}` |

What the command does:

- runs `orkeon run` on the crew's file, under `/usr/local/lib/orkeon-code/current/src/crews/<crew>/`, with
  the project mounted read-write at `/workspace` and a scratch folder at `/output`;
- takes the workspace from `--workspace`, else from the folder of the Claude Code session, else from the
  current directory;
- takes the settings from `--settings`, else `~/.orkeon-code/appsettings.json`, else Orkeon Code's example
  settings with the `Llm` section of Orkeon's settings laid over them;
- refuses a folder Orkeon Code does not trust (exit `3`). Trusting is your act: Claude does not do it
  for you;
- prints one JSON object on stdout; `result.finalOutput` is the answer.

| Exit code | Meaning |
|---|---|
| `0` | the script completed — a call the permission mode refused is not an error: read the JSON |
| `1` | a script error |
| `2` | a runtime error: the model unreachable, a rate limit |
| `3` | the workspace is not trusted |
| `64` | usage |
| `75` | the run stopped on a question |
| `130` | cancelled |

The permission mode travels in the inputs (`permissionMode`):

| Mode | What the crew may do in a one-shot launch |
|---|---|
| `plan`, `dontAsk`, `default` | read only |
| `acceptEdits` | read and edit files; no shell |
| `bypassPermissions` | everything, the shell included |

The skill starts with `plan` for a question or a review, says which mode it chose, and asks you before
the first `bypassPermissions` of a session. On a hosted model it tells you the run is paid and asks
before the first launch. Afterwards Claude reads the JSON, looks at what changed (`git status`,
`git diff`) and reports: the agent is an operator with the rights of its mode, not the reviewer of its
own work.

### The limits

- **Without a model, no Orkeon Code**, and so no spec, plan, batch and audit chain: with neither a key
  nor a local model, Claude Code works alone.
- **A release candidate.** Orkeon Code `1.0.0-rc.2` may still change before its 1.0. In this image it runs
  on the `orkeon-repl` of the Orkeon release, taken from the release archive: its own runtime download
  is empty in rc.2 (V-61).
- **What was measured** (V-61): an untrusted folder refused, then `main-loop` in `plan` mode on a local
  model answering in about ten seconds. Not measured: `dev-plan`, `dev-verify` and `dev-learn` to their
  end, and a hosted model.
- **The harness does not watch it.** The hooks of the harness guard Claude Code's tools. What Orkeon Code
  edits, it edits under its own permission modes; the budget gate of the bench does not price its runs.

## Studio's terminal applications

Two applications of Orkeon Studio run in a terminal of the container:

```bash
orkeon-studio-config               # edits and validates Orkeon's settings (~/.config/Orkeon/appsettings.json)
orkeon-studio-run                  # lists the teams of the workshop and launches one
```

They are built from Studio's tag at the image build, start the `orkeon` of the container, and list the
teams of `/workspace/teams` (`ORKEON_STUDIO_TEAMS_ROOT`, which the image sets). A team is the same folder
as for the desktop application: its card `team.json`, its launchers, its mount points
([Teams](../concepts/teams.md)).

- `orkeon-studio-config` writes Orkeon's settings. `workshop setup keys` writes the `Llm` section of the
  same file: after editing that section by hand, `workshop setup` tells you where things stand.
- A team launched from `orkeon-studio-run` is started by you, outside Claude Code: the run gate, the
  bench and its budget do not see that run. On a hosted model it is paid, and it needs the key in its
  environment: `workshop exec orkeon-studio-run`.
- `orkeon-studio-check`, as before, checks a team as Studio reads it
  ([The harness](../reference/harness.md#hooks-the-guards)).

## Versions and updates

The three versions are pinned together in the image (`ORKEON_VERSION`, `ORKEON_CODE_VERSION`,
`ORKEON_STUDIO_VERSION`, [Building the image](../../.devcontainer/README.md)): Orkeon Code names the Orkeon
commit it was written for, Studio the Orkeon version it builds against. They move with the image
([Updating](./updating.md)); `orkeon-update` changes the `orkeon` command alone.

Next: [Docker modes and SonarQube](./docker-modes.md).
