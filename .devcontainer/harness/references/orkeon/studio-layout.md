# Team folder runnable by Orkeon Studio

> Reference document of the Orkeon harness — single copy, deployed to the workshop's `references/orkeon/`
> and read from there by the `orkeon-crew-yaml` and `orkeon-crew-typescript` skills (lot 0; the
> per-skill copies and `check-skill-shared-refs.sh` are gone). Established on Orkeon main at 80fdefe
> (2026-10-06, after 1.0.0-rc.4) — the version the image builds, D32; first written on `1.0.0-rc.4`.
> Sources of truth: `src/apps/Orkeon.Studio.Core/Targets/RunTargetDetector.cs`,
> `src/hosting/Orkeon.Hosting/CrewDirectoryLayout.cs`,
> `src/scripting/Orkeon.Scripting.Cli/Commands/Forge/ForgePromote.cs`, `Forge/ForgeRename.cs`,
> `src/core/Orkeon.Domain/FileSystem/TeamLauncherScript.cs`,
> `src/apps/Orkeon.Studio.Core/Teams/TeamCatalog.cs`, `Teams/TeamMountPaths.cs`, `Teams/TeamLaunchers.cs`,
> `Teams/TeamsRootLocator.cs`, `Teams/WorkshopLayout.cs`, `Teams/WorkshopSiblings.cs`, `Teams/TeamSettingsFile.cs`,
> `Launch/TeamFolderPreparation.cs`, `FileSystem/DeclaredMounts.cs`, `Launch/RunArgumentsBuilder.cs`,
> `Profiles/HostLlmProfiles.cs`, `Profiles/ModelProfile.cs`,
> `src/apps/Orkeon.Studio.Wpf/ViewModels/Launch/LaunchTabViewModel.cs`, `ViewModels/Shell/MainWindowViewModel.cs`,
> `ViewModels/Teams/TeamsViewModel.cs`, `ViewModels/Config/ModelProfilesViewModel.cs`,
> `ViewModels/Config/StudioSettingsViewModel.cs` (re-read on 2026-10-06 at fb26364, V-15); for the E-mail
> settings tab that came with 4956aab, `Configuration/EmailSection.cs`, `Configuration/EmailSecretNames.cs`,
> `Email/EmailCliClient.cs`, `Validation/EmailAccountRules.cs`, `Validation/EmailTwinKeys.cs`, `Llm/ApiKeyStore.cs`,
> `ViewModels/Config/ConfigTabViewModel.cs`, `ViewModels/Config/SettingsLocationViewModel.cs` (read on 2026-10-07).

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
├── run.sh                   # POSIX launcher (executable) — Studio leaves it as it is (below)
├── run.cmd                  # Windows launcher — likewise
├── README.md                # goal, agents, tasks, how to launch
├── tsconfig.json            # TypeScript only: type checking in the editor (optional)
└── typings/orkeon.d.ts      # TypeScript only: the DSL typings, if found (optional)
```

`tsconfig.json` and `typings/` stay **outside** `crew/`: they serve the editor, not the runner.

Studio's team catalogue is one folder, its **teams root** (`TeamsRootLocator`, STUDIO-61), chosen once at
startup — a change applies at the next start — from, in this order: the variable `ORKEON_STUDIO_TEAMS_ROOT`;
the `--teams-root <folder>` option of the Studio application; the « Teams folder » card of Settings › Studio
(kept in Studio's own `ui-preferences.json`, never in `appsettings.json`: there is no `Orkeon:Studio` key);
the default `%USERPROFILE%\Orkeon\teams` (`TeamCatalog.DefaultRoot()`). Only an absolute path counts — a
relative or blank value is skipped, and the card says so —, and the folder need not exist. The card names
the source in force (« set by ORKEON_STUDIO_TEAMS_ROOT », « set by --teams-root », « chosen here »,
« default ») and its « Change… » button is off while the variable or the option holds the root; the run TUI
`orkeon-studio-run` reads the variable only. Pointed at the workshop's `teams\` — `/workspace/teams/` in the
container —, the root makes a workshop folder anywhere on the Windows host Studio's catalogue; a workshop
that is `%USERPROFILE%\Orkeon` needs nothing. Studio takes the root for a **workshop** when `settings/` and
`workbooks/` both exist beside it (`WorkshopLayout.IsWorkshop`): the team settings file and the actions
below depend on it. Studio lists every folder one level below the root, whatever it holds — a
folder without a card is still a team, under its folder name — except a folder whose name starts with a
dot and, on Windows, a Hidden or System folder (a card marked `archived` shows only among the archived
teams); there is no file watcher, the list is re-read when "My teams" opens. Elsewhere, Studio launches a folder too (Run → choose the folder); it just does not list it.

## How Studio recognizes the folder

Studio detects the shape from the files, without a manifest (`RunTargetDetector.DetectDirectory`), and
`orkeon run <folder>` reads a folder in the same order (`CrewDirectoryLayout.Inspect`). **A `crew/`
sub-folder that holds a crew is the crew, whatever the root holds (STUDIO-59); the root of the selected
folder is read only when `crew/` holds none:**

1. `crew/` (the layout `orkeon forge promote` writes), probed first and one step down only — never
   `crew/crew/` from the team folder: rules 2 to 4 apply inside it, the run path descends into `crew/`
   (`crew` or `crew/crew.ork.ts`) and the **working directory stays the team folder** (hence the `./input`,
   `./output` mounts) — the same command as the launchers. What the root also carries is set aside, never
   read as a crew: an `agents/` or `tasks/` folder — the folder of a mount point named so — and a root
   `*.ork.ts` / `*.ork.js`. Studio names them on an information line of the launch validation
   (`STUDIO-TARGET-ROOT-SHADOWED`); the CLI says nothing. A `crew/` that resolves to no crew — empty,
   ambiguous, several scripts without a `crew.ork.ts` — leaves the root under the rules below.
2. At the root, an `agents/` or `tasks/` subfolder (or the flat triplet) ⇒ the folder itself is a
   multi-file YAML crew.
3. At the root, `crew.ork.ts` ⇒ that script runs; other `*.ork.ts` / `*.ork.js` files ⇒ Studio **asks**
   which one to launch; a script next to a YAML marker ⇒ ambiguous, refused.
4. Otherwise, a single `.yaml` (other than `agents.yaml`/`tasks.yaml`) at the root ⇒ single-file crew —
   **Studio only**: `orkeon run <folder>` rejects it ("holds no recognized crew layout") and wants the
   file path. One more reason to produce `config.yaml` + `agents/` + `tasks/`, which both accept.

The CLI's rule is the narrower one: `orkeon run <folder>` accepts multi-file YAML layouts only, at the root
or in a `crew/` holding `agents/`, `tasks/` or the flat triplet; for a script or a single-file YAML — in
`crew/` too, which Studio resolves — it wants the path of the file, which is what the launchers pass. So
`orkeon run <team folder>` loads the `crew/` of a YAML team (it was refused before fb26364), without the
launchers' mounts or settings file, its settings looked up from `crew/` (`cli.md` § 5): a team is still
launched by its launchers. The one step down applies to the launchers' own `orkeon run crew` as well:
`crew/crew/` is probed first, and a `crew/crew/` folder that is itself a YAML crew would be what runs.

## Hard rules (otherwise Studio or the CLI rejects the folder)

- **Never a `*.ork.ts` or `*.ork.js` next to a YAML layout** (`agents/`, `tasks/` or the flat triplet):
  `orkeon run` rejects the folder as ambiguous (`Ambiguous crew directory …`), with no precedence, and
  Studio finds no crew in such a `crew/`. Put simply: one format per folder.
- **Never a `*.ork.ts` or `*.ork.js` at the root of the team, never a crew in `crew/crew/`** (rule 1
  above): with a crew in `crew/` the root script is set aside and never runs, without one it becomes the
  crew; a `crew/crew/` that is a YAML crew runs in place of the team's. The check scripts refuse a root
  script, and `check_crew.py` a crew in `crew/crew/`. A root folder named `agents` or
  `tasks`, on the other hand, is free: it is the folder of a mount point, never the crew.
- **A mount point reaches its own folder and nothing else** (D40): the folder behind a point is all its
  agents reach through the VFS, so `orkeon-bench`, `check_crew.py` / `check_team.py`, `orkeon-harness-run`
  and the C# host refuse what Studio would let through. A mount point may not use: the team folder itself;
  `crew/`, or a folder named `appsettings` or `_shared` at the root of the team; outside
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
- **No API key on disk.** In Studio every model setting (Settings › model, stored in
  `studio-model-profiles.json` next to `%APPDATA%\Orkeon\appsettings.json`) is a host LLM profile:
  Studio mirrors it into `Llm:Profiles:<id>` of its settings file — the id is the setting's name through
  Orkeon's folder-name rule (`FolderSlug`: lowercase ASCII, dashes) —, the entry naming the variable that
  holds the key (`ApiKeyEnvVar`), never the key; and **every** launch carries every setting as
  `ORKEON_Llm__Profiles__<id>__*`, keys included, so a crew that writes `llm: { profile: <id> }` finds it
  (the check scripts want a named profile defined in the team's settings file). The team's default model is the elected
  setting (the `Llm` section of Studio's settings) or, when the card's `profile` names a setting — its
  display name, compared exactly, not its id — that setting, laid over the run as `ORKEON_Llm__*`, every
  field it models set or blanked (`Model`, `BaseUrl`, `ApiKey`, `ApiKeyEnvVar`, `TimeoutSeconds`…) so
  the default's key never reaches its endpoint; a name Studio does not know runs on the default. Studio
  writes `profile` when its wizard adopts a team, and rewrites it when that setting is renamed in Studio
  (STUDIO-52) — for a team made in the workshop, write it in the card by hand, knowing that it lays that
  setting over the team's settings file (below). In the container, the
  launchers read the team's settings file (below), else the global file written by `orkeon init`.
- **No settings file in the team folder** (D33): no `appsettings*.json` at its root (`orkeon run crew` does
  not read it, but it is the settings file of `--list-tools`, `orkeon doctor`, `orkeon email` and
  `orkeon mcp serve` started from the team folder, `cli.md` § 5) nor in `crew/` (an agent reads `/crew`
  with `file_read`, and Orkeon picks it instead of the machine's file for every run that names no settings
  file), no `appsettings/` or
  `_shared/` folder. A team that needs settings of its own — a mailbox, another model — keeps them in
  `settings/<slug>/appsettings.json` of the workshop: the launchers, `orkeon-harness-run` and the bench pass it
  with `--settings`, and so does Studio, on its own (STUDIO-62, `TeamSettingsFile`): when the team folder
  sits right under the teams root in force and that file exists beside the root, a launch — and the Test
  screen's trial — carries `--settings=<absolute path>` (the slug is the folder's name; Studio never writes
  the file on its own — its Settings screen writes the file open in it, Studio's own unless an Expert
  opens another). Precedence: a file an Expert pins in Run › Advanced options (for the whole form and until
  Studio closes), then the team's file, then the CLI's own chain; the file in force shows in the command
  preview and on a « team settings file » line. Studio's `ORKEON_Llm__*` variables still lie over it: a card
  without `profile` lays only `ORKEON_Llm__Profiles__<id>__*`, so the file's `Llm` and `RateLimiting` apply
  as written; a card naming a `profile` of this machine lays that setting as `ORKEON_Llm__*`, key by key
  (the model comes from the card's setting, then the team's file, then Studio's default). A team outside
  the teams root, or a folder picked by hand, gets no `--settings`: it runs on the machine's file, and a
  mail account put in Studio's own settings is visible to every team Studio launches that way. Since
  4956aab Studio declares accounts in a form, Settings › E-mail (STUDIO-65 to 70): it writes
  `Orkeon:Tools:Email` into the file its Settings screen edits — Studio's own by default —, keeps a
  password or an OAuth client secret in the Windows user environment (`EMAIL_<ACCOUNT>_PASSWORD`,
  `EMAIL_<ACCOUNT>_CLIENT_SECRET`, unless the file already names a variable) and writes only that name.
  A workshop team launched on its `settings/<slug>/appsettings.json` does not see those accounts: a run
  reads one settings file, and Studio lays nothing over a launch for them. A crew that
  names `llm: { profile: <id> }` finds that profile in this file; under Studio a setting of the same id is
  merged over it field by field. Start it from a copy of the
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
  Settings › Authorized folders (`Orkeon:FileSystem:Mounts` of `%APPDATA%\Orkeon\appsettings.json` — the
  machine's file, also when the launch passes the team's settings file or a pinned one), compared on the
  physical folder only and spelled exactly
  (`C:/x` is not `C:\x`). Any other folder, or an unreadable entry, makes Studio refuse the launch. Its
  wizard names the folder of `/workspace` `input` and the folder of any other root after the root.
  This is why the default folders of a team stay inside it, and why the mount sets
  `mounts.<name>/<slug>/` of the workshop serve the launchers and the bench, never Studio.
- **A missing folder** (STUDIO-60, `TeamFolderPreparation`): before a launch — Run, Run with `--validate`,
  Replay — Studio prepares the team's own folders by the rule of the workshop's launchers. For each
  well-formed `./x` entry of the card, a missing writable folder (`rw`, `rwnd`) is created and the journal
  names it; a missing read-only one refuses the launch before any process starts, naming the folder and
  its mount point. Nothing is created outside the team, and no `.gitkeep` is written. Git keeps no empty
  folder: the `.gitkeep` that `orkeon-bench scaffold` leaves in each one keeps the read-only folders of a
  cloned workshop.
- **How Studio reads and writes it**: the read is strict (default JSON options) — names are case-sensitive
  (`"Name"` is not `name`), a comment or a trailing comma makes the file invalid, and a wrong type (an
  object in `mounts`) makes Studio ignore the whole card silently: the team then launches **without any
  mount point**. The write keeps what it found (STUDIO-58): the keys Studio does not model are written
  back after its own, a field the card does not set gets no `null`, accents stay letters (a character
  outside the Basic Multilingual Plane is still written as a `\uXXXX` pair), two-space indent, LF, UTF-8
  without BOM, a final newline. After a real run a workshop card gains `lastRunAt` and nothing else, and a
  second run changes no byte beyond that stamp.
- `profile` (the name of a Studio model setting, spelled exactly) and `schedule` (`daily@HH:mm` /
  `hourly`): only if the user gives them. Studio only displays `schedule`: installing it (`forge
  schedule`) needs the `forge.json` of a team its wizard adopted. A `profile` naming a setting absent from
  the machine is said absent on the card, and the default runs. `archived`, `archivedAt`, `lastRunAt`,
  `addedAt`: never — Studio maintains them itself.

## What Studio's actions do to a workshop team

The workshop keys what goes with a team by its slug (`workbooks/`, `tests/`, `settings/`, `mounts.<name>/`,
D28, D29, D33). When its teams root sits in a workshop (above), Studio's gestures follow those trees
(`WorkshopSiblings`, STUDIO-64); in a plain catalogue they touch the team folder alone, as before:

- **Rename** moves, after the team folder, the trees that exist: `workbooks/<slug>`, `tests/<slug>`,
  `settings/<slug>` and each `mounts.<name>/<slug>`. A destination already taken refuses the rename before
  anything moves; a move the disk refuses puts the trees already moved back, the team staying renamed, and
  the line names what stayed under the former slug. Rename runs `forge rename`, which also gives the
  card's `name` the new name and leaves the workshop's launchers as they are (it rewrites only the header
  Orkeon's own launchers carry).
- **Delete** no longer erases: it moves the team folder, then its trees, under `archive/<slug>/<kind>/`
  (`archive/<slug>-2/` when the name is taken; kinds `teams`, `workbooks`, `tests`, `settings`,
  `mounts.<name>`). A refusal on the team folder has moved nothing; a later one puts everything back.
- **Duplicate** makes `<slug>-copy` and copies `settings/<slug>` to `settings/<slug>-copy`, nothing else —
  no workbook, tests or mount sets; a settings folder already under the copy's name is left alone.
- On the Linux side and without Studio, the trees are moved together by hand, or with
  `orkeon-bench team rename|remove` once it exists (D39); the list of orphans planned for
  `orkeon-bench doctor` becomes a safety net.
- **Modify** (a YAML team) writes a `forge.json` and, once re-adopted, regenerates `crew/` and the
  launchers: run `orkeon-bench scaffold <team>` again afterwards.
- **Studio writes `run.sh` and `run.cmd` again only when Orkeon wrote them** (`TeamLaunchers`, STUDIO-63).
  The signature is the header line `Generated by Orkeon Forge for the team '…'.` (or the one of the
  releases up to rc.4, `Generated by Orkeon Forge (session '…').`) in one of the first three lines, after
  `# `, `rem ` or `REM `. The launchers of `orkeon-bench scaffold` do not carry it: they are another
  tool's, both are kept as they are — never merged — and « My teams » says the folders are saved and the
  launchers were left as they are. Studio never reads a launcher to launch: it launches from the card.
  « Change the folders » still rewrites the card's `mounts`, so the card and `mounts.json` can diverge: put
  the change in `mounts.json` and run `orkeon-bench scaffold <team>` again. A scheduled team with such
  launchers runs them as they are (its card carries the notice `ForeignLaunchers`). Launchers that do
  carry the header — `orkeon forge promote`, or Studio's wizard adopting the team — are written again,
  whole, at « Change the folders », when the setting the card's `profile` names is created, renamed or
  removed, at an import and before a schedule is installed: `orkeon run crew` (or `crew/crew.ork.ts`)
  with `--settings=<Studio's settings file>` when it exists, `--llm-profile=<id>` for the card's setting
  and the card's folders, without `TEAM_ENV`, the mount sets or `settings/<slug>/appsettings.json`. The
  check scripts refuse such a launcher in a workshop team: run `orkeon-bench scaffold <team>` again.

