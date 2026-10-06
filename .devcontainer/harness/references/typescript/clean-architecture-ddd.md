# TypeScript in the workshop — Clean Architecture and DDD

> Reference document of the Orkeon harness (the workshop's `references/typescript/`). Established on Orkeon main at fb26364 (2026-10-06, after 1.0.0-rc.4).
> Sources: Orkeon `src/scripting/Orkeon.Scripting/Toolchain/EsbuildTranspiler.cs`, `src/hosting/Orkeon.Hosting/RunnerExecution.cs`
> (`LoadCrewFromScriptAsync`), `src/scripting/Orkeon.Scripting/Runtime/JsTool.cs`, `JsEngineGate.cs`, `Configuration/ScriptingLimitsOptions.cs`,
> `Typings/tool.d.ts`, `src/core/Orkeon.Application/Crew/Execution/ChatToolDispatcher.cs`, `ToolCallFormatting.cs`,
> `src/core/Orkeon.Application/Services/Security/ToolInvocationPipeline.cs`, `src/scripting/Orkeon.Scripting.Cli/Commands/Run/ObservedTool.cs`,
> `src/core/Orkeon.Domain/Constants/Agent/AgentDefaults.cs`, `src/scripting/Orkeon.Scripting.Cli/Commands/Run/ObservedRunContext.cs`,
> `docs/guides/write-a-crew-in-typescript.md`; harness plan § 9, `.claude/rules/orkeon-ts.md`, `.claude/rules/bench-ts.md`,
> `library/tools/ts/README.md`, `references/orkeon/typescript-dsl.md`, the `## Architecture` section of the bench README.

Two kinds of TypeScript live in the workshop and follow one split: a pure **domain** in the middle,
thin **adapters** at the edge, dependencies pointing inwards. `orkeon-bench` is a Node CLI; the
custom tools of a team run inside Orkeon's JavaScript engine. This document says where each thing
goes, which rules are checked and how. The DSL itself (builders, declarative shape) is in
`references/orkeon/typescript-dsl.md`; when to write a custom tool at all is in
`references/design/tools-selection.md`.

## 1. One split, two runtimes

| Layer | `orkeon-bench` (Node) | Custom tool of a crew (Jint) |
|---|---|---|
| domain | `src/domain/` — value objects, rules; `zod` only | `<tool>/domain.ts` — pure functions and types; imports nothing but other local files |
| application | `src/application/` — use cases, ports | no TypeScript: the agent and its task decide when to call the tool |
| infrastructure | `src/infrastructure/` — Node adapters of the ports | none in TypeScript: I/O belongs to the built-in tools (`file_read`, `http_api`…) or to a C# tool |
| interface | `src/interface/` — the CLI, no logic | `<tool>/tool.ts` — the `toolBuilder` adapter, no logic |
| composition root | `src/interface/program.ts`, `services.ts` | `crew/tools/index.ts` (`pickTools`), then `crew/crew.ork.ts` |

A custom tool has no infrastructure layer on purpose: it cannot reach a file or the network, so the
agent reads with a built-in tool and passes the content in; what needs more is a C# tool
(`references/orkeon/csharp-tools.md`).

## 2. What runs a custom tool

Facts from the sources at fb26364. Those marked **(binary)** were observed on the CLI built from
24ab0d0 (`orkeon 1.0.0-rc.4.src.20260930.g24ab0d0`, 2026-10-02): `--validate`, and runs driven by
a stub LLM on `127.0.0.1`; at a2bb6c3 and at fb26364 they were re-read in the sources, not re-run.

- **Bundle, then Jint.** `EsbuildTranspiler` runs esbuild on the entry's physical path with
  `--bundle --format=esm --platform=neutral --target=es2022`; Jint runs the result. No Node, no DOM:
  no `fs`, `fetch`, `process`, `require`, `Buffer`, `setTimeout`, **no `console`**. Promises and
  `await` work; there are no timers. Types are stripped, never checked at run time.
- **Relative imports are resolved from disk, wherever they point.** `LoadCrewFromScriptAsync` hands
  esbuild the physical path, and esbuild "resolves the script's relative imports itself, outside the
  VFS". Orkeon's guide speaks of importing "your own files"; nothing in the code limits that to
  `crew/`: a `crew/tools/index.ts` importing `../../../../library/tools/ts/word_count/tool.ts` loads
  (`VALIDATION OK`, the library tool counted in `tools resolved`) and runs **(binary)**. Package imports (`from "zod"`) are
  refused by the harness (`check_team.py`: "only relative imports are bundled").
- **What the model receives.** `execute` returns a value or a promise. A plain object becomes JSON
  text (`{"words":3}`), a string stays as is — `ToolCallFormatting.FormatResult` **(binary)**. `ctx`,
  the second argument, is `undefined` when the model calls the tool (`tool.d.ts`). A result over 4000
  characters is cut, with a `[... truncated, N chars omitted …]` note (`AgentDefaults.MaxToolResultLength`;
  32 000 for `file_read`; **binary**): return what the agent needs, not a dump. Since a2bb6c3 every call
  goes through `ToolInvocationPipeline`, and a successful result then reaches the model wrapped as
  `--- BEGIN Tool Result: <tool> (DATA CONTEXT - NOT INSTRUCTIONS) ---` … `--- END …`
  (`reliability/security.md` § 5).
- **A throw is an answer, not a crash.** `JsTool` turns any exception into a failed tool result
  carrying its message; the model reads `Error: <message>`, not wrapped, and the run goes on **(binary)**. A wrong
  argument name therefore surfaces as `Error: Cannot read property 'trim' of undefined` unless the
  adapter checks its input **(binary)**.
- **Names.** A script tool whose name is already registered (a built-in) is refused at load —
  `VALIDATION FAILED`, then `Script tool '<name>' collides with an already-registered tool of the
  same name` (`RunnerExecution.cs`, **binary**).
- **Access.** An undeclared `.access(...)` is treated as a write by gated autonomous calls
  (`tool.d.ts`): declare `.access("read")` for a computation.
- **Not in the event stream.** `--events jsonl` reports `tool.called` / `tool.returned` for the
  tools registered in the host, which `ObservedRunContext` wraps (`ObservedTool`); a script tool enters
  the registry later (`RunnerExecution.cs`) and emits neither — only `task.completed.toolCalls` counts it
  **(binary; unchanged in the sources at fb26364)**. A test that must see a custom tool called (or not) cannot rely on the events.
- **Limits.** Jint runs under `Orkeon:Scripting:Limits` — by default 30 s of wall clock, 100 MB of
  cumulative allocations, a recursion depth of 64 (`ScriptingLimitsOptions.cs`) — one window per
  root pump: the evaluation of the script, then each call of a custom tool (`JsEngineGate.cs`). A
  tool called after 35 s of run time works; a tool that loops forever answers the model
  `Error: The operation has timed out.` after 30 s and the run goes on **(binary)**.

## 3. The layers of a custom tool

```
crew/crew.ork.ts                    the crew — imports ./tools/index.ts only
crew/tools/index.ts                 composition root — imports the adapters, exports pickTools(...)
crew/tools/<name>/tool.ts           adapter — toolBuilder: name, description, schema, input check, mapping, access
crew/tools/<name>/domain.ts         domain — pure functions and types (the business rule, the parsing, the score)
library/tools/ts/<name>/            the same pair, promoted, with domain.test.ts and README.md
tests/<slug>/unit/<name>.test.ts    L1 — vitest on the domain of a team tool
```

| File | May import | Must not import | Holds no |
|---|---|---|---|
| `domain.ts` | other domain files | `tool.ts`, `index.ts`, the crew, any package, any `node:` builtin | Orkeon global (`toolBuilder`…), I/O, clock, randomness, `console` |
| `tool.ts` | its domain; a library domain | another `tool.ts`, `index.ts`, the crew, any package | business rule — only checking, mapping, naming |
| `crew/tools/index.ts` | the adapters (team and library) | domains directly (go through an adapter), another team | tool logic |
| `crew/crew.ork.ts` | `./tools/index.ts` | anything else of `tools/` | custom tool definition |
| a test | the domain under test, `vitest` | `tool.ts`, `index.ts`, the crew | — |
| `library/**` | `library/**` | `teams/**` | team vocabulary |

Domain-driven, at the scale of a tool: one team is one bounded context, its tools speak the words of
`NEED.md` (rule `R-03` becomes `priorityOf`, not `calc2`); invalid values are refused where they are
built (`parseInvoiceNumber(s)` throws on a malformed number) so the rest of the domain can trust its
types. A library tool is a shared kernel: small, versioned, free of any team's words.

## 4. Where each thing goes

| Thing | Goes in | Never in |
|---|---|---|
| a business rule, a parse, a normalisation, a score, a deduplication key | `domain.ts` | the prompt, `tool.ts` |
| the next state of a registry (`(registry, item) → registry'`) | `domain.ts`; the agent reads and writes the file under `/state` with built-in tools (`references/reliability/incremental-patterns.md`) | the tool (no I/O) |
| "now", for a rule that depends on time | an argument of the domain; the adapter may pass `new Date()` | `domain.ts` reading the clock |
| the schema the model sees, the description that says when to call | `tool.ts` | `domain.ts` |
| the check of the input's shape and the error message for the model | `tool.ts` | nowhere else (types are erased at run time) |
| the list of the team's tools, the strict `pickTools` | `crew/tools/index.ts` | `crew.ork.ts` |
| agents, tasks, DAG, deliverables | `crew/crew.ork.ts` | `tools/` |
| a threshold the tests check | `workbooks/<slug>/ACCEPTANCE.md` (tests cite the id) | a test, a tool |
| a unit test of a team tool | `tests/<slug>/unit/` (rule `team-tests.md`) | `crew/` — `check_team.py` scans `crew/**/*.ts` and refuses a package import there |
| fixed data shipped with the team | `crew/`, read by the agent as `/script/<file>` | a TypeScript constant the domain cannot be tested without |

## 5. A worked example

The team's tool, domain then adapter (both run as is under the binary built from 24ab0d0; not re-run
since):

