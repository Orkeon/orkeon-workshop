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
and its plan, the tests, decisions, status, and your approvals, typed and recorded — a team's first tests
already run on a simulated model, for free, and `/deploy` packs a team for another workshop; the later
steps are followed by hand until their skills are built ([roadmap](./README.md#roadmap)).

**Do I need to be a developer?**
No, to build and run simple teams: you describe what you want, Claude does the rest, and the guided tour
(`/orkeon-tour`) explains everything in plain words. To install it, you install Docker and paste one
line into a terminal ([Install](./getting-started/install.md)). Developers get more: the TypeScript and C# tools, the bench, the hooks.

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
Nothing to do: the start line of [Install](./getting-started/install.md#1-start-the-workshop) tries the card
and goes on without it. If you start the container by hand, remove `--gpus=all` from the command; if a
start with it already failed, remove the container it left behind first: `docker rm my-orkeon-workshop`
([Troubleshooting](./reference/troubleshooting.md#the---gpusall-option)).

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
the team reads and writes in its folders. Claude commits and pushes what a step produced, with the git
identity you set; a tag is proposed, you run it.
Commit the `.gitattributes` it created too: it keeps a clone made on Windows from coming out in CRLF, which
the container cannot run ([Versioning it with git](./concepts/workshop.md#versioning-it-with-git)).

**How do I reopen, stop, or open a second terminal?**
Reopen it another day: start Docker Desktop, then paste in a terminal of your computer the same line as at
[Install, step 1](./getting-started/install.md#1-start-the-workshop). The container exists already: the line
starts it again, with no question and no download; then type `workshop`. A second terminal in the running
workshop: the same line again, in a new terminal window of your computer. `/exit` leaves Claude Code and
gives you the terminal of the container; `exit`, typed there, stops the workshop — your folder, your
sign-in and the models are kept ([Later: reopen, add a terminal, stop](./getting-started/install.md#later-reopen-add-a-terminal-stop)).

**Claude asks me to type a command: where do I type it?**
Claude runs almost everything itself; it hands you a command only when it cannot — a git tag, a value it
must not see, something on your computer, or a change of your terminal. It then says where the line goes,
one line per step: in Claude Code (a `/command`); in the terminal of the container, after you typed `/exit`
to leave Claude Code (`workshop` brings it back); or in a terminal of your computer (PowerShell on Windows),
for `docker` commands ([Three places where you type](./getting-started/install.md#three-places-where-you-type)). A script it wrote for you is run with `bash <path>`, never `./<name>.sh`: a workshop
folder mounted from Windows keeps no executable bit. If a line fails, paste its last message to Claude.

**How do I give a key, a password or a setting I keep to myself?**
Never in the conversation: Claude would keep it. For this session, type `/exit`, then
`workshop --secret ZAI_API_KEY` (the variable your settings name): the terminal asks for the value, shows
nothing while you type it, keeps nothing, and opens Claude Code with it. That is the simple way: type it
again in each session. To keep it in the container instead, the container is created with it: set the
variable on your computer, then create the container by hand with `-e ZAI_API_KEY` (no value) added to
the command of [Starting by hand](./getting-started/install.md#starting-by-hand) — Docker forwards it. The
update line of [Updating](./guides/updating.md) carries it over to the new container, by name and never by
value, when the variable is set in the window where you type it
([Models](./guides/models.md#how-a-key-reaches-the-container)). A setting you keep to
yourself — a recipient list, an address — is filled in by you in the file Claude names, with an editor of
your computer; Claude checks that the file is accepted without reading the value.

**Which name goes on the commits Claude makes?**
The identity git has in the container. Give it for a session with `/exit`, then
`workshop --git-identity "<name>" <email>` — nothing is written on disk —, or for the container with
`-e GIT_AUTHOR_NAME=… -e GIT_AUTHOR_EMAIL=… -e GIT_COMMITTER_NAME=… -e GIT_COMMITTER_EMAIL=…` on
`docker run` ([Configuration](./reference/configuration.md#variables-of-the-image)). Without one, Claude
stops before the commit and asks you for it; it never invents a name.

**What is the difference between Claude Code and the harness?**
Claude Code is Anthropic's coding assistant, installed unmodified. The harness is what the workshop adds
around it: skills, subagents, rules, hooks, templates and reference documents, plus `orkeon-bench` and
the .NET templates. It is cut into packs composed into profiles: the `user` profile is the workshop
described in these pages ([profiles and packs](./reference/harness.md#profiles-and-packs)).

**I contribute to Orkeon itself: is the workshop for me?**
Yes. A source profile (`contrib`, `dev`, `release`, `docs`) deploys the harness's development skills into
a git checkout of Orkeon or of this project instead of a workshop: the start line with `-Profile dev`
([For a git checkout](./getting-started/install.md#for-a-git-checkout)), or `/workshop-profile dev` later. Nothing git tracks is written
([in a source checkout](./reference/harness.md#in-a-source-checkout)).

**Is it affiliated with Anthropic? Is it a version of Claude Code?**
No to both. Orkeon Workshop is an independent open-source project. It installs Claude Code from
Anthropic's official package, and the image it publishes does not contain Claude Code at all: a container
downloads it at its first start.

**Can teams use another model than Claude?**
Yes. Claude Code builds the teams; the teams themselves use any model Orkeon supports — the local Ollama
model named when the container was created, or a remote provider you configure ([Models](./guides/models.md)).

**What does "planned" mean in these pages?**
A part of the method that is designed but not built yet, such as the `team-*` skills of the later
steps or the local and remote levels of `orkeon-bench run`. The [roadmap](./README.md#roadmap) tells when it comes.

**What is the licence?**
MIT. Some material is adapted from three MIT-licensed projects, and a few files derive from Anthropic's
reference devcontainer and keep Anthropic's terms for those parts:
[`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) lists them.
