using System.Diagnostics.CodeAnalysis;
using CommandLine;
using Orkeon.Constants.Cli;
using Orkeon.Hosting;

namespace OrkeonHarnessRun;

/// <summary>
/// Command line of <c>orkeon-harness-run</c>. Everything <c>orkeon run</c> accepts for a crew
/// definition comes from <see cref="RunnerOptionsBase"/> (same option names, same grammar:
/// <c>--mount</c> takes all its specs after ONE flag, <c>--allow-external-mounts</c>,
/// <c>--settings</c>, <c>--var</c>, <c>--initial-context</c>, <c>--validate</c>,
/// <c>--list-tools</c>, <c>--llm-log</c>...). This class adds the crew target as a positional
/// argument, the event protocol switch and the plugin directory.
/// </summary>
[SuppressMessage("Performance", "CA1812", Justification = "Instantiated by CommandLineParser through reflection.")]
internal sealed class HarnessRunOptions : RunnerOptionsBase
{
    /// <summary>The crew definition, as <c>orkeon run &lt;target&gt;</c> takes it.</summary>
    [Value(0, Required = false, MetaName = "target",
        HelpText = "Crew definition: a .yaml/.yml crew, a directory holding a multi-file YAML crew "
                   + "(config.yaml + agents/ + tasks/), or a .ork.ts crew definition ending with "
                   + "`globalThis.crew = crew`. Equivalent to --config. Not needed with --list-tools.")]
    public string Target { get; set; } = "";

    /// <summary>Event protocol switch; <c>jsonl</c> is the only accepted value.</summary>
    [Option(RunOptionNames.Events, Required = false, Default = null,
        HelpText = "Emit the versioned JSONL event protocol on stdout (run.started, task.started, "
                   + "task.completed, tool.called, tool.returned, cost.updated, input.needed, error, "
                   + "run.finished) instead of plain text. Only value: jsonl. Logs go to stderr.")]
    public string? Events { get; set; }

    /// <summary>Physical plugin directory, mounted privately for discovery.</summary>
    [Option("plugins", Required = false, Default = null,
        HelpText = "Physical directory holding plugin assemblies (X.dll or X/X.dll, first level only). "
                   + "It is read at startup and is NOT exposed to the agents. Default: the "
                   + "ORKEON_HARNESS_PLUGINS environment variable, then any mount that provides the "
                   + "virtual root named by Plugins:Directory (default /plugins).")]
    public string? PluginsDirectory { get; set; }
}
