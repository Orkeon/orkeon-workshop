# Orkeon Workshop

*English · [Français](./README.fr.md)*

[![checks](https://github.com/Orkeon/orkeon-workshop/actions/workflows/checks.yml/badge.svg)](https://github.com/Orkeon/orkeon-workshop/actions/workflows/checks.yml)
[![image](https://github.com/Orkeon/orkeon-workshop/actions/workflows/image.yml/badge.svg)](https://github.com/Orkeon/orkeon-workshop/actions/workflows/image.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](./LICENSE)
[![documentation](https://img.shields.io/badge/documentation-orkeon.github.io-blue.svg)](https://orkeon.github.io/orkeon-workshop/)

<p align="center">
  <img src="./docs/assets/kama-workshop.jpg" alt="Kama, the Orkeon Workshop chameleon, at a workbench with a holographic blueprint, in front of a gear" width="320">
</p>

**An open-source harness that puts [Claude Code](https://code.claude.com/docs/en/overview) to work
around [Orkeon](https://github.com/Orkeon/orkeon): build and test your own agent teams, and work on Orkeon
itself — describe a problem, fix it, develop, release, document — with a method, guard rails and a record.**

Orkeon is a .NET framework for teams of AI agents. Asking a coding assistant for such a team is easy;
knowing whether it does what was needed, what it costs and how it behaves when things go wrong is not. The
same goes for a change to Orkeon itself: a fix without its test, a release without its evidence, a page
that no longer says what the code does. Orkeon Workshop answers both with one **harness** for Claude Code —
skills, subagents, rules and hooks — and one container image, **`orkeon-workshop`**, that carries the
Orkeon CLI, local models on your GPU and the harness; Claude Code is installed at the first start of the
published image.

## What the harness does

```mermaid
flowchart LR
    you(["You"]) --> harness["Claude Code + the harness<br/>a method, guard rails, a record;<br/>you type what commits, publishes or pays"]
    harness --> teams["Build your agent teams<br/>in a workshop folder<br/>need → tests → team → runs → accepted"]
    harness --> orkeon["Work on Orkeon itself<br/>in a git checkout<br/>describe · fix · develop · release · document"]
    teams --> studio(["Teams that Orkeon Studio runs,<br/>with their record"])
    orkeon --> prs(["Issues, pull requests, releases<br/>and docs you can trust"])
```

**Build your agent teams.** In a **workshop** — a folder of yours, which Orkeon Studio reads — Claude
writes the need down, puts the acceptance criteria and the tests first, builds the team (YAML, TypeScript or
C#), checks it against what Orkeon and Orkeon Studio really accept, runs it on simulated, local then remote
models, and reviews and fixes it until a report proves it meets its criteria. Every attempt and every
decision stays on disk; a paid run waits for your approval; a team packs into an archive for another
workshop.

**Work on Orkeon itself, at the level you work at.** In a **git checkout** of Orkeon — or of this project —
the same harness helps you **describe** a failure precisely (reproduce it in a workshop, write the issue),
**fix** it (validate the fix on its branch, prepare the pull request), **develop** (a spec, a plan, an
implementation driven by its tests, a verification, with subagents that write the tests, implement, audit
and attack the result, and a quality report), **release** (the quality gates, the readiness check, the
evidence record, the notes, the verification of what was published) and **keep the documentation true** to
the code. What is specific to a repository — its commands, checklists, layout rules — comes in a
repository pack: Orkeon and this project ship theirs.

**The same rules everywhere.** Claude commits and pushes what a step produced, and opens a pull request
after asking you (a switch makes it automatic); it never tags, files an issue, comments or pays for a run
on its own: it prepares the text and hands you the command. In a checkout it writes nothing
git tracks and keeps `git status` clean; the work goes under `todo/`, or under the folder the repository
keeps its tasks in. Reads are bounded, secrets are kept
out of the files, and every guard is a hook with its evals.

## One image, one role at a time

The harness is cut into **packs**, and a **profile** chooses which packs the folder Claude Code works in
receives. A folder runs `user` unless you choose otherwise, and a workshop on `user` gets the harness
exactly as it was before profiles existed.

| You want to… | Profile | Where Claude works | Packs of skills |
|---|---|---|---|
| **build Orkeon teams** and prove they work — as an Orkeon Studio user, or for a project of your own | `user` (the default) | a workshop: a folder of teams, versioned with git or not | the method (`/team-init` … `/team-tests`), the generators, `orkeon-bench`, `/deploy`, the guided tour |
| **describe and fix**: contribute to Orkeon or to this project | `contrib` | a workshop, or a git checkout | the issue, the validated fix, the pull request |
| **develop** a repository — Orkeon, this project, another | `dev` | the top of its git checkout | spec, plan, implementation by tests, verification, the four review subagents, the quality report |
| **release** it | `release` | a git checkout | the gates, the readiness check, the evidence record, the notes, the verification |
| **keep its documentation true** | `docs` | a git checkout | the audit of the pages against the code |
| do a bit of everything | `all`, or `custom:<pack>,<pack>` | either | the packs that fit the space |

A source profile builds no team: a developer who builds teams for a project of their own works with
`user`, in a folder of teams. Choose with `/workshop-profile <name>` in Claude Code (or
`workshop-profile <name>` in the container's terminal), or give it to the first start: `-Profile <name>`
of the start script, or `-e HARNESS_PROFILE=<name>` by hand — [Profiles](./docs/reference/profiles.md),
and [Profiles and packs](./docs/reference/harness.md#profiles-and-packs) for the mechanics.

## Discover it in a chat

- **Before installing**: paste [this prompt](./docs/discover-with-claude.md) into a claude.ai or Claude
  Desktop chat. Claude explains the project in your language and walks you through the installation.
- **Once installed**: open Claude Code with `workshop`. In a workshop, set your language if it is not
  English (`/workshop-language fr`), then type `/orkeon-tour` — a guided tour of your own workshop, which
  can build a first team with you. In a checkout, open the page of your role
  ([the workflows](./docs/workflows/overview.md#where-do-you-start)).

## Get started

**Which case is yours?** Three readers, three lines. Each needs a Windows 10/11 or Linux computer with
about 25 GB free, a Claude account, and Docker started —
[Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) on Windows, Docker
Engine on Linux: Docker is the program that runs the workshop in its own sealed box, and the **image** is
that box, downloaded once (about 19 GB). The line is pasted in a terminal of your computer — **PowerShell**
on Windows (Start menu, type `PowerShell`) — and followed by Enter. Step by step, with what you should see:
[Install](./docs/getting-started/install.md); walked through in a chat: [Discover it in a chat](#discover-it-in-a-chat).

### 1. You use Orkeon Studio and want a workshop that works

No programming, no Docker knowledge. On Windows:

```powershell
irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1 | iex
```

On Linux:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop
```

It asks one question, the folder of your workshop: **press Enter** to keep `Orkeon` in your user folder,
the folder Orkeon Studio reads by default. If your teams already live in that folder, with or without git,
it settles next to them without touching them. Then it downloads the image (once), finds out whether
you have an NVIDIA graphics card, and starts the workshop in the same window. When the messages stop,
type:

```text
workshop                 ← opens Claude Code in your workshop
```

then, in Claude Code, `/workshop-language fr` if English is not your language
([Your language](./docs/getting-started/install.md#your-language)), and `/orkeon-tour`: the guided tour,
which can build a first team with you. **Another day**, paste the same line again: it reopens the same
workshop. To report a failure or validate a fix, the workshop is the same, with the `contrib` profile:
[Contribute](./docs/workflows/contribute.md).

### 2. You develop and build teams for a project of your own

The teams live in a **folder of yours** — empty, or already holding `teams/`, versioned with git or
not — and you may run several workshops side by side, with or without a graphics card. The same script
takes options: a **name** for this workshop's container — the box Docker runs for it, one per workshop;
one name, one container: the plain line above opens `my-orkeon-workshop`, so a second folder takes a
second name —, the folder, and `-NoGpu` when there is no NVIDIA card to use. The profile — the set of
skills the folder gets — stays `user`, the one that builds teams ([Profiles](./docs/reference/profiles.md)).
On Windows:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Name <name> -Folder "D:\Work\my-workshop"
```

On Linux:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --name <name> --folder ~/work/my-workshop
```

Then the same as above: `workshop`, `/orkeon-tour`. Later, the same line with the same name reopens it;
a line with another folder and that name is refused, never applied in silence. Every option (model, GPU,
update, dry run), one copyable line per situation, and what the workshops share:
[The script's options](./docs/getting-started/install.md#the-scripts-options). Orkeon Studio lists one
folder of teams: point it at this one's when you want it there
([Orkeon Studio sees it](./docs/concepts/workshop.md#orkeon-studio-sees-it)).

### 3. You contribute to Orkeon Workshop itself, or to Orkeon

The folder is a **git checkout** of the repository — clone it first — and the profile one made for a
checkout: `dev` to develop, `release`, `docs`, `contrib`, or `all` for this repository
([Profiles](./docs/reference/profiles.md)). The container gets a name of its own. On Windows:

```powershell
git clone https://github.com/Orkeon/orkeon-workshop.git "$env:USERPROFILE\src\orkeon-workshop"
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Name orkeon-workshop-dev -Folder "$env:USERPROFILE\src\orkeon-workshop" -Profile dev
```

On Linux:

```bash
git clone https://github.com/Orkeon/orkeon-workshop.git "$HOME/src/orkeon-workshop"
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --name orkeon-workshop-dev --folder "$HOME/src/orkeon-workshop" --profile dev
```

For Orkeon, the clone is `https://github.com/Orkeon/orkeon.git`. The harness lands in the checkout's
`.claude/`, listed in `.git/info/exclude`, never in a tracked file
([In a source checkout](./docs/reference/harness.md#in-a-source-checkout)); there is no tour there, and
Claude follows the language of your messages. Type `workshop`, then open the page of your role:
[Develop](./docs/workflows/develop.md), [Release](./docs/workflows/release.md),
[Keep the documentation true](./docs/workflows/keep-docs-true.md),
[Maintain Orkeon Workshop](./docs/workflows/maintain-the-workshop.md). To build the image from the
checkout: [Building the image](./.devcontainer/README.md). The `docker run` the script types for you,
to change what it does not offer, is in [Starting by hand](./docs/getting-started/install.md#starting-by-hand).

## Documentation

| | |
|---|---|
| **Start** | [Install](./docs/getting-started/install.md) · [Your first team](./docs/getting-started/first-team.md) · [VS Code](./docs/getting-started/vs-code.md) |
| **Understand** | [The workshop](./docs/concepts/workshop.md) · [Teams](./docs/concepts/teams.md) · [Mount points](./docs/concepts/mount-points.md) · [How a team gets built](./docs/concepts/process.md) · [Testing](./docs/concepts/testing.md) |
| **Do** | [YAML team](./docs/guides/yaml-team.md) · [TypeScript team](./docs/guides/typescript-team.md) · [C# tools](./docs/guides/csharp-tools.md) · [Models](./docs/guides/models.md) · [Docker modes](./docs/guides/docker-modes.md) · [Updating](./docs/guides/updating.md) |
| **Roles** | [Workflows: who does what](./docs/workflows/overview.md) · [Contribute](./docs/workflows/contribute.md) · [Develop](./docs/workflows/develop.md) · [Release](./docs/workflows/release.md) · [Keep the docs true](./docs/workflows/keep-docs-true.md) · [Maintain the workshop](./docs/workflows/maintain-the-workshop.md) · [Measure](./docs/workflows/measure.md) · [Profiles](./docs/reference/profiles.md) · [Profiles and packs](./docs/reference/harness.md#profiles-and-packs) · [In a source checkout](./docs/reference/harness.md#in-a-source-checkout) · [The skills of the packs](./docs/reference/harness.md#the-skills-of-the-packs) · [Design of the profiles](./docs/profiles-design.md) |
| **Look up** | [`orkeon-bench`](./docs/reference/orkeon-bench.md) · [Options and variables](./docs/reference/configuration.md) · [The harness](./docs/reference/harness.md) · [Troubleshooting](./docs/reference/troubleshooting.md) · [FAQ](./docs/faq.md) |
| **Build and design** | [Building the image](./.devcontainer/README.md) · [The Orkeon Workshop plan](./docs/orkeon-workshop-plan.md) |

All of it starts from the [documentation index](./docs/README.md), and is published as a site, with a
search box: <https://orkeon.github.io/orkeon-workshop/>.

## Where the project stands

**Building teams** — the foundation is built and checked: the image, the harness and its
guards, the reference documents, the team generators (`orkeon-crew-yaml`, `orkeon-crew-typescript`), the
guided tour, `orkeon-bench` and the .NET templates, and `orkeon-studio-check`, which reads a team with
Orkeon Studio's own code. The first steps of the method are skills:
`/team-init`, `/team-need`, `/team-test-plan`, `/team-design`, `/team-tests`, `/team-decision` and
`/team-status`, and your approvals, typed as `/team-approve …` and recorded by a hook; `/deploy` packs a
team into an archive for another workshop; the bench checks the criteria, the test plan and the design on
paper, and runs a team's static checks and its component scenarios on a simulated model. **Next**: the skills of the later steps, and the bench commands that run a team on a local then a
remote model and score it.

**The other roles** — profiles and packs are delivered: `contrib`, `dev`, `release` and `docs`,
the repository packs of Orkeon and of this project, the switch between profiles, the deployment into a git
checkout that writes nothing git tracks, and `cc-usage`, which measures what a Claude Code session costs
(the `user` profile costs the same as before). **Next**: the skills of the packs run end to end on a real
Orkeon checkout, and a profile that removes the harness from a checkout.

The [roadmap](./docs/README.md#roadmap) lists what is delivered and what comes next.

## Acknowledgements

Orkeon Workshop builds on the work of others. The harness's Bash dispatcher, its read and delegation guards, its eval
runner and, in the packs, the development chain come from Pierre Belin's
[claude-code-toolkit](https://github.com/pierrebelin/claude-code-toolkit); the `cc-usage` command, which
measures what a Claude Code session costs, is his
[claude-code-token-usage](https://github.com/pierrebelin/claude-code-token-usage). The devcontainer
started from Anthropic's reference devcontainer for Claude Code, and the .NET templates share their
convention files with [Orkeon](https://github.com/Orkeon/orkeon). Our thanks to their authors.
[`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md) says, file by file, what was taken and under which terms.

## Licence

Orkeon Workshop is released under the [MIT licence](./LICENSE). [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)
lists what comes from elsewhere: material adapted from three MIT-licensed projects, and six devcontainer
files derived from Anthropic's reference devcontainer, whose Anthropic parts are not covered by the MIT
licence. The software the image installs, Claude Code first of all, keeps its own licence; the published
image does not contain Claude Code.

Orkeon Workshop is not affiliated with or endorsed by Anthropic. For Claude Code itself, see its
[documentation](https://code.claude.com/docs/en/overview).
