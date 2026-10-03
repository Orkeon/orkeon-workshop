# A TypeScript team

*English · [Français](../fr/guides/typescript-team.md)*

Choose TypeScript when a team needs **custom tools**: a computation, a parsing step, a business rule
the model would do badly or expensively — a score, a normalisation, a regex extraction, a total. The
team is written with Orkeon's `.ork.ts` scripting language, in its declarative shape, and the
`orkeon-crew-typescript` skill generates it.

## Ask for it

```text
Create a TypeScript team that reads support tickets, scores their urgency with a deterministic rule
(keywords, customer tier, age) and writes the ten most urgent with their score.
```

The skill makes the same decisions as the YAML one — slug, folder, mount points, deliverable, agents,
tasks ([A YAML team](./yaml-team.md#what-the-skill-decides)) — and adds the custom tools. If the need
calls for something only YAML has (a task's guardrails or model settings `llmOverride`, a `graphConfig`,
a memory provider), it says so and suggests the YAML skill.

## What it writes

```text
teams/ticket-urgency/
├── mounts.json
├── crew/crew.ork.ts         the team — exact name: Studio launches it without asking
├── crew/tools/index.ts      the custom tools (only when there are some)
├── studio-team.json
├── tsconfig.json            type checking in the editor
├── typings/orkeon.d.ts      the typings of the scripting language
├── README.md
├── run.sh, run.cmd          written by orkeon-bench scaffold
├── .gitignore               written by orkeon-bench scaffold: what the team reads and writes stays out of git
└── <one folder per mount point, each with a .gitkeep>
```

The shape of `crew/crew.ork.ts`:

```typescript
import { pickTools } from "./tools/index.ts";

const scorer = agentBuilder()
    .name("scorer")
    .role("Support triage analyst")
    .goal("Rank the tickets of /tickets by urgency")
    .backstory(`Methodical. Always scores with the score_ticket tool, never by guess.`)
    .tools(["file_read", "directory_read"])
    .withAutonomousTools(pickTools("score_ticket"))
    .allowDelegation(false)
    .maxIterations(12)
    .build();

const rank = taskBuilder()
    .name("rank")
    .agent(scorer)
    .description(`List /tickets with directory_read, read each ticket, score it with score_ticket.`)
    .expectedOutput("The ten most urgent tickets, one per line, with their score.")
    .deliverable({ path: "/reports/urgent.md", source: "final_message", format: "markdown" })
    .build();

const crew = crewBuilder()
    .name("ticket-urgency")
    .goal("Find the most urgent support tickets")
    .process("sequential")
    .withAgents([scorer])
    .withTasks([rank])
    .build();

globalThis.crew = crew;   // the handoff to the runner — never `await crew.run()`
```

And a custom tool, in `crew/tools/index.ts`:

```typescript
const scoreTicket = toolBuilder<{ text: string; tier: string; ageDays: number }, { score: number }>()
    .name("score_ticket")
    .description("Scores the urgency of a ticket from 0 to 100")
    .withSchema({
        type: "object",
        properties: {
            text: { type: "string" },
            tier: { type: "string" },
            ageDays: { type: "number" },
        },
        required: ["text", "tier", "ageDays"],
    })
    .execute((input) => {
        const keywords = /outage|down|blocked|urgent/i.test(input.text) ? 40 : 0;
        const tier = input.tier === "gold" ? 30 : 10;
        return { score: Math.min(100, keywords + tier + Math.min(30, input.ageDays * 3)) };
    })
    .access("read")
    .build();

// …and pickTools(...names), which hands the named tools to an agent (written by the skill).
```

A custom tool is **pure JavaScript**: no Node API (`fs`, `fetch`, `process`) — reading files or the web
is the job of the built-in tools. Fixed data shipped with the team (a template, a list) goes in `crew/`
and is read as `/script/<file>`.

## How it checks the team

Three checks:

```bash
python3 .claude/skills/orkeon-crew-typescript/scripts/check_team.py teams/ticket-urgency --orkeon orkeon
npx --no-install tsc -p teams/ticket-urgency          # zero type errors
cd teams/ticket-urgency && ./run.sh --validate
```

`check_team.py` catches what neither `tsc` nor `--validate` sees: the Studio layout, folders, card and
launchers that disagree with `mounts.json`, a mount point bound to a folder the team's agents must never reach, a
deliverable outside the writable mount points, a Node API, an `.llm()` that names a vendor or a model
(refused or warned: the model comes from the settings, `llm.default_` or a named profile), a team settings file holding a secret or a machine-wide
setting, a settings file above the crews, and `shell_command` (warned; refused in a team with a mail
account); in the image it also runs `orkeon-studio-check`, Studio's own reading of the team. `--validate` counts the
custom tools in `tools resolved=K`.

Next: [C# tools](./csharp-tools.md).
