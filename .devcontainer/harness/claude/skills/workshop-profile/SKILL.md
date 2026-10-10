---
name: workshop-profile
description: "Shows, lists or switches the profile of this space: which packs of the harness it deploys (user, contrib, dev, release, docs, all, custom:<packs>)."
argument-hint: "[<profile> | custom:<pack>,<pack> | --list | --show] [--dry-run]"
disable-model-invocation: true
---

# /workshop-profile - the profile of this space

A profile is a list of packs of the harness (lot 11, D48-D55). The script decides everything - which
space this is, which packs fit, what it writes - and you relay what it prints.

Arguments: $ARGUMENTS

## 1. Run the script

Pass the arguments as they were typed; nothing means `--show`.

```bash
python3 .claude/skills/workshop-profile/scripts/workshop-profile.py $ARGUMENTS
```

When `.claude/skills/workshop-profile/` is not in this folder yet (a checkout with no harness), the same
script is the `workshop-profile` command of the container: `workshop-profile $ARGUMENTS`.

## 2. Relay it

Every line starts with `workshop-profile:`. Report them to the user in a few lines, in the language of
the conversation:

- **Exit 0, `--show` or `--list`**: the active profile and its packs, or the profiles that fit here.
- **Exit 0, a switch**: the profile, its packs, what changed in `.claude/settings.local.json`, the
  synchronisation line. When the script asks for a restart, say so plainly: the skills, subagents and
  rules of the new profile load in a new session (`/exit`, then `claude`).
- **Exit 0, `--dry-run`**: what would change; say that nothing was written.
- **Exit 2**: a refusal - the profile does not fit this space, a file git tracks would be written, the
  settings file cannot be read. Say what it said, including the profiles that fit; change nothing by
  hand.
- **Exit 1**: the definitions or the synchronisation failed. Show the lines; do not retry.

Never edit `.claude/local/profile`, `.claude/local/profile.owned.json` or the keys the script owns in
`.claude/settings.local.json` by hand, and never choose a profile the user did not ask for.
