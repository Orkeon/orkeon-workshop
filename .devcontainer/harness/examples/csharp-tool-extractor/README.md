# Pilot 3 — a C# extraction tool

**Goal.** A deterministic Orkeon tool written in C#: it parses a business file format and returns
structured records, which a model would do badly and expensively. The tool is then offered to one of
the two other pilots, which calls it instead of asking the model to read the raw file.

**Mounts.** The tool declares none: it reads through `IFileSystemService` the virtual paths of the
team that calls it (the pilot's `/workspace` or `/mailbox`), and writes nothing.

**What it will demonstrate.**

- The reduced process for a tool: `workbook/` (need, acceptance, decisions, attempts) and the
  project's own tests, written before the tool.
- The tool contract: a `partial` class deriving from `ToolBase<TRequest, TResponse>` with
  `[ToolContract]`, request and response records with their schema attributes, attachable to an agent
  under its own name (a name another tool holds is refused).
- The split `Domain/` (pure logic) · `Tool/` (validation, mapping, I/O) · `Tests/` (hand-written
  doubles), and a build with every analyzer on — VFS compliance included, so no `System.IO`.
- Exposure to a YAML or TypeScript team through a plugin loaded by `orkeon-harness-run`, with the
  team's launchers calling that runner; and what it costs: Studio on Windows launches the stock
  `orkeon` and does not see the tool.
- The same test levels as a team: build and analyzers (L0), the project's tests (L1), the tool called
  by a one-task crew with the simulated LLM (L2).

**Status.** Placeholder (lot 0). Built in lot 8; once accepted it lives in
`library/tools/csharp/<Name>/`.