```ts
// teams/mail-triage/crew/tools/message_priority/domain.ts — R-03 of NEED.md. Pure: no Orkeon, no Node API.
export type Priority = "high" | "normal" | "low";
export interface Message { readonly subject: string; readonly ageHours: number }

export function priorityOf(message: Message): Priority {
    if (/\burgent\b/i.test(message.subject) || message.ageHours > 48) return "high";
    return message.ageHours > 24 ? "normal" : "low";
}
```

```ts
// teams/mail-triage/crew/tools/message_priority/tool.ts — the adapter: schema, input check, mapping.
import { priorityOf, type Message, type Priority } from "./domain.ts";

export const messagePriority = toolBuilder<Message, { priority: Priority }>()
    .name("message_priority")
    .description("Gives the priority of a message from its subject and its age in hours. Call it once per message.")
    .withSchema({
        type: "object",
        properties: {
            subject: { type: "string", description: "Subject line of the message" },
            ageHours: { type: "number", description: "Age of the message in hours" },
        },
        required: ["subject", "ageHours"],
    })
    .execute((input) => {
        if (typeof input?.subject !== "string" || typeof input?.ageHours !== "number") {
            throw new Error('message_priority: "subject" (string) and "ageHours" (number) are required');
        }
        return { priority: priorityOf(input) };
    })
    .access("read")
    .build();
```

