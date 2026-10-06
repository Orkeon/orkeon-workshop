# settings/ — the Orkeon settings of each team

One folder per team, named after its slug: `settings/<slug>/appsettings.json`. A team's settings never
live in its folder under `teams/` (decision D33): an agent can read whatever sits beside its crew, and the
team folder is what Studio lists and what gets copied around.

**What the file does.** The launchers (`run.sh`, `run.cmd`) and `orkeon-harness-run` pass it to Orkeon with
`--settings` when it exists (`orkeon-bench` will too when it runs teams, lot 4; `orkeon-bench profile`
already reads it). Orkeon then reads it **instead of** the machine's `~/.config/Orkeon/appsettings.json`,
so it must stand on its own:

```json
{
  "Llm": { "BaseUrl": "http://localhost:11434", "Model": "qwen3:8b", "TimeoutSeconds": 600 },
  "RateLimiting": { "MaxConcurrentRequests": 1, "QueueLimit": 32 },
  "Orkeon": { "Tools": { "Email": { "Accounts": { "triage": { "...": "..." } } } } }
}
```

Start from a copy of `~/.config/Orkeon/appsettings.json`, which the image writes for the local model with
the same `Llm` and `RateLimiting` sections, then add what the team needs.

- The `Llm` section is required: without it the team runs on Orkeon's echo provider. Give a `BaseUrl`:
  without one Orkeon picks a hosted provider from the model name, and the run gate treats every run as
  remote.
- **A local model takes one request at a time**: `RateLimiting.MaxConcurrentRequests` at 1 — absent, 0 or
  below means unlimited, and concurrent calls of a parallel crew saturate the GPU; the checks refuse a team
  file with a local base URL and no limit — with `QueueLimit` at 32 (the default, 5, refuses the calls beyond
  it).
- **No key, no password.** Keys come from the environment (`ORKEON_Llm__ApiKey`); a mailbox names the
  variable that holds its password (`Auth:PasswordEnvVar`), and OAuth tokens stay in Orkeon's per-user folder.
  A hook refuses a key pattern written here.
- Strict JSON (no comments): the run gate and the bench read this file to tell a local run from a paid one.
- **Only settings Orkeon reads.** Orkeon judges the whole file at the start of every run: a key it does not
  know in a section it reads (`Llm:Provider`, a typo such as `RateLimiting:MaxConcurentRequests`), an
  unknown section under `Orkeon:`, or a value it cannot read refuses the run, naming the key —
  `./run.sh --validate` from the team folder shows it at once.
- Orkeon Studio passes this file too, on its own, when the team folder sits right under its teams folder —
  the workshop's `teams/`: `%USERPROFILE%\Orkeon\teams` by default, else the one `ORKEON_STUDIO_TEAMS_ROOT`,
  `--teams-root` or Settings › Studio names. The model profile the team's card names (`"profile"` in
  `studio-team.json`) is laid over its `Llm` section, and a file pinned in Run › Advanced options (Expert
  mode) wins over it, for the whole form and until Studio closes. A team Studio launches from anywhere else
  runs on Studio's own settings (Settings, `%APPDATA%\Orkeon\appsettings.json`): a mail account written
  there is visible to every team launched that way.
- Never put a settings file anywhere else. In an `appsettings/` or `_shared/` folder above the crews (the
  workshop, `teams/`, a team folder) or in `crew/`, Orkeon reads it **instead of** the machine's settings
  for every run that names no settings file — a Studio launch of a team without a file here included, unless
  a file is pinned. At the root of a
  team folder, an `appsettings*.json` is no longer read by a run of the team, but `appsettings.json` is the
  settings file of `orkeon run --list-tools`, `orkeon doctor`, `orkeon email` and `orkeon mcp serve` started
  there: remove it. `orkeon-bench doctor`
  (check `stray-settings`), the checks and the start-up of the container report such files.

A team without a file here runs on the machine's settings. `check_crew.py` and `check_team.py` check the
file. They refuse a secret value; `Orkeon:Tools:Shell:*`; `Orkeon:FileSystem:Mounts`,
`Orkeon:FileSystem:InternalMounts` and `PathSecurity:AdditionalAllowedDirectories` (a team's mount points
belong in its `mounts.json`); `Orkeon:Tools:Email:CredentialsDirectory` (the mail tokens stay in the
machine's folder); `Security:Url:BlockPrivateIPs` or `Security:Url:ResolveDNS` at `false`; a local base
URL without a concurrency limit. They warn about `Send:AllowedRecipients` at `"*"`, and refuse
`shell_command` in a team whose file (or, without one, the machine's) declares a mail account. They also
refuse an `appsettings*.json` inside a team folder. Orkeon Studio never writes this file (D33).
