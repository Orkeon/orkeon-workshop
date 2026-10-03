# references/csharp — Orkeon in C#

Reference document written in lot 1, used from lot 8. The rule `.claude/rules/orkeon-csharp.md` states the
conventions to hold, and the templates shipped by the image under `/usr/local/share/orkeon-harness/csharp/`
are the working example.

| Document | Abstract |
|---|---|
| `orkeon-guidelines.md` | Dated extract of the conventions of the Orkeon repository that the harness applies to C# tools and crews: build settings (`-warnaserror`, analyzers, central package versions), style, the Domain / Application / Infrastructure split, the VFS compliance analyzer, testing with hand-written doubles, the public API freeze. Each convention with its source file in the repository. |

Related, under `references/orkeon/`: `csharp-tools.md` (the `ToolBase` contract, what makes a
tool attachable, plugin versus C# host) and `csharp-crews.md` (the host wiring order, builders,
deliverables, the events hook).