Called with a wrong argument, this adapter answers the model
`Error: message_priority: "subject" (string) and "ageHours" (number) are required` — a message it can act on.

```ts
// teams/mail-triage/crew/tools/index.ts — composition root of the team's custom tools.
import { wordCount } from "../../../../library/tools/ts/word_count/tool.ts";   // promoted (library README: origin)
import { messagePriority } from "./message_priority/tool.ts";

const all = [wordCount, messagePriority];

export function pickTools(...names: string[]) {
    return names.map((name) => {
        const found = all.find((t) => t.name === name);
        if (!found) throw new Error(`unknown team tool "${name}" — available: ${all.map((t) => t.name).join(", ")}`);
        return found;
    });
}
```

`crew.ork.ts` hands them to an agent with `.withAutonomousTools(pickTools("message_priority", "word_count"))`.

## 6. Reusing a library tool

`library/tools/ts/<name>/` holds `domain.ts`, `tool.ts`, `domain.test.ts` and a `README.md` (what it
computes, input and output, origin team and attempt). A tool enters only once the team that wrote it
is `ACCEPTED` with its tests green; it keeps its snake_case name and takes no dependency; a change of
behaviour is a new tool or a new version, never an edit made for one team (`library/README.md`).

- **By reference**: import its `tool.ts` from `crew/tools/index.ts` by relative path —
  `../../../../library/tools/ts/<name>/tool.ts` from `teams/<slug>/crew/tools/`. It works with
  `orkeon run`, the launchers and the bench, which all run from this workshop **(binary)**. Studio
  launches the shipped `orkeon` on the same host folder, so the path should resolve there too (not
  verified from Studio). The team is then no longer self-contained: its folder copied alone loses the import.
