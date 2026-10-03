# A YAML team

*English · [Français](../fr/guides/yaml-team.md)*

YAML is the default format of an Orkeon team: a few readable files, nothing to compile. The workshop's
`orkeon-crew-yaml` skill designs and writes such a team in a folder Orkeon Studio runs as it is, then
checks it.

## Ask for it

Describe the need in your own words; mention YAML only if you want to be sure of the format:

```text
Make me an agent team that reads the PDF invoices of a folder, extracts supplier, date and amount,
and writes a CSV summary.
```

```text
Create a YAML team for a weekly technology watch on Rust: search the web, keep the 10 most relevant
articles, write a digest in Markdown.
```

```text
A team that triages the mails of a folder into urgent / normal / spam, remembers what it has already
triaged, and writes a report.
```

The more you say about **what it reads, what it writes and what a good result looks like**, the less
the skill has to guess. It asks a question only when the need itself is unclear; otherwise it picks
sensible defaults and lists them in its report.

## What the skill decides

| Decision | How |
|---|---|
| title and slug | from the need: *Technology watch*, `tech-watch` |
| target folder | `teams/<slug>/`; if it already exists, `teams/<slug>-2/` — it never overwrites a team |
| mount points | the folders you named, else those of the team's `NEED.md`/`DESIGN.md`, else one per kind of content (`/invoices` read-only, `/reports` written…), else a proposed scheme — [Mount points](../concepts/mount-points.md) |
| deliverable | the file the team produces, under a writable mount point, with its format and structure |
| process | `sequential` unless the need calls for another mode (a manager that reviews, a parallel fan-out…) |
| agents | 2 to 5, each with a concrete role, goal and backstory, and only the tools it needs, taken from Orkeon's catalogue |
| tasks | one per step, each naming the virtual paths and tools it uses, the last one carrying the deliverable |
| prerequisites | keys and accounts the tools need (`ORKEON_TAVILY_API_KEY` for `web_search`, an e-mail account…) — listed in the README, never written to disk |

## What it writes

```text
teams/tech-watch/
├── mounts.json              the mount points
├── crew/config.yaml         the team: name, goal, process
├── crew/agents/<id>.yaml    one file per agent
├── crew/tasks/<id>.yaml     one file per task
├── studio-team.json         the Studio card
├── README.md                goal, agents, tasks, mount points, prerequisites, how to launch
├── run.sh, run.cmd          written by orkeon-bench scaffold
├── .gitignore               written by orkeon-bench scaffold: what the team reads and writes stays out of git
└── <one folder per mount point, each with a .gitkeep>
```

Example inputs, when you give none, go into a read-only folder as `*.example.md` files — delete them
before a real run.

## How it checks the team

Two checks, rerun until both are clean:

```bash
python3 .claude/skills/orkeon-crew-yaml/scripts/check_crew.py teams/tech-watch --orkeon orkeon
cd teams/tech-watch && ./run.sh --validate
```

They end like this — the counts depend on the team:

```text
OK: 3 agent(s), 3 task(s), 0 error(s), 0 warning(s)
VALIDATION OK: /workspace/teams/tech-watch/crew (agents=3, tasks=3, tools resolved=4)
```

`check_crew.py` covers what Orkeon's own validation does not see: the Studio layout, the folders, a
card or launchers that disagree with `mounts.json`, a deliverable outside the writable mount points,
unknown keys, ids (`agent:`, `dependencies:`) that name nothing, values out of range, a mount point bound
to a folder the team's agents must never reach, a team settings file holding a secret or a machine-wide
setting, a settings file above the crews, and `shell_command` (warned; refused in a team with a mail
account); in the image it also runs `orkeon-studio-check`, Studio's own reading of the team. `--validate`
loads the team in Orkeon and resolves every tool, without calling a model.
Neither check verifies external keys: a tool that needs a missing key fails at run time, hence the
prerequisites in the README.

The skill never runs the team for real on its own — a run calls a model. Run it yourself
(`./run.sh`), or ask for it.

## What YAML can do that TypeScript cannot

`guardrails` (an agent's, rendered before its task's), a task's sampling in `llmOverride` (temperature,
tokens, thinking — TypeScript can only move a task to a named profile), `graphConfig` (the `graph`
process) and `memoryProvider` exist in YAML only. An agent's or the crew's `llm` is applied too. A task's
`circuitBreaker` no longer exists: Orkeon refuses the crew at load, and the graph is tuned with
`graphConfig`. If your team needs custom tools written in code, see
[A TypeScript team](./typescript-team.md); for heavy tools or I/O, [C# tools](./csharp-tools.md).

## Changing a team

Ask Claude in plain words — *"add an agent that checks the sources"*, *"write the digest in French"*,
*"also read `/archive`"*. When the mount points change, `mounts.json` changes and
`orkeon-bench scaffold <team>` runs again so that the launchers and the card follow; the checks run
again too.

A few rules keep the folder valid — the skill and its check enforce them:

- one format per folder: never a `*.ork.ts` next to a YAML crew;
- no `agents/` or `tasks/` folder at the root of the team (they belong in `crew/`);
- the file name of an agent or a task is its id, which `agent:` and `dependencies:` refer to;
- no `mounts:` block in `config.yaml` — mounts go through `mounts.json`, the launchers and the card;
- no API key anywhere in the folder.

Next: [A TypeScript team](./typescript-team.md).
