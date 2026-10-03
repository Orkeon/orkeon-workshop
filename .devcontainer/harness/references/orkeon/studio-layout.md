# Team folder runnable by Orkeon Studio

> Reference document of the Orkeon harness — single copy, deployed to the workshop's `references/orkeon/`
> and read from there by the `orkeon-crew-yaml` and `orkeon-crew-typescript` skills (lot 0; the
> per-skill copies and `check-skill-shared-refs.sh` are gone). Established for Orkeon `main` at 24ab0d0
> (the version the image builds, D32; first written on `1.0.0-rc.4`).
> Sources of truth: `src/apps/Orkeon.Studio.Core/Targets/RunTargetDetector.cs`,
> `src/hosting/Orkeon.Hosting/CrewDirectoryLayout.cs`,
> `src/scripting/Orkeon.Scripting.Cli/Commands/Forge/ForgePromote.cs`,
> `src/apps/Orkeon.Studio.Core/Teams/TeamCatalog.cs`, `Teams/TeamMountPaths.cs`, `FileSystem/DeclaredMounts.cs`,
> `Launch/RunArgumentsBuilder.cs`, `src/apps/Orkeon.Studio.Wpf/ViewModels/Launch/LaunchTabViewModel.cs`
> (re-read for the review of 2026-10-02, V-15).

## The layout to produce

It is the shape `orkeon forge promote` writes — the one Studio lists as a team and
launches without asking any question.

```
<team>/                      # kebab-case name; by default the workshop's teams/<slug>/
├── crew/                    # the team's definition — and NOTHING else
│   ├── config.yaml          #   YAML: crew settings
│   ├── agents/<id>.yaml     #   YAML: one file per agent (file name = id)
│   ├── tasks/<id>.yaml      #   YAML: one file per task (file name = id)
│   │   — or —
│   ├── crew.ork.ts          #   TypeScript: the entry point (exact name)
│   └── tools/index.ts       #   TypeScript: custom tools imported by crew.ork.ts (optional)
├── mounts.json              # the mount points of the team (harness file; Studio ignores it)
├── <one folder per point>   # e.g. input/ → /workspace (read-only), output/ → /output (read-write),
│                            #   each with a .gitkeep (written by orkeon-bench scaffold)
├── .gitignore               # written by orkeon-bench scaffold: the content of those folders stays out of git
├── studio-team.json         # the Studio card: name, description, mounts
├── run.sh                   # POSIX launcher (executable)
├── run.cmd                  # Windows launcher
├── README.md                # goal, agents, tasks, how to launch
├── tsconfig.json            # TypeScript only: type checking in the editor (optional)
└── typings/orkeon.d.ts      # TypeScript only: the DSL typings, if found (optional)
```

`tsconfig.json` and `typings/` stay **outside** `crew/`: they serve the editor, not the runner.