- **By copy**: copy the tool's folder into `crew/tools/<name>/` (and its test into
  `tests/<slug>/unit/`) when the team must travel without the workshop; note the library version it
  came from in the team `README.md`.
- `check_team.py` scans `crew/**/*.ts` only. A library file is guarded by the team's `tsc` — with the
  template's `types: []` and `lib: ["ES2022"]`, a `process` in a library domain fails the team's build
  (`TS2591: Cannot find name 'process'`, the image's `tsc` 7.0.2) — by its own tests and by the rules of § 7.

## 7. Dependency rules — dependency-cruiser

The bench enforces its layering twice (§ 9). The tools of a crew are held by the configuration below:
put it at `library/tools/ts/.dependency-cruiser.cjs` and run it from the workshop root. The harness
does not ship it yet and no hook runs it: it belongs to L0 of a TypeScript batch (`process/checklists/build.md`).
Checked with dependency-cruiser 17.4.3 on a sample workshop: a clean tree passes, eight seeded
violations give eight errors (the exit code is the number of errors).

```js
/** @type {import('dependency-cruiser').IConfiguration} */
// Layers of the TypeScript of a crew (references/typescript/clean-architecture-ddd.md). Run from the workshop root.
const BUNDLED = '^(library/tools/ts|teams/[^/]+/crew)/';         // code esbuild inlines into a crew: it runs in Jint
const TOOLS = '^(library/tools/ts|teams/[^/]+/crew/tools)/';
const ADAPTER_OR_ROOT = '(/tool\\.ts|/index\\.ts|\\.ork\\.ts)$';
const TEST = '\\.test\\.ts$';
module.exports = {
  forbidden: [
    { name: 'bundled-code-imports-local-files-only', severity: 'error',
      comment: 'Jint has no package and no node: builtin: relative imports of workshop files only.',
      from: { path: BUNDLED, pathNot: TEST }, to: { dependencyTypesNot: ['local'] } },
    { name: 'domain-never-imports-an-adapter', severity: 'error',
      from: { path: TOOLS + '.+/domain[^/]*\\.ts$', pathNot: TEST }, to: { path: ADAPTER_OR_ROOT } },
    { name: 'adapter-never-imports-an-adapter', severity: 'error',
      from: { path: TOOLS + '.+/tool\\.ts$' }, to: { path: ADAPTER_OR_ROOT } },
    { name: 'library-never-imports-a-team', severity: 'error',
      from: { path: '^library/' }, to: { path: '^teams/' } },
    { name: 'team-never-imports-another-team', severity: 'error',
      from: { path: '^teams/([^/]+)/' }, to: { path: '^teams/', pathNot: '^teams/$1/' } },
    { name: 'unit-tests-import-domains-only', severity: 'error',
      comment: 'Under Node there is no toolBuilder: a test imports domain modules, never tool.ts or the crew.',
      from: { path: '(^tests/[^/]+/unit/|^library/tools/ts/).+' + TEST }, to: { path: ADAPTER_OR_ROOT } },
    { name: 'no-test-in-a-crew', severity: 'error', from: { path: '^teams/' }, to: { path: TEST } },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: { doNotFollow: { path: 'node_modules' }, tsPreCompilationDeps: true },
};
```

```bash
npx --yes dependency-cruiser@17 --config library/tools/ts/.dependency-cruiser.cjs \
  teams/<slug>/crew library/tools/ts tests/<slug>/unit          # exit 0 = no violation
```

The three checks complement each other: dependency-cruiser sees **imports** (`node:fs`, a package, a
wrong direction); `tsc` with the template's `types: []` sees **globals** (`process`, `Buffer`,
`console`, `setTimeout`); `check_team.py` scans the text of `crew/**/*.ts` for both, and only there.

