// Custom tools of the team, written in TypeScript and handed to agents as instances
// (`.withAutonomousTools(pickTools("..."))`). Pure JavaScript only: there is no Node here
// (no fs, fetch, process) — reading files or the web is the built-in tools' job.

// `toolBuilder<TIn, TOut>` states what the schema promises: without the generics `input`
// is `unknown` and every field access is a type error.
const {{TOOL_VAR}} = toolBuilder<{ {{TOOL_INPUT_TYPE}} }, { {{TOOL_OUTPUT_TYPE}} }>()
    .name("{{TOOL_NAME}}")
    .description("{{TOOL_DESCRIPTION}}")
    .withSchema({
        type: "object",
        properties: { {{TOOL_SCHEMA_PROPERTIES}} },
        required: [{{TOOL_REQUIRED}}],
    })
    .execute((input) => {
        {{TOOL_BODY}}
    })
    .access("read")
    .build();

const all = [{{TOOL_VARS}}];

/**
 * The named subset an agent carries. Throws on an unknown name rather than handing back a
 * shorter array: a silently missing tool is a bug found at run time, in a confused answer.
 */
export function pickTools(...names: string[]) {
    return names.map((name) => {
        const found = all.find((t) => t.name === name);
        if (!found) {
            throw new Error(`unknown team tool "${name}" — available: ${all.map((t) => t.name).join(", ")}`);
        }
        return found;
    });
}
