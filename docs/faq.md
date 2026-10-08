# FAQ

*English · [Français](./fr/faq.md)*

**What is Orkeon?**
An open-source .NET framework for teams of AI agents: agents, tasks and tools, declared in YAML,
TypeScript or C# ([github.com/Orkeon/orkeon](https://github.com/Orkeon/orkeon)). **Orkeon Studio** is its
desktop application, on Windows: it lists your teams and runs them.

**What does Orkeon Workshop add?**
A method and its guard rails. Claude Code can write a team in minutes; the workshop makes it write down
the need, define what "done" means, write the tests first, run the team on simulated, local and remote
models, review it and keep a record of every attempt and decision — so that you can rely on the team.
Today Claude writes, checks and runs a prototype; the first steps of the method are driven by skills —
opening a team's record, the interview that writes its need, the criteria and the test plan, the design
and its plan, decisions, status, and your approvals, typed and recorded — and a team's first tests
already run on a simulated model, for free; the later steps are
followed by hand until their skills are built ([roadmap](./README.md#roadmap)).

**Do I need to be a developer?**
No, to build and run simple teams: you describe what you want, Claude does the rest, and the guided tour
(`/orkeon-tour`) explains everything in plain words. You will copy a few commands into a terminal to
install it. Developers get more: the TypeScript and C# tools, the bench, the hooks.

**Do I need to read English?**
Little. Claude answers in the language you write in, and one command, typed once at the start —
`/workshop-language fr`, or any other language — makes it the language of your workshop: Claude then
talks in it even when you only type commands, and writes in it the documents that describe your teams —
need, criteria, test plan, design ([Your language](./getting-started/install.md#your-language)). The
commands themselves, the headings of the documents and what scripts read stay in English. So do the
messages of the terminal and Claude Code's own screens: the install page walks you through them.

**What does it cost?**
Orkeon Workshop is free (MIT licence). You need a Claude account that gives access to Claude Code. Your
teams run on a local model by default, which costs nothing but machine time. A remote model (Anthropic,
OpenAI…) is paid to its provider, and the workshop never runs one without your explicit approval.

**Does my data leave my computer?**
Claude Code works with Claude, a cloud model: what Claude reads in the workshop — your requests, the
files it opens — is sent to Anthropic to be processed, under the terms of your Claude account. Your teams'
runs on the local model stay on your computer. A run on a remote model sends its inputs to that
provider. Keys belong in environment variables: a hook refuses any edit by Claude that would write a key
into the team, workbook, test, settings, mount set, library or reference folders.

**Do I need a graphics card?**
No. With an NVIDIA GPU the local models are fast; without one they run on the processor, more slowly.
Remove `--gpus=all` from the start command. If a start with it already failed, remove the container it
left behind first: `docker rm my-orkeon-workshop` ([Troubleshooting](./reference/troubleshooting.md#the---gpusall-option)).

**Does it work on a Mac?**
It is not tested: the image is built for `linux/amd64` only.

**Can I use it without Docker?**
No: the image is the product — Claude Code, the Orkeon CLI, the local models and the harness, set up to
work together.

**Where are my teams?**
In your workshop folder, in `teams/`. The workshop is the folder you mounted on `/workspace`, whatever
its name; on Windows, Orkeon Studio lists those teams — on its own when the workshop is
`%USERPROFILE%\Orkeon`, once pointed at its `teams` subfolder otherwise
([The workshop](./concepts/workshop.md#orkeon-studio-sees-it)).
How each was made is in `workbooks/`, how it is proven in `tests/`. They are plain files: you can read
and edit them with any editor.

**Can I version my workshop with git?**
Yes: `git init` in the workshop folder. The `.gitignore` the harness created keeps runs, the mount sets
`mounts.*/`, build output, backups and local settings out, and each team's own `.gitignore` keeps out what
the team reads and writes in its folders. The harness never commits for you; it proposes the command.

**What is the difference between Claude Code and the harness?**
Claude Code is Anthropic's coding assistant, installed unmodified. The harness is what the workshop adds
around it: skills, subagents, rules, hooks, templates and reference documents, plus `orkeon-bench` and
the .NET templates.

**Is it affiliated with Anthropic? Is it a version of Claude Code?**
No to both. Orkeon Workshop is an independent open-source project. It installs Claude Code from
Anthropic's official package, and the image it publishes does not contain Claude Code at all: a container
downloads it at its first start.

**Can teams use another model than Claude?**
Yes. Claude Code builds the teams; the teams themselves use any model Orkeon supports — the local Ollama
model by default, or a remote provider you configure ([Models](./guides/models.md)).

**What does "planned" mean in these pages?**
A part of the method that is designed but not built yet, such as the `team-*` skills of the later
steps or the local and remote levels of `orkeon-bench run`. The [roadmap](./README.md#roadmap) tells which lot brings it.

**What is the licence?**
MIT. Some material is adapted from two MIT-licensed projects, and a few files derive from Anthropic's
reference devcontainer and keep Anthropic's terms for those parts:
[`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) lists them.
