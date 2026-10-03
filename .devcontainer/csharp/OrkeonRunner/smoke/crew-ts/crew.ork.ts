/// <reference orkeon-script="1.0" />
//
// The TypeScript form of the smoke crew: a DECLARATIVE definition (it ends with
// `globalThis.crew = crew`, not `await crew.run()`) that names a C# tool only a plugin
// provides. Built-in and plugin tools are listed by name with `.tools([...])`; the
// resolution is strict, exactly as for a YAML crew.
//
//   orkeon-harness-run crew-ts/crew.ork.ts --validate                  -> fails: unknown tool
//   orkeon-harness-run crew-ts/crew.ork.ts --validate --plugins <dir>  -> VALIDATION OK
//
// esbuild is required to load a .ork.ts (ORKEON_ESBUILD_PATH, or esbuild on the PATH).

const extractor = agentBuilder()
    .name("extractor")
    .role("Extractor")
    .goal("Extract the key/value pairs of the notes file with the sample_extractor tool")
    .backstory(`You read structured notes. You always call the sample_extractor tool on the
virtual path you are given and you report what it returns, nothing else.`)
    .tools(["sample_extractor"])
    .maxIterations(3)
    .build();

const extract = taskBuilder()
    .name("extract")
    .agent(extractor)
    .description(`Call sample_extractor with path "/workspace/notes.txt" and list every key
and value it returns, one per line, as "key = value".`)
    .expectedOutput("One line per extracted entry, formatted as key = value")
    .build();

const crew = crewBuilder()
    .name("plugin-smoke-ts")
    .goal("Prove that a TypeScript crew can name a C# tool contributed by a plugin")
    .process("sequential")
    .withAgents([extractor])
    .withTasks([extract])
    .build();

globalThis.crew = crew;
