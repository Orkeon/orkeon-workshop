//
// {{TEAM_TITLE}} — {{TEAM_DESCRIPTION}}
//
// DECLARATIVE shape: the last line hands the crew to the runner (`globalThis.crew = crew`).
// Never `await crew.run()`, never `.body()` — the tasks, the process and the deliverable
// are only honoured on this shape. The agents see only the mount points of the team
// (mounts.json): task descriptions spell their virtual paths in full.
//
//   ./run.sh --validate      # loads the crew and resolves every tool, no LLM call

import { pickTools } from "./tools/index.ts";

// ── Agents: role + goal + backstory are the prompt. Built-in tools by name, custom tools as instances.

const {{AGENT_VAR}} = agentBuilder()
    .name("{{AGENT_ID}}")
    .role("{{ROLE}}")
    .goal("{{AGENT_GOAL}}")
    .backstory(`{{BACKSTORY}}`)
    .tools([{{TOOLS}}])
    .withAutonomousTools(pickTools({{CUSTOM_TOOLS}}))
    .allowDelegation(false)
    .maxIterations({{MAX_ITER}})
    .build();

// ── Tasks: `withContext` builds the DAG — the task runs after its context and receives its output.

const {{TASK_VAR}} = taskBuilder()
    .name("{{TASK_ID}}")
    .agent({{AGENT_VAR}})
    .description(`{{DESCRIPTION}}`)
    .expectedOutput("{{EXPECTED_OUTPUT}}")
    .withContext({{PREVIOUS_TASK_VAR}})
    // Only on the task that produces the team's result, under one of its writable mount points:
    .deliverable({ path: "{{DELIVERABLE_PATH}}", source: "final_message", format: "markdown" })
    .build();

const crew = crewBuilder()
    .name("{{TEAM_SLUG}}")
    .goal("{{CREW_GOAL}}")
    .process("{{PROCESS}}")
    .withAgents([{{AGENT_VARS}}])
    .withTasks([{{TASK_VARS}}])
    .build();

// The handoff — not `await crew.run()`.
globalThis.crew = crew;
