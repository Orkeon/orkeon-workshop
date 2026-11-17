# Mail triage

Triages a folder of exported `.eml` mails: one record per mail — category, urgency and a short reason —
in `/output/classification.json`, a reply draft per mail that calls for one in `/output/drafts/`, never
sent, and only the new mails processed at each run. Pilot 1 of the workshop (YAML); its workbook is
`workbooks/mail-triage/TEAM.md`.

## The team

| Agent | Role | Tools |
|---|---|---|
| `reader` | Mail reader: lists the new `.eml` files of `/mailbox` and parses each one | `glob`, `file_read`, `email_parser`, `file_write` |
| `sorter` | Mail sorter: category, urgency and reason of each mail, then the registry | `file_read`, `json_tool`, `file_write` |
| `drafter` | Reply drafter: one draft per mail that calls for one, in its language | `file_read`, `file_write` |

| Task | Agent | Depends on | Produces |
|---|---|---|---|
| `parse_mails` | reader | — | `/registry/pending.json` |
| `classify` | sorter | `parse_mails` | `/output/classification.json` |
| `any_draftable` | — (decision gate) | `classify` | the answer to `draftable`, `"yes"` or `"no"`; fallback `"yes"` |
| `draft_replies` | drafter | `parse_mails`, `classify`; runs when `any_draftable.draftable` is `"yes"` | `/output/drafts/<file>.txt` |
| `record_keys` | sorter | `parse_mails`, `classify`, `draft_replies` | `/registry/registry.json` |

Orchestration: `sequential`. The gate `any_draftable` is a decision task: with no decision model — the
default, and every stub run — it answers its fallback `"yes"`, so the drafting runs and the rule of the
drafts still selects the mails one by one.

## Mount points

The agents see these folders, and nothing else of the disk. They are declared in `mounts.json`;
`orkeon-bench scaffold` derives the launchers and the Studio card from it.

| Mount point | Access | Folder of the team | Holds |
|---|---|---|---|
| `/mailbox` | ro | `./mailbox` | the `.eml` files to triage, as exported; the team never changes them |
| `/registry` | rw | `./registry` | `registry.json`, the file names already processed, and `pending.json`, the mails of the run |
| `/output` | rw | `./output` | `classification.json` and `drafts/` |

## Usage

1. Export the mails to triage, one `.eml` file per mail, into `mailbox/`. Only the files at its top are
   read; the team never changes them.
2. Launch:
   - **Orkeon Studio**: the team appears in "My teams" when Studio's teams folder is the workshop's `teams/`; select it and launch. A folder outside the team must be declared in Studio's Authorized folders.
   - **Terminal**: `./run.sh` (Windows: `run.cmd`). Check without any LLM call: `./run.sh --validate`.
     `TEAM_ENV=<name> ./run.sh` runs the team on the mount set `mounts.<name>/mail-triage/` of the
     workshop instead of its own folders.
3. Read `output/classification.json` and the drafts of `output/drafts/`. A mail already in
   `registry/registry.json` is never processed again, even when its outputs were deleted: to start over,
   empty `registry/` and `output/` together.

The language model is not set here: it comes from the team's own settings file
(`settings/mail-triage/appsettings.json` of the workshop, which the launchers pass), else from the
machine's configuration (`orkeon init`), and `ORKEON_Llm__*` variables override both. No decision model
is needed; a key, if any, lives in an environment variable, never in a file.

## Structure

```
mail-triage/
├── mounts.json
├── run.sh, run.cmd, team.json   (orkeon-bench scaffold)
├── crew/
│   ├── config.yaml
│   ├── agents/   reader.yaml, sorter.yaml, drafter.yaml
│   ├── tasks/    parse_mails.yaml, classify.yaml, any_draftable.yaml, draft_replies.yaml, record_keys.yaml
│   └── schemas/  classification.schema.json, pending.schema.json, registry.schema.json
├── mailbox/   registry/   output/
```