## 8. Testing with vitest

- **L1 is the domain.** vitest runs under Node, where `toolBuilder` does not exist: a test that
  imports `tool.ts` dies with `ReferenceError: toolBuilder is not defined`. The adapter is proven by
  `tsc`, by `--validate` (`tools resolved=K`) and by the L2 scenarios driven by the stub LLM — whose
  own log of the `role: tool` messages, not the event stream, shows what a custom tool answered (§ 2).
- **The tests may use Node; the domain may not.** The same code runs in Jint, so the domain uses no
  Node API even though vitest would accept it.
- **Each test cites its id** (`describe("AC-03 message_priority", …)`) and never restates a threshold.
- **No doubles needed** for a pure domain; time arrives as an argument. The bench's rule for its own
  use cases holds here too: hand-written fakes, never a mocking library (`bench-ts.md`).

```ts
// tests/mail-triage/unit/message-priority.test.ts — written red by team-test-author before the tool exists.
import { describe, expect, it } from "vitest";
import { priorityOf } from "../../../teams/mail-triage/crew/tools/message_priority/domain.ts";

describe("AC-03 message_priority", () => {
    it("is high for an urgent subject", () => expect(priorityOf({ subject: "URGENT: invoice", ageHours: 1 })).toBe("high"));
    it("is low under 24 hours", () => expect(priorityOf({ subject: "hello", ageHours: 2 })).toBe("low"));
});
```

```bash
npx --yes vitest@4 run tests/<slug>/unit library/tools/ts/<name>    # from the workshop root; L1 of the team
```

vitest and dependency-cruiser are **not installed** in the image (checked on 2026-10-02 in
`orkeon-workshop` and in the `main` probe image; `tsc` 7.0.2 and esbuild 0.25.12 are): `npx` fetches them from `registry.npmjs.org`, which
`init-firewall.sh` allows, so the first run needs the network. vitest resolves `import … from "vitest"`
without a local `node_modules` (checked with vitest 4.1.11). Pass the folders explicitly: from the
workshop root, a bare `vitest run` collects every `*.test.ts` it finds.

## 9. `orkeon-bench` — the worked example of the layering

The bench is the full four-layer version of the same split: read the `## Architecture` section of
its README (`/usr/local/share/orkeon-bench/README.md` in the image, `.devcontainer/bench/README.md`
in the harness repository) and the rule `.claude/rules/bench-ts.md` rather than a copy here. Worth
opening: `src/domain/verdict.ts` (the verdict rule as a pure function), `src/application/ports/`
(what a use case needs, named after the need), `src/interface/commands/` (parse, call one use case,
print). Its rules are enforced twice — `.dependency-cruiser.cjs` (`npm run test:arch`) and
`tests/arch/dependency-direction.test.ts` — the model § 7 follows for the tools of a crew.

## 10. Before saying a TypeScript tool is done

```bash
python3 .claude/skills/orkeon-crew-typescript/scripts/check_team.py teams/<slug>    # layout, Node APIs, imports in crew/
tsc -p teams/<slug>                                                                # types, including imported library files
(cd teams/<slug> && ./run.sh --validate)                                           # VALIDATION OK … tools resolved=K
npx --yes vitest@4 run tests/<slug>/unit library/tools/ts/<name>                    # L1
npx --yes dependency-cruiser@17 --config library/tools/ts/.dependency-cruiser.cjs teams/<slug>/crew library/tools/ts tests/<slug>/unit
```

| Symptom | Cause |
|---|---|
| `ReferenceError: toolBuilder is not defined` (vitest) | a test imports `tool.ts`: test the domain |
| `Cannot find name 'process'` (`TS2591`), `'console'` (`TS2584`), `'setTimeout'` (`TS2304`) from `tsc` | a Node or DOM global in bundled code |
| `Script tool '<name>' collides with an already-registered tool` | the tool takes the name of a built-in |
| `unknown team tool "<name>" — available: …` | a typo in `pickTools(...)` |
| the model reads `Error: Cannot read property '…' of undefined` | no input check in the adapter: a wrong or missing argument |
| `console is not defined` at run time | `console` in bundled code (Jint has none) |
