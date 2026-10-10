---
paths:
  - "docs/**"
  - "README.md"
  - "README.fr.md"
---

# Documentation, in this repository

- The user documentation is mirrored in French page for page (`README.fr.md`, `docs/fr/`): a change
  to an English page is ported to its French page in the same change. The plan and
  `docs/profiles-design.md` are English only.
- A page added, moved or removed is added, moved or removed in `docs/toc.yml`, `docs/fr/toc.yml`
  and both indexes (`docs/README.md`, `docs/fr/README.md`).
- The plan is the record: a decision goes to § 13, progress to § 11.1. Its section numbers and the
  decision ids `D<n>` are cited across the sources: never renumber them.
- A statement about what Orkeon does is checked in its sources or on a build, not assumed
  (`CLAUDE.md` § "Conventions").
- Done means links, anchors, Mermaid and the docfx build checked: `/ws-docs`.
