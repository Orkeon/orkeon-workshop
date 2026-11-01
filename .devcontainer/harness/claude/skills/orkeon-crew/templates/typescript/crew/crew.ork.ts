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

// ── A decision task (D96), only with a decision model in TEAM.md and a closed choice (a classification,
// a route, a yes/no gate); only under "sequential", "parallel" or "graph", and the crew keeps one agent.
// No agent; `.name()` is required (`.when()` names it); `fallback` always — it answers with no decision
// model (every stub run). Every option and fallback answer is a string. One `.when()` per gated task.
// Delete the block when the team has no decision.
//
// const {{DECISION_VAR}} = taskBuilder()
//     .name("{{DECISION_ID}}")
//     .description("{{DECISION_DESCRIPTION}}")
//     .expectedOutput("{{DECISION_EXPECTED_OUTPUT}}")
//     .withContext({{STATE_TASK_VAR}})
//     .decision({
//         questions: { {{QUESTION}}: { choice: { "{{OPTION_A}}": "{{WHAT_OPTION_A_MEANS}}", "{{OPTION_B}}": "{{WHAT_OPTION_B_MEANS}}" } } },
//         state: ["{{STATE_TASK_ID}}"],
//         fallback: { {{QUESTION}}: "{{OPTION_A}}" },
//     })
//     .build();
//
// The gated task: its other answers skip it, and a skip is no failure.
// const {{GATED_TASK_VAR}} = taskBuilder()
//     .name("{{GATED_TASK_ID}}")
//     .agent({{AGENT_VAR}})
//     .description(`{{DESCRIPTION}}`)
//     .expectedOutput("{{EXPECTED_OUTPUT}}")
//     .withContext({{STATE_TASK_VAR}})
//     .when("{{DECISION_ID}}", { "{{QUESTION}}": ["{{OPTION_A}}"] })   // or .when("{{DECISION_ID}}", "otherwise")
//     .build();

const crew = crewBuilder()
    .name("{{TEAM_SLUG}}")
    .goal("{{CREW_GOAL}}")
    .process("{{PROCESS}}")
    .withAgents([{{AGENT_VARS}}])
    .withTasks([{{TASK_VARS}}])
    .build();

// The handoff — not `await crew.run()`.
globalThis.crew = crew;
