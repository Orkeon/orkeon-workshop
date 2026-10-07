---
name: workshop-language
description: "Shows or sets the language this workshop works in (D41): the language of the conversation and of the prose of the workbooks — NEED.md, the criteria, the test plan, the design, the decisions. Headings, keys, ids, the journal and the hooks' messages stay in English. Without a language set, the conversation follows the user's messages and files are in English."
argument-hint: "[<language> | default]"
disable-model-invocation: true
---

# /workshop-language — the language of the workshop

A workshop may name the language its users work in (D41). It is one line, a language tag, in
`.claude/local/language` — a file the workshop owns and git keeps. The hook `workshop-language` reads
it at the start of every session; this skill is how the user sets it.

Arguments: $ARGUMENTS

## 1. Read what is asked

- **Nothing**: show the language in force.
- **A language**: a tag (`fr`, `de`, `es`, `pt-BR`) or its name in any language ("French", "Deutsch",
  "Portuguese of Brazil"). A name is yours to turn into its tag — the script takes tags only: a language
  of 2 or 3 letters, then an optional script (`zh-Hans`) and an optional region (`pt-BR`, `es-419`).
  When the name could mean several (Chinese: `zh-Hans` or `zh-Hant`; Portuguese: `pt` or `pt-BR`), ask
  (AskUserQuestion, one question).
- **`default`** (or "follow my messages again", "no workshop language"): remove the setting.

`en` is a language like another: the conversation is then in English whatever the user types. It is not
the default, which follows the language of the user's messages — "back to English" from a user who
writes in French is a question to ask: English always (`en`), or the default?

## 2. Run the script

```bash
bash .claude/skills/workshop-language/scripts/workshop-language.sh            # show
bash .claude/skills/workshop-language/scripts/workshop-language.sh <tag>      # set
bash .claude/skills/workshop-language/scripts/workshop-language.sh default    # remove
```

Every line it prints starts with `workshop-language:`. Exit `2` is a refusal — not a tag, not a
workshop, a folder in the place of the file, the file could not be written: say what it said, change
nothing by hand, and go on in the language you were talking in.

## 3. Say what happened, and apply it at once

- **Shown, or refused**: one or two lines; nothing changes.
- **Set**: from the next sentence on, talk in the language just set — the hook only speaks at the start
  of a session, and this one has already started. Then tell the user, in that language, in a few lines:
  - what changes: the conversation, and the prose of what is written from now on in the workbooks —
    `NEED.md`, `ACCEPTANCE.md`, `TEST-PLAN.md`, `DESIGN.md`, `PLAN.md`, the decisions, the analysis of an
    attempt;
  - what does not: the headings, keys, ids and table headers of the templates, the fixed words (`TBD`,
    `None.`, the verdicts), the journal of `STATUS.md`, file names, code, and the messages of the hooks
    (`team-approve: …`), which you report in the user's language. The rule is
    `.claude/rules/workbook.md` § "Tone and language";
  - that nothing already written is translated: an artefact keeps the language it was written in unless
    the user asks for a translation, one file at a time;
  - that the language a team's agents write in — their prompts, their deliverables — is not this
    setting: it is decided in the need of that team (`## Constraints`).
- **Removed** (`default`): what the session was told at its start — "this workshop works in …" — no
  longer holds. From the next sentence on, talk in the language of the user's messages, write new files
  in English, and say so in two lines; what is already written keeps its language.

Never translate a file because the language changed, never edit `.claude/local/language` by hand, and
never set a language the user did not ask for: a user who writes in French has not asked for a French
workshop.
