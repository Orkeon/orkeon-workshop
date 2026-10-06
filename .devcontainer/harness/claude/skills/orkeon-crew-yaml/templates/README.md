# {{TEAM_TITLE}}

{{TEAM_DESCRIPTION}}

## The team

| Agent | Role | Tools |
|---|---|---|
{{AGENT_ROWS}}

| Task | Agent | Depends on | Produces |
|---|---|---|---|
{{TASK_ROWS}}

Orchestration: `{{PROCESS}}`.

## Mount points

The agents see these folders, and nothing else of the disk. They are declared in `mounts.json`;
`orkeon-bench scaffold` derives the launchers and the Studio card from it.

| Mount point | Access | Folder of the team | Holds |
|---|---|---|---|
{{MOUNT_ROWS}}

## Usage

1. Put the inputs into the folders of the read-only mount points. {{INPUT_HINT}}
2. Launch:
   - **Orkeon Studio**: the team appears in "My teams" when Studio's teams folder is the workshop's `teams/` — `%USERPROFILE%\Orkeon\teams` by default, else set with `ORKEON_STUDIO_TEAMS_ROOT`, `--teams-root` or Settings › Studio; select it and launch. Studio passes the team's settings file (`settings/{{TEAM_DIR}}/appsettings.json` of the workshop) when it exists, else runs the team on its own settings (Settings, `%APPDATA%\Orkeon\appsettings.json`); a model setting the card names, spelled exactly as in Studio (`"profile"` in `studio-team.json`), is laid over either. A folder outside the team must be declared in Studio's Authorized folders. Studio launches from the card and leaves `run.sh` and `run.cmd` as they are: after « Change the folders » in Studio, put the change in `mounts.json` and run `orkeon-bench scaffold {{TEAM_DIR}}` again.
   - **Terminal**: `./run.sh` (Windows: `run.cmd`). Check without any LLM call: `./run.sh --validate`.
     `TEAM_ENV=<name> ./run.sh` runs the team on the mount set `mounts.<name>/{{TEAM_DIR}}/` of the
     workshop — one folder per mount point — instead of its own folders.
3. Collect the result{{DELIVERABLE_HINT}} in the folder of its mount point.

The language model is not set here: it comes from the team's own settings file
(`settings/{{TEAM_DIR}}/appsettings.json` of the workshop, which the launchers pass), else from the machine's
configuration (`orkeon init`), and `ORKEON_Llm__*` variables override both; in Studio, from the same team
settings file, else Studio's settings, under the profile the card names. {{PREREQUISITES}}

## Structure

```
{{TREE}}
```
