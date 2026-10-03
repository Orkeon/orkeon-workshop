# library/tools/csharp — Orkeon tools in C#

**Purpose.** Tools that TypeScript cannot be: they do I/O, call a system, carry heavy logic or
integrate with .NET. Each one is built here with the same process as a team, reduced.

**Shape.** One .NET solution per tool, from the template shipped by the image
(`/usr/local/share/orkeon-harness/csharp/OrkeonTool/`):

```
<Name>/
├── src/<Name>/Domain/        pure logic, tested without Orkeon
├── src/<Name>/Tool/          the ToolBase<TRequest, TResponse> class: validation, mapping, I/O through IFileSystemService
├── tests/<Name>.Tests/       the project's tests, with hand-written doubles
├── workbook/                 NEED.md, ACCEPTANCE.md, STATUS.md, decisions/, attempts/ — the reduced process
└── README.md                 contract (input, output, side effects, virtual paths touched), how a team loads it
```

A C# tool keeps its tests and its `workbook/` in its own folder, as a .NET solution does — unlike a
team, whose workbook and tests sit next to `teams/` in `workbooks/<slug>/` and `tests/<slug>/` (D29).

A team reaches a C# tool through a **plugin** loaded by `orkeon-harness-run` (the shipped `orkeon`
and Studio on Windows load no plugin), or through a **C# host**. Conventions:
`.claude/rules/orkeon-csharp.md`.

**Promotion rule.** A tool stays in its own `workbook/` process until its verdict is `ACCEPTED`:
tests green, analyzers clean (VFS compliance included), and one accepted team calling it. A tool
shared from here freezes its public API (`PublicAPI.Shipped.txt`) and keeps a CHANGELOG; a breaking
change is a new major version beside the old one.
