# library/mount-schemes — schemes of mount points

**Purpose.** A team declares its own mount points in its `mounts.json`, free in name and number,
decided from its need (D27). A **scheme** is a ready list of mount points, proposed when a team is
created and its need names no folder. The image ships one, the generic scheme
`.claude/templates/mounts.json` — `/workspace` read-only for the inputs, `/output` written for the
deliverables. Put your own here: the generator skills and `/team-design` offer them first.

**Shape.** One file per scheme, named after its use (`mail.json`, `documents.json`), with the shape
of a `mounts.json` (`.claude/templates/mounts.json`):

```json
{
  "version": 1,
  "mounts": [
    { "root": "/mailbox", "access": "ro", "role": "mailbox", "default": "./mailbox", "description": "The mails to process" },
    { "root": "/state", "access": "rw", "role": "state", "default": "./state", "description": "What was processed already" },
    { "root": "/drafts", "access": "rwnd", "role": "deliverables", "default": "./drafts", "description": "Reply drafts" }
  ]
}
```

A team starts from a copy and adapts it to its need; nothing links it back to the scheme. A scheme
is a convention of the workshop, not a brick proven by a team: the promotion rule of the library
does not apply to it.