## Checking a team as Studio does

In the image, `orkeon-studio-check [--authorized <appsettings.json>] [<team folder or slug>...]` runs Orkeon
Studio's own code (`Orkeon.Studio.Core`, packed from the same commit as the CLI) against the teams of the
workshop — every team of `$ORKEON_WORKSHOP/teams` without an argument; exit 0 when every team passes, 1 when
one fails, 2 on a usage error. It reads the card as Studio parses it, the crew Studio would run and from
where, the mount points Studio would refuse (with the Authorized folders of the given settings file — its
`Orkeon:FileSystem:Mounts`, read case-sensitively as Studio reads it; none by default), a read-only folder
of the team that is missing (Studio refuses the launch; a missing writable one is created at launch, as the
launchers do), an archived card and unknown mount ids, and compares them with what the launchers written by
`orkeon-bench scaffold` bind (it never reads `run.sh` or `run.cmd`).
`check_crew.py` and `check_team.py` call it when it is on the PATH: a problem line "Studio refuses to launch the team because of …" (a folder outside the team that
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

Modelled on the launchers `orkeon forge promote` writes (`TeamLauncherScript.cs`, the composer
`forge promote` and Studio share): they resolve symbolic links, move into the team folder
(the runner rejects a crew outside the working directory) and mount the folder of every mount
point. In the workshop they are written by `orkeon-bench scaffold` from `mounts.json`, and
`TEAM_ENV=<name>` binds the mount set `mounts.<name>/<slug>/` of the workshop instead.
Orkeon's own `run.cmd` also keeps `%~dp0` between `cmd`'s quotes, switches to UTF-8 (`chcp 65001`)
and disables delayed expansion (a2bb6c37); the `run.cmd` of `orkeon-bench scaffold` does the same, and
gives the caller's code page back before `orkeon` starts. Both launchers create the missing folders of
the team's writable mount points and stop on a missing read-only one, naming it and its mount point.
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
