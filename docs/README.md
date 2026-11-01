# Orkeon Workshop documentation

*English · [Français](./fr/README.md)*

Orkeon Workshop is a container image that turns Claude Code into a workshop for building
[Orkeon](https://github.com/Orkeon/orkeon) agent teams, and for testing, measuring and explaining
them — and, by profile, into a workbench for whoever contributes to Orkeon, develops it, releases it or
keeps its documentation true ([Who does what](./workflows/overview.md)). These pages tell you how to install it, how to use it and how it works, with examples. They are
also published as a site, with a search box: <https://orkeon.github.io/orkeon-workshop/>.

## New here? Discover it by chatting

You do not have to read everything first. Three ways to get a guided tour, in your own language:

| Where | How | Best when |
|---|---|---|
| **In the workshop** | open Claude Code with `workshop`, set your language (`/workshop-language fr`), then type `/orkeon-tour` | you have installed it: the tour shows *your* folder and can build a first team with you |
| **In any Claude chat** | copy the prompt of [Discover with Claude](./discover-with-claude.md) into claude.ai or Claude Desktop | you have not installed anything yet, or you want help installing |
| **On a shared chat page** | open the link the project maintainers share | someone sent you the link |

**Not at ease in English?** In the workshop, type `/workshop-language fr` (or `de`, `es`, `pt-BR`…) before
anything else: Claude then talks with you in your language and writes in it the documents that describe
your teams (need, criteria, test plan, design) — [Your language](./getting-started/install.md#your-language).

## Your role, your workflows

The harness is a set of workflows, one per role; each is a piece that stands alone, and the pieces
chain into how the Orkeon project lives. [Who does what](./workflows/overview.md) shows them together
and says where to start.

| Page | For |
|---|---|
| [Who does what](./workflows/overview.md) | the pieces, who runs each, where, with which profile; one failure followed end to end |
| [Contribute](./workflows/contribute.md) | report a failure reproduced in a workshop, validate a fix on its branch, open a pull request |
| [Develop a feature](./workflows/develop.md) | the dev chain in a checkout: spec, plan, implement test first, verify, batch by batch |
| [Release a version](./workflows/release.md) | the quality report, readiness, install evidence, the tag you push, what reached each channel |
| [Keep the documentation true](./workflows/keep-docs-true.md) | the pages audited against the code, claim by claim, nothing fixed for you |
| [Maintain Orkeon Workshop itself](./workflows/maintain-the-workshop.md) | this project's checks, bilingual docs, image build, and the migration to Orkeon's latest `main` |
| [Measure what a session costs](./workflows/measure.md) | what one session cost and what filled its context |

## Start

| Page | What you will do |
|---|---|
| [Install](./getting-started/install.md) | get the image, create the workshop folder, start the container, open Claude Code — step by step, for Windows and Linux |
| [Your first team](./getting-started/first-team.md) | ask Claude for a small team, look at what it made, run it on a local model, see it in Orkeon Studio |
| [The workshop in VS Code](./getting-started/vs-code.md) | open the same workshop from VS Code instead of a terminal |

## Understand

| Page | What it explains |
|---|---|
| [The workshop](./concepts/workshop.md) | the folder where everything lives, what belongs to you and what the image keeps up to date |
| [Teams](./concepts/teams.md) | what an Orkeon team is made of, and what Orkeon Studio needs to run it |
| [Mount points and mount sets](./concepts/mount-points.md) | the folders a team reads and writes, and how to run it on other folders |
| [How a team gets built](./concepts/process.md) | the step-by-step method: need, test plan, design, tests, build, run, review |
| [Testing a team](./concepts/testing.md) | the five test levels, from free (simulated and local models) to paid (remote models) |

## Do

| Guide | For |
|---|---|
| [A YAML team](./guides/yaml-team.md) | the most common kind of team, generated and checked by the `orkeon-crew` skill |
| [A TypeScript team](./guides/typescript-team.md) | a team that needs custom tools written in code |
| [C# tools](./guides/csharp-tools.md) | Orkeon tools in C#: the templates, plugins, building without network |
| [Models: local and remote](./guides/models.md) | Ollama and the GPU, remote providers, keys, the approval of paid runs |
| [Docker modes and SonarQube](./guides/docker-modes.md) | Docker inside the container, or the host's Docker; the quality stack |
| [Updating](./guides/updating.md) | new versions of Orkeon, Ollama and the image; moving a container |
| [A long autonomous session](./guides/long-session.md) | a `/dev-batches` run through the night: the log, the resume, the supervisor, the host awake |

## Look up

| Reference | Contents |
|---|---|
| [`orkeon-bench`](./reference/orkeon-bench.md) | every command of the harness CLI, with examples |
| [Container options and variables](./reference/configuration.md) | `docker run` options, environment variables, the firewall |
| [The harness](./reference/harness.md) | skills, subagents, hooks, rules, templates, evals, switches, profiles and packs |
| [Profiles](./reference/profiles.md) | who each profile is for, what it changes, in which folder it applies; how to choose one |
| [Troubleshooting](./reference/troubleshooting.md) | what to do when something does not work |
| [FAQ](./faq.md) | short answers: cost, data, GPU, Studio, git, licence… |

## Go deeper

- [Building the image](../.devcontainer/README.md) — build arguments, the Orkeon channels, the
  published image, what a build checks.
- The component READMEs: [the harness](../.devcontainer/harness/README.md),
  [`orkeon-bench`](../.devcontainer/bench/README.md), [the .NET templates](../.devcontainer/csharp/README.md).
- [The Orkeon Workshop plan](./orkeon-workshop-plan.md) — the design document: principles, folder
  trees, process, artefact formats, test strategy, lots and decisions (`D1`, `D2`…).
- [Profiles and contributor packs](./profiles-design.md) — the design of the profiles: packs, profiles, the switch,
  the deployment into a git checkout, and the start-up cost of each profile.

## Where the project stands

The foundation is built and checked: the image, the harness with its guards, the reference
documents, the generator skill `orkeon-crew`, the guided tour, `orkeon-bench`, the .NET templates, and
`orkeon-studio-check`, which reads a team with Orkeon Studio's own code. Every step of the method is a
skill: `/team-init`, `/team-spec`, your validation typed as `/team-approve team <slug>` and recorded by a
hook, `/team-loop` (tests, build, run, review, until the team is accepted), `/team-release`,
`/team-decision` and `/team-status`; `/workshop-language` sets the language Claude talks and writes the
workbooks in, and `/deploy` packs a team into an archive for another workshop. The bench checks `TEAM.md`
on paper before you validate it, opens the attempts, runs the five test levels — static, unit, component
on a simulated model, end to end on the local model, then on a remote one behind your approval —,
evaluates the invariants and indicators, folds in the judges' scores, captures an attempt for review and
releases an accepted team. Profiles let the same image serve
whoever contributes to a repository, develops it, releases it or keeps its documentation true, in a
workshop or in a git checkout: `/workshop-profile` picks the packs of skills a folder gets
([The harness](./reference/harness.md#profiles-and-packs)). Pages mark what is **planned** wherever it
matters.

## Roadmap

The work is cut into lots. The first target was the complete loop — need to accepted team — with a
simulated then a local model, on a YAML pilot team (lots 1 to 7); it is implemented in its second form
(decisions D89 to D95 of 2026-10-30: one document, one gate, every level runnable). The
[plan](./orkeon-workshop-plan.md) details the lots (§ 11) and records the decisions (§ 13).

| Lot | Content | State |
|---|---|---|
| 0 | image, harness skeleton, hooks and evals, `orkeon-bench` base, .NET templates, guided tour | done |
| 1 | reference documents; the tool catalogue regenerated from the real tool schemas | done |
| 2 | `team-init` (with `--adopt` for a prototype), `team-decision`, `team-status`; the `/team-approve` hook | done |
| 3 | `team-spec` — the one upstream document `TEAM.md` and its gate `team` (D89, replaces `team-need`, `team-test-plan`, `team-design`); `orkeon-bench check team` | done; the pilot's `TEAM.md` is being completed |
| 4 | `orkeon-bench`: simulated LLM, run at every level, evaluate, estimate, capture, report, attempts (D91; `datasets build`, `llm-stub record\|replay` and `team rename\|remove` abandoned, D93) | done |
| 5 | `team-tests`: datasets, scenarios, judges | done |
| 6 | `team-build` | done |
| 7 | `team-run`, `team-review`, `team-loop` — the loop until acceptance (D94) | done; the pilot `mail-triage` runs it |
| 8 | C#: `orkeon-tool-csharp`, `orkeon-crew-csharp`, C# teams measured by the bench | partial: the .NET templates, `orkeon-harness-run` and `orkeon-studio-check` |
| 9 | remote models behind the budget gate (`orkeon-bench estimate`, `/team-approve remote`, L4 with its cost); `team-release` and `orkeon-bench release` | done |
| 10 | evals of every skill and hook, complete pilot teams, the documentation brought up to date | to come |
| 11 | profiles and contributor packs: the harness as packs composed into profiles, for a workshop or a git checkout | done |
| 12 | forked skills, agent memory and compaction state: the read-and-report skills run in a subagent of their pack, the auditors keep a memory of the repository, an open batch survives a compaction | done |
| 13 | instruments of the dev pack: the access cost of a batch measured on the syntax tree, a test tied to the rule it proves by a trait the gate checks, an integration suite never run whole, the doctor of a checkout, a latency budget on the hooks, the product run from its checkout and never from the image, a technical entry (`/dev-change`) for a bug, a refactor or a performance change | done |
| 14 | batches in independent agents: `/dev-batches` runs each batch of a plan in a background agent in its own worktree, four at a time by default, the main context orchestrating and alone writing the backlog; the worktrees created by the harness with the repository's shared untracked folders linked; each batch committed and pushed by the harness (D71) | delivered — the image green on Orkeon `main` ad6dc63; the run of two batches at once on a scratch repository remains |

A lot is **done** when the criterion the plan sets for it (§ 11) is met and its proof — tests, evals, a
check on the image — is recorded in § 11.1; **partial** names what is already delivered.