`%USERPROFILE%\Orkeon\teams\` on the Windows host — the workshop's `teams/`, `/workspace/teams/` in the
container — is the root of Studio's team catalogue (`TeamCatalog.DefaultRoot()`, a fixed path: no setting,
variable or option changes it). Studio lists every folder one level below it, whatever it holds — a
folder without a card is still a team, under its folder name — except a folder whose name starts with a
dot and, on Windows, a Hidden or System folder (a card marked `archived` shows only among the archived
teams); there is no file watcher, the list is re-read when "My teams" opens. Elsewhere, Studio launches a folder too (Run → choose the folder); it just does not list it.

## How Studio recognizes the folder

Studio detects the shape from the files, without a manifest (`RunTargetDetector.DetectDirectory`;
`orkeon run <folder>`, for its part, only accepts multi-file YAML layouts: for a script or a single-file
YAML, it wants the path of the file — which is what the launchers pass). **The root of the selected
folder is read first; `crew/` only when the root holds no crew of its own:**

1. At the root, an `agents/` or `tasks/` subfolder (or the flat triplet) ⇒ the folder itself is a
   multi-file YAML crew, and `crew/` is ignored. A team folder holding `agents/` or `tasks/` — the folder
   of a mount point named so included — is therefore taken for the crew, and the run fails (`config.yaml
   (or crew.yaml) not found`).
2. At the root, `crew.ork.ts` ⇒ that script runs; other `*.ork.ts` / `*.ork.js` files ⇒ Studio **asks**
   which one to launch; a script next to a YAML marker ⇒ ambiguous, refused.
3. Otherwise, `crew/` (the layout `orkeon forge promote` writes): the same rules apply inside it, the run
   path descends into `crew/` (`crew` or `crew/crew.ork.ts`) and the **working directory stays the team
   folder** (hence the `./input`, `./output` mounts) — the same command as the launchers.
4. Otherwise, a single `.yaml` (other than `agents.yaml`/`tasks.yaml`) at the root ⇒ single-file crew —
   **Studio only**: `orkeon run <folder>` rejects it ("holds no recognized crew layout") and wants the
   file path. One more reason to produce `config.yaml` + `agents/` + `tasks/`, which both accept.

## Hard rules (otherwise Studio or the CLI rejects the folder)

- **Never a `*.ork.ts` or `*.ork.js` next to a YAML layout** (`agents/`, `tasks/` or the flat triplet):
  `orkeon run` rejects the folder as ambiguous (`Ambiguous crew directory …`), with no precedence, and
  Studio finds no crew in such a `crew/`. Put simply: one format per folder.
- **Never `agents/`, `tasks/` or a `*.ork.ts` at the root of the team** (rule 1 and 2 above): Studio would
  take the team folder for the crew. No mount point is bound to a folder named `agents` or `tasks` either.
- **A mount point reaches its own folder and nothing else** (D40): the folder behind a point is all its
  agents reach through the VFS, so `orkeon-bench`, `check_crew.py` / `check_team.py`, `orkeon-harness-run`
  and the C# host refuse what Studio would let through. A mount point may not use: the team folder itself;
  `crew/`, or a folder named `agents`, `tasks`, `appsettings` or `_shared` at the root of the team; outside
  the team, a folder that holds the team folder, the workshop or the home folder, or that is or lies inside
  the workshop's `settings/`, `workbooks/`, `tests/`, `.claude/`, `library/`, `references/`, `.devcontainer/`
  or `.git/`, an `appsettings/` or `_shared/` folder above the team, a hidden folder of the home folder
  (`~/.config`, `~/.claude`, `~/.ssh`…), the user's `AppData`, `/proc`, or another team's folder or mount
  set. A `/plugins` mount point is read-only. Any other folder outside the team passes with a warning: Orkeon
  Studio launches the team only when that folder is declared, spelled exactly, in its Authorized folders.
  The Windows spellings of these folders (`C:\Users\<you>\Orkeon\settings`, `C:\Users\<you>\.claude`,
  `C:\Users\<you>\AppData\…`) are refused the same way. Paths are judged as written: a symbolic link is not
  followed, and a folder name ending with a dot or a space is refused, since Windows drops them (`./crew.` is
  `crew/` there; `reliability/security.md` § 8).
- **No mixing** `agents.yaml` + `agents/` (exception at load time).
- If `agents.yaml` or `tasks.yaml` exists, the flat triplet `crew.yaml` + `agents.yaml` + `tasks.yaml`
  must be complete. We do not produce that triplet: we produce `config.yaml` + `agents/` + `tasks/`.
- The **file name (without `.yaml`) is the id** of the agent or task; that id is what
  `agent:`, `dependencies:` and `managerAgent:` refer to. Ids in `snake_case` or `kebab-case`,
  ASCII, no spaces.
- The files in `agents/` and `tasks/` are read **non-recursively**, in alphabetical order.
- Convention (avoids any question from Studio and any doubt): in a script's `crew/`, only
  `crew.ork.ts` carries the `.ork.ts` suffix; helper modules are `*.ts` files under `tools/`.
- **No API key on disk.** In Studio the model comes from Studio's own settings
  (`%APPDATA%\Orkeon\appsettings.json`, edited in Settings) or, when the card names a `profile` that
  exists in Studio's `studio-model-profiles.json`, from that profile, passed as the variables
  `ORKEON_Llm__Model`, `ORKEON_Llm__BaseUrl`, `ORKEON_Llm__ApiKey` (read from the variable the profile
  names)…; Studio writes `profile` only when its wizard adopts a team — for a team made in the workshop,
  write it in the card by hand. In the container, the launchers read the team's settings file (below),
  else the global file written by `orkeon init`.
- **No settings file in the team folder** (D33): no `appsettings*.json` at its root (Orkeon reads it beneath
  the settings of every run started from the team folder — the launchers and Studio, `--settings` or not)
  nor in `crew/` (an agent reads `/crew` with `file_read`, and Orkeon
  picks it instead of the machine's file for every run that names no settings file), no `appsettings/` or
  `_shared/` folder. A team that needs settings of its own — a mailbox, another model — keeps them in
  `settings/<slug>/appsettings.json` of the workshop: the launchers, `orkeon-harness-run` and the bench pass it
  with `--settings`; Studio does not read it — it passes no `--settings` unless an Expert pins a file in
  Run › Advanced options, for the whole form and until Studio closes; a mail account put in Studio's own settings
  instead is visible to every team Studio launches. Start it from a copy of the
  machine file (which the image writes with the local model's `Llm` and `RateLimiting` sections), or
  `orkeon init --provider ollama --model qwen3:8b --path ../../settings/<slug>/appsettings.json --no-probe`
  from the team folder — name the model the machine file uses: without `--model`, `orkeon init` writes
  `llama3.2`, which the image does not pull — then add `"TimeoutSeconds": 600` to its `Llm` section (it
  writes `Model` and `BaseUrl` only) and `"RateLimiting": { "MaxConcurrentRequests": 1, "QueueLimit": 32 }`
  for a local model: Orkeon reads it **instead of** the machine file, so it carries the whole `Llm` section —
  and, for a local model, one request at a time.

## `studio-team.json`

Card read by Studio (`StudioTeamMetadata`). Only these fields are written at creation:

```json
{
  "name": "Technology watch",
  "description": "The need, in the user's own words.",
  "mounts": ["./input:/workspace:ro", "./output:/output:rw"]
}
```

- `mounts`: `physical:virtual:access` strings, one per mount point of the team; a physical path
  that starts with `./` is relative to the team folder. Studio resolves them to absolute folders under
  the team and passes them under one `--mount` at each launch (an entry that matches a declaration of its
  settings carrying an id goes as `--mount-id`); a bare `orkeon run` in a terminal does not read them —
  that is the launchers' job. In the workshop, `orkeon-bench scaffold` writes them from the team's
  `mounts.json`.
- **Which folders Studio accepts** (V-12, V-15; `DeclaredMounts.BlockingFolders`): a `./<folder>` inside
  the team (one or more segments, never `..`; `./` alone — the team folder itself — is refused), an
  absolute folder under the team (the spelling of older cards — the team folder itself included: Studio
  refuses only the `./` spelling, the harness's checks refuse every spelling), or a folder declared in
  Settings › Authorized folders (`Orkeon:FileSystem:Mounts` of `%APPDATA%\Orkeon\appsettings.json`, or of
  the settings file an Expert pinned), compared on the physical folder only and spelled exactly
  (`C:/x` is not `C:\x`). Any other folder, or an unreadable entry, makes Studio refuse the launch. Its
  wizard names the folder of `/workspace` `input` and the folder of any other root after the root.
  This is why the default folders of a team stay inside it, and why the mount sets
  `mounts.<name>/<slug>/` of the workshop serve the launchers and the bench, never Studio.
- **A missing folder is not created**: Studio creates the team's folders only when it writes the card,
  and `orkeon run` refuses a mount whose folder does not exist. Git keeps no empty folder: the `.gitkeep`
  that `orkeon-bench scaffold` leaves in each one keeps a cloned workshop launchable.
- **How Studio reads it**: default JSON options — names are case-sensitive (`"Name"` is ignored), a
  comment or a trailing comma makes the file invalid, unknown keys are skipped, and a wrong type (an
  object in `mounts`) makes Studio ignore the whole card silently: the team then launches **without any
  mount point**. After every real run Studio rewrites the card (`lastRunAt`): it writes nulls, escapes
  accents and drops unknown keys — expect a diff if the workshop is under git.
- `profile` (name of a Studio model profile) and `schedule` (`daily@HH:mm` / `hourly`): only if
  the user gives them. Studio only displays `schedule`: installing it needs the `forge.json` of a team its
  wizard adopted. `archived`, `archivedAt` (new on `main`), `lastRunAt`, `addedAt`: never — Studio
  maintains them itself.

## What Studio's actions do to a workshop team

Studio knows the team folder only; the workshop keys what goes with a team by its slug (`workbooks/`,
`tests/`, `settings/`, `mounts.<name>/`, D28, D29, D33):

- **Rename** moves the team folder alone: the workbook, the tests, the settings and the mount sets stay
  under the old slug, and the launchers, which find the settings and the sets by the folder name, no
  longer see them. **Duplicate** makes `<slug>-copy` without them; **Delete** removes the team folder
  only. Move them by hand, or with `orkeon-bench team rename|remove` once it exists (D39).
- **Modify** (a YAML team) writes a `forge.json` and, once re-adopted, regenerates `crew/` and the
  launchers: run `orkeon-bench scaffold <team>` again afterwards.

## Checking a team as Studio does

In the image, `orkeon-studio-check [--authorized <appsettings.json>] [<team folder or slug>...]` runs Orkeon
Studio's own code (`Orkeon.Studio.Core`, packed from the same commit as the CLI) against the teams of the
workshop — every team of `$ORKEON_WORKSHOP/teams` without an argument; exit 0 when every team passes, 1 when
one fails, 2 on a usage error. It reads the card as Studio parses it, the crew Studio would run and from
where, the mount points Studio would refuse (with the Authorized folders of the given settings file — its
`Orkeon:FileSystem:Mounts`, read case-sensitively as Studio reads it; none by default) or find missing, an
archived card and unknown mount ids, and compares them with what the launchers written by `orkeon-bench
scaffold` bind (it never reads `run.sh` or `run.cmd`). `check_crew.py` and `check_team.py` call it when it is
on the PATH: a problem line "Studio refuses to launch the team because of …" (a folder outside the team that
the Authorized folders do not declare) is a warning there — they are the user's to set —, "Studio always
refuses …" (an entry Studio cannot read, or a `./` entry naming no single folder) and every other problem an
error. Its limits: in the container paths compare case-sensitively where Studio on Windows does not, the
Windows attributes Hidden and System are not read, and a Windows path of the card counts as refused unless
`--authorized` spells it.

## Virtual mounts (VFS)

Agents never see a disk path: they address virtual paths.

| Root | Content | Access | Mounted by |
|---|---|---|---|
| the team's mount points (`/mailbox`, `/reports`… — `/workspace` and `/output` in the generic scheme) | what the team reads and writes, one folder each | as declared: `ro`, `rw`, `rwnd` | launcher / `studio-team.json` |
| `/crew` | the YAML crew's folder (`crew/`) | read | the runner, always |
| `/script` | the `.ork.ts` script's folder (`crew/`) | read | the runner, always |

Reserved to the runner, **forbidden** as a user mount or as a deliverable path: `/crew`,
`/script`, `/llm-logs`, `/sandbox`, `/credentials`.

Fixed data shipped with the team (template, list of sources…) goes in `crew/` and is read as
`/crew/<file>` (YAML) or `/script/<file>` (TypeScript). Data that changes from one launch to
the next goes in the folder of a read-only mount point and is read through its virtual path.

Do not write a `mounts:` block in `config.yaml`: it resolves against entries of the settings file,
which the generated team does not have; the mounts go through the launchers and the card.

## Launchers

Taken from `ForgePromote.cs`: they resolve symbolic links, move into the team folder
(the runner rejects a crew outside the working directory) and mount the folder of every mount
point. In the workshop they are written by `orkeon-bench scaffold` from `mounts.json`, and
`TEAM_ENV=<name>` binds the mount set `mounts.<name>/<slug>/` of the workshop instead.
Extra arguments are passed through (`./run.sh --validate`, `./run.sh -v 2`).
Several mounts follow **a single** `--mount` (a repeated option = rejected by the parser).
`run.sh` must be executable (`chmod +x`), and `100755` if it is under version control.

## Verify

```bash
cd <team> && ./run.sh --validate        # expected (after a "Using settings: …" line):
                                        # "VALIDATION OK: … (agents=N, tasks=M, tools resolved=K)"
orkeon run --list-tools                 # actual catalogue of the tools resolvable by name
```

Each skill also ships a static check (`scripts/check_crew.py` / `scripts/check_team.py`) for
what `--validate` lets through; it runs **before** `--validate`.

`--validate` loads the definition and resolves the tools (strict resolution: an unknown name fails)
without calling an LLM or running a task. It does **not** check the external keys
(`ORKEON_TAVILY_API_KEY`, e-mail accounts…): a tool that depends on them passes validation and fails at run time.
