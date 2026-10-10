# Handing a command to the user — where it is typed, one line per step, what must not reach the model

> Reference document of the Orkeon harness (the workshop's `references/process/`). Established on Orkeon main at ce9ec1f (2026-10-09, after 1.0.0-rc.4).
> Sources: `HARNESS.md` rule 10 (D47) and rules 2, 3, 8; `.devcontainer/workshop.sh` (the `workshop` command and
> its `--secret` option); `.claude/hooks/make-executable.sh`, `secret-guard.sh`; `sync-harness.sh` (D44); `orkeon/llm-profiles.md` § 6;
> `reliability/security.md` § 2; the user's report of 2026-10-10 (plan § 11.1, D47).

In a workshop Claude Code runs in bypass mode (`workshop`, D42): it runs the commands itself. A command
handed to the user is the exception, and the user who receives it may never have opened a terminal. The
report that led to this page: *"run `setup_glm.sh` then `source .zshrc`"* — said while the user was still
inside Claude Code, where neither line means anything; a script without its executable bit, refused with a
message the user could not read; and two commands where one would do. Rule 10 of `HARNESS.md` in one
line: **hand a command over only when you cannot run it yourself, say where it is typed, one line per
step, and never ask for a value you must not know.**

## 1. When a command is the user's

| The user runs | Why Claude does not |
|---|---|
| `git commit`, `git tag`, `git push` | D3, rule 2: the record of the workshop is theirs; Claude proposes the exact line |
| a line that carries a **value that must not reach the model** — a key, a password, a token, a setting they keep to themselves (a recipient list, a production address, an account) | rule 8 and § 5: the value would enter the conversation, the transcript and the memory |
| anything on **their computer**: `docker run`, `docker start`, a file outside the container, Orkeon Studio | the container does not see the computer |
| anything that changes **the shell they come back to**: `export`, `source`, a sign-in (`gh auth login`), the shell's own files | a command Claude runs changes Claude's process, not theirs |

Everything else, Claude runs — and offers to, when the user asks how to do something: a launcher on the
local model (`./run.sh`, free, rule 1), a check, a `chmod`, an `ollama pull`. A line the user wants to
watch while Claude Code stays open belongs in a second terminal of the container
(`docker exec -it --user node <container> zsh`, `docs/getting-started/install.md` § "Later").

## 2. Where a line is typed

Say it before the line, every time. There are three places, and the user may not know which one they are
in — a newcomer sees one window.

| Where | What goes there | How to say it |
|---|---|---|
| **In Claude Code** | a `/command` (`/team-approve need <slug>`, `/workshop-language fr`, `/deploy <slug>`) | "type, here:" |
| **In the terminal of the container**, after leaving Claude Code | a secret (`workshop --secret <NAME>`), a `source`, a sign-in, a script to watch, an editor | "type `/exit` to leave Claude Code; you are then in the terminal of the container. Type: … Then `workshop` brings Claude Code back." |
| **In a terminal of their computer** (PowerShell on Windows) | `docker …`, a file of the workshop opened with an editor of the computer, Studio | "on your computer, not in the container:" (`docs/guides/updating.md` says the same for an update) |

`/exit` ends the Claude Code session, not the container: the shell that started `workshop` is still there,
in `/workspace`. `workshop` opens Claude Code again, in the same workshop, with the same history. The `!`
prefix of Claude Code (a shell command typed in the conversation) is not an answer here: Claude can run
anything `!` can, and `!` neither hides a value from the conversation nor changes the environment of the
shell the user comes back to.

## 3. One line per step

A step is one line to type, and a hand-over has as few steps as the matter allows. Two commands or more
that go together become **one script**, so that the user types one line:

- the script lives in `.claude/local/scripts/<verb>-<object>.sh` (`.claude/local/` is the user's: never
  touched by the synchronisation, kept by git, in the scope of `secret-guard`);
- `#!/usr/bin/env bash`, `set -euo pipefail`, then a comment saying in two lines what it does and what it
  changes; idempotent (run twice, same result); it prints what it did, one line per thing;
- **no secret inside, and no prompt for one**: run as `bash <path>` a script cannot export into the
  user's shell, and a file that holds a value is a key on disk (rule 8). A secret goes through § 5;
- written with Write — the hook `make-executable` gives it its executable bit at once, and says so if it
  was written in CRLF —, then checked: `bash -n <path>`;
- handed as **`bash /workspace/.claude/local/scripts/<name>.sh`**: the absolute path survives any `cd`,
  and `bash <path>` needs no mode — a workshop mounted from Windows shows no reliable mode (D44), which is
  why `./<name>.sh` is never the handed line. A team's launcher likewise: `sh /workspace/teams/<slug>/run.sh`
  (it moves to its own folder by itself).

A single command is handed as it is, absolute paths included; `cd x && y` is two commands.

## 4. The message

In the user's language (rule 3), short, and in this order:

1. one sentence saying why this is theirs to type (§ 1);
2. **where** (§ 2), as a sentence, before the first line;
3. the numbered steps, each a single line in its own code block, nothing optional, no alternative — if
   two ways exist, Claude chooses;
4. what they will see when it worked (a line of output, a file that appears, Claude Code back);
5. the one line to type, or the one thing to tell Claude, if it fails.

A message with a choice in it, a command with a part to replace that is not spelled out, or two ways to
do the same thing, is not finished.

## 5. What must not reach the model

The model never asks for the value, never reads it back, never quotes it: the conversation, the
transcript Claude Code keeps and the memory would all hold it.

### 5.1 A secret in a variable

A model key (`Llm:ApiKeyEnvVar` names the variable; `orkeon/llm-profiles.md` § 6), a mailbox password
(`Auth:PasswordEnvVar`), a token (`GITHUB_PACKAGES_TOKEN`). The settings file names the variable; the
value reaches the container by one of three ways, and Claude says which one and nothing else:

| For | The user types | Lasts |
|---|---|---|
| **this session** | `/exit`, then `workshop --secret ZAI_API_KEY` — the terminal asks for the value, shows nothing while it is typed, keeps nothing (not in the shell history either), exports it and opens Claude Code | until the container is left |
| **the container** | on their computer, when the container is created: `docker run … -e ZAI_API_KEY … orkeon-workshop`, the variable set in that terminal first (`$env:ZAI_API_KEY = "…"` in PowerShell, `export ZAI_API_KEY=…` on Linux) — `-e NAME` without a value forwards the terminal's variable, so no value stands in the command | the life of the container (`docker start` keeps it) |
| **VS Code** | `"remoteEnv": { "ZAI_API_KEY": "${localEnv:ZAI_API_KEY}" }` in the workshop's `.devcontainer/devcontainer.json`, the variable set on the computer | every container VS Code opens |

A line in `~/.zshrc` of the container is the user's own choice: it is lost when the container is replaced
(`docs/guides/updating.md`), it is typed in the clear, and Claude never writes it. A host other than
`api.anthropic.com` also needs the firewall's leave when the firewall is on (`FIREWALL_EXTRA_DOMAINS`,
`orkeon/llm-profiles.md` § 6). Afterwards, Claude checks the **name**, never the value:
`orkeon doctor` says whether the variable the settings name is set.

### 5.2 A setting the user keeps to themselves

A recipient list, a production address, an account name, a folder of the computer: not a secret, but
theirs. Claude writes the file with the key in place and a placeholder as its value (`"<to fill>"`), then
hands over:

1. the file and the key, with the line to fill — the workshop is a folder of the computer, so an editor
   there serves (`%USERPROFILE%\Orkeon\settings\<slug>\appsettings.json` on Windows); in the container,
   `/exit` and an editor;
2. once filled, the check Claude runs — one whose output prints no value: `./run.sh --validate`,
   `orkeon doctor`, `orkeon-bench check design <slug>` —, and the file is not read back nor quoted.

A placeholder that Orkeon refuses at the start (`${NAME}` in `Llm:ApiKey`, `cli.md` § 5) is said as such:
the run waits for the value, which is the point.
