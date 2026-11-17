# Model keys: the two modes

*English · [Français](../fr/guides/keys.md)*

A workshop gets its model keys in one of two ways (D108, D109). The mode says where the **model** keys
live; it changes nothing else.

| | `subscription` (the default) | `keys` |
|---|---|---|
| Claude Code runs on | your Claude plan, through its sign-in | the same sign-in — or your API account, with `--claude-on-key` |
| Your teams run on | the local model (Ollama) | the hosted model you name |
| Orkeon Code runs on | the local model | the hosted model you name |
| You pay | the plan; the local model costs machine time only | the plan, **and** the provider of the key, per token |
| A model key on disk | none | one file: `.claude/settings.local.json` |

**Orkeon cannot run on a Claude plan.** Its Anthropic provider sends an API key and nothing else, and the
sign-in of a plan is reserved to Anthropic's own applications. So without a key, Claude Code is the only
thing that runs on Claude; the teams and Orkeon Code run on the local model, and Orkeon gives Claude Code
its tools ([Orkeon's tools in Claude Code](./orkeon-tools.md)).

## The commands

Type them **in a terminal of the container**, never in the conversation with Claude: Claude would keep
what you type there. Leave Claude Code first (`/exit`), or open a second terminal.

```bash
workshop setup                     # the same as: workshop setup status
workshop setup keys --provider <id> --model <model> [--claude-on-key] [--base-url <url>] [--key-variable <NAME>]
workshop setup subscription [--yes]

workshop code [arguments of orkeon-code]     # Orkeon Code's REPL, with the keys of setup
workshop exec <command> [arguments]          # any command of this terminal, with the keys of setup
```

`workshop setup keys` asks for the key and shows nothing while you type it. Then **start Claude Code
again** (`/exit`, then `workshop`): a session reads its settings when it starts.

| Option | Meaning |
|---|---|
| `--provider <id>` | one of the providers below, or `custom` |
| `--model <model>` | the model the teams call, as the provider names it |
| `--claude-on-key` | `anthropic` only: Claude Code takes the key too, and bills the API account instead of the plan |
| `--base-url <url>` | the endpoint; required for `custom`, the provider's own otherwise |
| `--key-variable <NAME>` | the variable that holds the key; required for `custom`, the provider's own otherwise |

| Provider | Endpoint | Variable written |
|---|---|---|
| `anthropic` | `https://api.anthropic.com` | `WORKSHOP_ANTHROPIC_API_KEY` (`ANTHROPIC_API_KEY` with `--claude-on-key`) |
| `openai` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| `mistral` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` |
| `deepseek` | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` |
| `openrouter` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `grok` | `https://api.x.ai/v1` | `XAI_API_KEY` |
| `together` | `https://api.together.xyz/v1` | `TOGETHER_API_KEY` |
| `custom` | your `--base-url` | your `--key-variable` |

Three things are refused, with the reason: a variable whose name starts with `ORKEON_` (Orkeon loads
every such variable into its configuration, where the tools of a crew can read it); `ANTHROPIC_API_KEY`
as the variable without `--claude-on-key`; `--claude-on-key` with another provider than `anthropic`.

The firewall, when it runs, allows `api.anthropic.com`; any other provider needs its host in
`FIREWALL_EXTRA_DOMAINS` ([configuration](../reference/configuration.md#firewall)).

### Where things stand

```text
$ workshop setup
mode: keys
keys in .claude/settings.local.json: WORKSHOP_ANTHROPIC_API_KEY
Claude Code: on its sign-in
teams: <model> at https://api.anthropic.com — remote: a run is paid
key variable of the teams: WORKSHOP_ANTHROPIC_API_KEY
```

It prints names, never a value. `NOT SET` after the key variable means Orkeon's settings name a variable
that is neither in the file nor in the environment. Underneath, the three commands are
[`orkeon-bench setup`](../reference/orkeon-bench.md#setup--the-model-keys-for-claude-code-and-orkeon).

## What is written where

| File | What `setup keys` writes | In git |
|---|---|---|
| `.claude/settings.local.json`, in your folder | the key, in its `env` block, under the variable above; the file is set to mode `0600` | ignored by the workshop's `.gitignore` |
| `~/.config/Orkeon/appsettings.json`, in the container | the **name** of the variable (`Llm:ApiKeyEnvVar`), the model (`Llm:Model`) and the endpoint (`Llm:BaseUrl`); an `Llm:ApiKey` found there is removed; the one-request-at-a-time bound of the local model (`RateLimiting:MaxConcurrentRequests` and `QueueLimit`) is lifted; the rest of the file is kept | not in your folder |
| `.claude/local/setup.json`, in your folder | the names of the variables written, the model, the endpoint and the variable chosen, and the `Llm` and `RateLimiting` sections Orkeon had before, to give them back; never a key | ignored by the workshop's `.gitignore` |

Claude Code gives the `env` block to every command and every MCP server it starts (V-59). So `orkeon`,
`orkeon-bench`, `orkeon-code-run` and Orkeon's MCP server find the key in their environment, with no file
of their own. A terminal you open yourself does not read that block. Two commands give the keys of setup to what you
start by hand there: `workshop code` opens Orkeon Code's REPL with them, and `workshop exec <command>`
runs any command with them (`workshop exec orkeon run …`, `workshop exec ./run.sh`,
`workshop exec orkeon-studio-run`). The keys are read for that one command: nothing is exported into
your shell, nothing is printed. In the `subscription` mode both run the command as it is.

A workshop versioned with git before November 2026 has an older `.gitignore`. The image never rewrites
it, but at the next start it appends the lines that are missing — `.claude/local/setup.json`,
`.claude/local/mcp-calls.tsv`, `.orkeon/` — and says so in a `[harness] .gitignore:` line
([Updating](./updating.md#the-harness)). `.claude/settings.local.json` was already there.

## With a key: what changes, what does not

- **Claude Code stays on its sign-in.** The Anthropic key of the teams is written as
  `WORKSHOP_ANTHROPIC_API_KEY`, a name Claude Code does not read. Only `--claude-on-key` writes
  `ANTHROPIC_API_KEY`; Claude Code then bills the API account instead of the plan.
- **The teams' requests are no longer held to one at a time.** For the local model the image writes
  `RateLimiting.MaxConcurrentRequests: 1` and a `QueueLimit` in Orkeon's settings, since Ollama answers
  one request at a time. A hosted provider does not: `setup keys` removes those two values (the rest of
  the section stays) and prints `the one-request-at-a-time bound of the local model is lifted`;
  `setup subscription` gives the section back as it was.
- **A run of a team on that model is paid**, and the budget gate applies as before: `orkeon-bench
  estimate`, then your `/team-approve remote <usd>` before any paid run
  ([Models](./models.md#the-approval-of-paid-runs)).
- **Orkeon Code on that model is paid too**, and no gate of the bench prices it: `/orkeon-code` tells you
  so and asks before the first launch of a session ([Orkeon Code](./orkeon-code.md)).
- **Claude still never writes a key**, and never asks you for one: the key guard refuses a key pattern
  written under `.claude/`, this file included, and the harness's settings deny Claude the `Read` of
  `.claude/settings.local.json`. `orkeon-bench setup` is the one writer. That deny is a guard against
  accidents, not a wall: the key is in the environment of every command Claude Code starts (below).

## The limits

Stated plainly, so that you choose knowingly:

- **The key is in the environment of every command Claude Code starts**, as a key given with
  `workshop --secret` is. A command, a script or a tool of a crew that reads its environment reads it.
  In a container Orkeon runs `shell_command` unconfined: give that tool to no agent that reads untrusted
  input ([Models](./models.md#remote-models)).
- **The file is in your workshop folder, on your machine.** A Windows folder mounted in the container
  ignores the mode `0600`: any account that reads the folder reads the key. A folder synchronised to a
  cloud (OneDrive, Dropbox, iCloud) copies the file there. A backup of the folder holds it.
- **Git ignores the file; nothing else protects it.** A `git add -f`, an archive of the folder or a copy
  of `.claude/` carries the key.
- **Orkeon's settings live in the container, the key in your folder.** A new container (an image update)
  writes fresh settings, for the local model. The start of the container puts your choice back by itself
  (`orkeon-bench setup apply`: the model, the endpoint and the variable are kept in
  `.claude/local/setup.json`), and says so in one line:
  `[orkeon] mode keys: Orkeon's settings put back on what setup keys chose (…)`. Nothing to type.
- **What was measured**: Claude Code handing the `env` block to a command and to an MCP server, and
  `ANTHROPIC_API_KEY` in that block winning over the sign-in, with `claude -p` (V-59). In an interactive
  session Claude Code may ask once about a key it finds; that was not measured.

If one of these is not acceptable, stay in `subscription` and give the key for a session or a container
instead. The three earlier ways still work and keep keys off the disk
([How a key reaches the container](./models.md#how-a-key-reaches-the-container)):

| Way | Lasts |
|---|---|
| `workshop --secret <NAME>`, in the terminal of the container | the session |
| `-e <NAME>` on `docker run`, the variable set on your computer | the container |
| `remoteEnv` in `.devcontainer/devcontainer.json` | every container VS Code opens |

With these, write Orkeon's settings yourself (`Llm:Model`, `Llm:BaseUrl`, `Llm:ApiKeyEnvVar`), and avoid
`ANTHROPIC_API_KEY` as the name unless you want Claude Code on the API account.

A key that is not a model's — a search key such as `TAVILY_API_KEY` — is outside the two modes: give it
with `workshop --secret`, in either mode.

## Going back

```bash
workshop setup subscription        # asks to confirm; --yes skips the question
```

It removes from the `env` block the variables `setup keys` wrote, and only those; it gives Orkeon back
the `Llm` section it had before the first `setup keys` (or removes the section when there was none, and
says how to write one: `orkeon init --provider ollama --model <model>`) and the `RateLimiting` section
with it, so the local model answers one request at a time again; it empties
`.claude/local/setup.json`. Start Claude Code again afterwards.

It does not revoke the key: a key that sat in a synchronised folder or a backup is revoked at the
provider's.

Next: [Orkeon's tools in Claude Code](./orkeon-tools.md).
