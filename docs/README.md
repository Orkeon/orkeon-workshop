# Orkeon Workshop documentation

*English · [Français](./fr/README.md)*

Orkeon Workshop is a container image that turns Claude Code into a workshop for building
[Orkeon](https://github.com/Orkeon/orkeon) agent teams, and for testing, measuring and explaining
them. These pages tell you how to install it, how to use it and how it works, with examples.

## New here? Discover it by chatting

You do not have to read everything first. Three ways to get a guided tour, in your own language:

| Where | How | Best when |
|---|---|---|
| **In the workshop** | open Claude Code with `workshop`, then type `/orkeon-tour` | you have installed it: the tour shows *your* folder and can build a first team with you |
| **In any Claude chat** | copy the prompt of [Discover with Claude](./discover-with-claude.md) into claude.ai or Claude Desktop | you have not installed anything yet, or you want help installing |
| **On a shared chat page** | open the link the project maintainers share | someone sent you the link |

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
| [A YAML team](./guides/yaml-team.md) | the most common kind of team, generated and checked by the `orkeon-crew-yaml` skill |
| [A TypeScript team](./guides/typescript-team.md) | a team that needs custom tools written in code |
| [C# tools](./guides/csharp-tools.md) | Orkeon tools in C#: the templates, plugins, building without network |
| [Models: local and remote](./guides/models.md) | Ollama and the GPU, remote providers, keys, the approval of paid runs |
| [Docker modes and SonarQube](./guides/docker-modes.md) | Docker inside the container, or the host's Docker; the quality stack |
| [Updating](./guides/updating.md) | new versions of Orkeon, Ollama and the image; moving a container |

## Look up

| Reference | Contents |
|---|---|
| [`orkeon-bench`](./reference/orkeon-bench.md) | every command of the harness CLI, with examples |
| [Container options and variables](./reference/configuration.md) | `docker run` options, environment variables, the firewall |
| [The harness](./reference/harness.md) | skills, subagents, hooks, rules, templates, evals, switches |
| [Troubleshooting](./reference/troubleshooting.md) | what to do when something does not work |
| [FAQ](./faq.md) | short answers: cost, data, GPU, Studio, git, licence… |

## Go deeper

- [Building the image](../.devcontainer/README.md) — build arguments, the Orkeon channels, the
  published image, what a build checks.
- The component READMEs: [the harness](../.devcontainer/harness/README.md),
  [`orkeon-bench`](../.devcontainer/bench/README.md), [the .NET templates](../.devcontainer/csharp/README.md).
- [The Orkeon Workshop plan](./orkeon-workshop-plan.md) — the design document: principles, folder
  trees, process, artefact formats, test strategy, lots and decisions (`D1`, `D2`…).

## Where the project stands

The foundation is built and checked (lots 0 and 1): the image, the harness with its guards, the reference
documents, the generator skills, the guided tour, `orkeon-bench` (status, mounts, launchers, profiles,
report validation, the tool catalogue), the .NET templates, and `orkeon-studio-check`, which reads a team
with Orkeon Studio's own code. The first steps of the method are driven by skills (lot 2): `/team-init`,
`/team-need`, `/team-decision`, `/team-status`, and your approvals, typed as `/team-approve …` and
recorded by a hook. The bench opens the attempts and runs a team's static checks and its component scenarios on
a simulated model (the start of lot 4). The skills of the later steps, and the bench commands that run a
team on a local then a remote model and score it, come next. Pages mark what is **planned** wherever it
matters.

## Roadmap

The work is cut into lots. The first target is the complete loop — need to accepted team — with a
simulated then a local model, on a YAML pilot team (lots 1 to 7). The
[plan](./orkeon-workshop-plan.md) details the lots (§ 11) and records the decisions (§ 13).

| Lot | Content | State |
|---|---|---|
| 0 | image, harness skeleton, hooks and evals, `orkeon-bench` base, .NET templates, guided tour | done |
| 1 | reference documents; the tool catalogue regenerated from the real tool schemas | done |
| 2 | `team-init` (with `--adopt` for a prototype, and the light track), `team-need`, `team-decision`, `team-status`; the `/team-approve` hook | done (the pilot's need is written; its approval by the project owner is pending) |
| 3 | `team-test-plan`, `team-design` | to come (templates and checklists ready) |
| 4 | `orkeon-bench`: datasets, simulated LLM, run, evaluate, report, attempts; orphans and `team rename\|remove` | partial: `scaffold`, `status`, `mounts`, `profile`, `report validate`, `tools dump`, `doctor`, `attempt open\|close\|approve`, `llm-stub serve`, `run` up to the component level with the simulated model |
| 5 | `team-tests`: datasets, scenarios, judges | to come |
| 6 | `team-build` | partial: the generators write a team and its launchers through `scaffold` |
| 7 | `team-run`, `team-review`, the loop until acceptance | to come (the `run-gate` hook ready) |
| 8 | C#: `orkeon-tool-csharp`, `orkeon-crew-csharp`, C# teams measured by the bench | partial: the .NET templates, `orkeon-harness-run` and `orkeon-studio-check` |
| 9 | remote models behind the budget gate; `team-release` | to come (the remote rule of the budget gate, `run-gate`, ready) |
| 10 | evals of every skill and hook, complete pilot teams, the documentation brought up to date | to come |

A lot is **done** when the criterion the plan sets for it (§ 11) is met and its proof — tests, evals, a
check on the image — is recorded in § 11.1; **partial** names what is already delivered.
