# Your first team

*English · [Français](../fr/getting-started/first-team.md)*

A worked example, from a sentence to a team that runs on a local model and shows up in Orkeon Studio.
It assumes the container is running and Claude Code is open in the workshop ([Install](./install.md)).

## 1. Ask for it

In Claude Code, describe what the team should do, in your own words:

```text
Create a YAML team that reads the note topic.md that I put in a folder and writes a one-line digest
of it into a report.
```

That request triggers the `orkeon-crew-yaml` skill. Without asking you anything unless the need is
unclear, it:

1. reads the Orkeon reference documents of the workshop (`references/orkeon/`);
2. decides the **mount points** — the folders the team sees — from your need: `/notes`, read-only,
   for what it reads, and `/reports`, writable, for what it produces
   ([Mount points](../concepts/mount-points.md));
3. writes the team into `teams/notes-digest/`;
4. runs `orkeon-bench scaffold notes-digest`, which writes the launchers, the Studio card and the folders
   from the mount points;
5. checks the folder (`check_crew.py`) and has Orkeon load it (`./run.sh --validate`) — nothing that
   costs money: no model is called.

## 2. Look at what it made

```text
teams/notes-digest/
├── crew/
│   ├── config.yaml          the team: its name, goal and process
│   ├── agents/writer.yaml   one agent
│   └── tasks/digest.yaml    one task, and the deliverable it writes
├── mounts.json              the mount points
├── studio-team.json         the card Orkeon Studio reads
├── run.sh, run.cmd          the launchers (Linux/container, Windows)
├── README.md                how to use the team
├── .gitignore               keeps what the team reads and writes out of git
├── notes/                   the folder behind /notes (with a .gitkeep)
└── reports/                 the folder behind /reports (with a .gitkeep)
```

The files of a minimal version of this team — Claude's will differ in names, wording and number of agents
(two to five), not in layout.
`mounts.json`, the single source of the mount points:

```json
{
  "version": 1,
  "mounts": [
    { "root": "/notes", "access": "ro", "role": "inputs", "default": "./notes", "description": "The notes to digest" },
    { "root": "/reports", "access": "rw", "role": "deliverables", "default": "./reports", "description": "The digest" }
  ]
}
```

```yaml
# crew/config.yaml
name: notes-digest
goal: "Digest the notes of a folder in one line"
process: sequential
```

```yaml
# crew/agents/writer.yaml
role: "Note writer"
goal: "Read the note file and write a one-line digest"
backstory: |
  Careful writer. Reads the input file before writing.
tools: [file_read]
allowDelegation: false
maxIter: 4
```

```yaml
# crew/tasks/digest.yaml
description: |
  Read /notes/topic.md with file_read, then write a one-line digest of it.
expectedOutput: "One line."
agent: writer
deliverable:
  path: /reports/note.md
  source: final_message
  format: markdown
```

The agent sees `/notes` and `/reports`, never your disk: Orkeon binds each mount point to a real
folder when the team runs. `orkeon-bench scaffold` printed what it did:

```text
notes-digest: yaml crew, launchers start crew
wrote run.sh, run.cmd, studio-team.json, .gitignore
mounts: ./notes:/notes:ro ./reports:/reports:rw
created notes/ reports/
```

and the checks ended with:

```text
OK: 1 agent(s), 1 task(s), 0 error(s), 0 warning(s)
VALIDATION OK: /workspace/teams/notes-digest/crew (agents=1, tasks=1, tools resolved=1)
```

## 3. Run it

Put a note in the `notes` folder — from Windows, it is `%USERPROFILE%\Orkeon\teams\notes-digest\notes\`;
name it `topic.md`. Then, in a terminal of the container:

```bash
cd /workspace/teams/notes-digest
./run.sh
```

The team runs on the model of the container's Orkeon settings: the local Ollama model by default,
which is free and stays on your machine — and slower than a remote model, especially without a GPU.
When it ends, the digest is in `reports/note.md`.

> The launcher passes extra arguments to `orkeon run`: `./run.sh --validate` only loads the team,
> `./run.sh -v 2` is more verbose.

## 4. Run it on other folders: a mount set

To try the team on other notes without touching its own folders, create a **mount set** — one folder
per mount point, under `mounts.<name>/<team>/` of the workshop (`run.sh` creates the writable ones itself,
so only `notes/` is needed here):

```bash
mkdir -p /workspace/mounts.test/notes-digest/notes
cp ~/some-other-note.md /workspace/mounts.test/notes-digest/notes/topic.md
TEAM_ENV=test ./run.sh
```

The digest lands in `mounts.test/notes-digest/reports/note.md`; the team's own `notes/` and `reports/`
are untouched. A set that does not exist is refused with a clear message:

```text
run.sh: no mount set 'nope' for this team: /workspace/mounts.nope/notes-digest does not exist
```

## 5. See it in Orkeon Studio

On Windows, Orkeon Studio lists every folder of `%USERPROFILE%\Orkeon\teams`: **Notes digest** is
there the next time you open "My teams", with the description of its card. Studio runs the team on its own
folders (`notes/`, `reports/`); mount sets are for the launchers. It runs it on **Studio's** model
settings, not on the container's: configure a model in Studio (Settings), or name one of Studio's model
profiles in the card (`"profile": "<name>"` in `studio-team.json`). In the container,
`orkeon-studio-check notes-digest` reads the team with Studio's own code and says whether Studio would
list and launch it as its launchers do.

## 6. Change it

Ask Claude, in plain words: *"make the digest three lines with a title"*, *"also read the notes in
`/archive`"*. When the mount points change, Claude updates `mounts.json` and runs
`orkeon-bench scaffold` again, so that the launchers and the card follow.

## What this example skipped

This was the quick path, a **prototype**: a generator skill, a validation and a run — nothing proves yet
that the team does what you need. For a team you will rely on, the workshop's method writes the need down,
defines what "done" means and writes the tests **before** the team —
[How a team gets built](../concepts/process.md) and [Testing a team](../concepts/testing.md). The `team-*`
skills that drive that method step by step are planned, and will let a prototype like this one join it
(`/team-init --adopt notes-digest`); until then Claude can follow the method by hand with the templates of
the workshop.

Next: [The workshop](../concepts/workshop.md), or [A YAML team](../guides/yaml-team.md) for more of
what the generator does.
