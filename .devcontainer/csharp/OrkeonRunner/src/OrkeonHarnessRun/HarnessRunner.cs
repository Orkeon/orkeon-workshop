using Orkeon.Hosting;
using Orkeon.Plugins;
using OrkeonHarnessRun.Events;
using OrkeonHarnessRun.Mounts;
using OrkeonHarnessRun.Plugins;

namespace OrkeonHarnessRun;

/// <summary>
/// Runs a crew exactly as <c>orkeon run</c> does - same host (<see cref="RunnerHost"/>),
/// same one-shot pipeline (<see cref="RunnerExecution.RunOneShotAsync"/>), same tool set,
/// same arguments, same exit codes - and adds the one thing no binary shipped with Orkeon
/// rc.4 does: <c>AddOrkeonPlugins</c>. A plugin's tools are registered before the
/// container is built, so <c>--list-tools</c> shows them and <c>--validate</c> resolves
/// them under StrictTools. Two conveniences on top, as the launchers do: without
/// <c>--mount</c>, the mounts come from the team's <c>mounts.json</c> (see
/// <see cref="TeamMounts"/>); without <c>--settings</c>, the team's own settings file of the
/// workshop is passed when it exists (see <see cref="TeamSettings"/>).
/// </summary>
internal static class HarnessRunner
{
    /// <summary>Logger category of runner-level messages.</summary>
    public const string LoggerCategory = "orkeon-harness-run";

    private const string JsonLines = "jsonl";

    /// <summary>Runs the command described by <paramref name="options"/>.</summary>
    /// <param name="options">Parsed command line.</param>
    /// <param name="stdout">Standard output: plain text, or the event protocol with <c>--events jsonl</c>.</param>
    /// <param name="stdin">Standard input: answers to <c>input.needed</c> under the event protocol.</param>
    /// <param name="stderr">Diagnostics.</param>
    /// <returns>The process exit code (see <see cref="ExitCodes"/>).</returns>
    public static async Task<int> RunAsync(HarnessRunOptions options, TextWriter stdout, TextReader stdin, TextWriter stderr)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(stdout);
        ArgumentNullException.ThrowIfNull(stdin);
        ArgumentNullException.ThrowIfNull(stderr);

        // `orkeon run <target>`: the positional argument is the crew definition.
        if (string.IsNullOrWhiteSpace(options.ConfigPath) && !string.IsNullOrWhiteSpace(options.Target))
            options.ConfigPath = options.Target;

        if (options.Events is not null && !string.Equals(options.Events, JsonLines, StringComparison.OrdinalIgnoreCase))
        {
            await stderr.WriteLineAsync(
                $"{LoggerCategory}: unsupported --events format '{options.Events}' (only: {JsonLines}).").ConfigureAwait(false);
            return ExitCodes.ConfigurationError;
        }

        // --list-tools prints a manifest and --validate a verdict, both as plain text by their
        // own contract; wrapping them in the protocol would interleave raw text and JSONL.
        var diagnosticMode = options.ListTools || options.Validate;
        if (options.Events is not null && diagnosticMode)
        {
            await stderr.WriteLineAsync(
                $"{LoggerCategory}: --events has no effect with --list-tools or --validate; plain output follows.").ConfigureAwait(false);
        }

        // The crew's final answer moves to stderr on an observed run: stdout carries the
        // protocol and nothing else.
        var observed = options.Events is not null && !diagnosticMode;
        options.MachineReadableStdout = observed;
        using var observation = observed ? new RunObservation(stdout, stdin) : null;
        observation?.Started(options.ConfigPath);

        int exitCode;
        try
        {
            // No --settings on the command line: the team's own settings file, when it exists (D33).
            TeamSettings.Apply(options, Environment.CurrentDirectory, stderr);

            // No --mount on the command line: use the team's mounts.json when there is one.
            TeamMounts.Apply(
                options, Environment.CurrentDirectory, Environment.GetEnvironmentVariable(TeamMounts.EnvironmentVariable), stderr);

            exitCode = await RunnerExecution.RunOneShotAsync(
                options,
                LoggerCategory,
                configureServices: (context, services) =>
                {
                    // Parity with `orkeon run`: its shared-runner route registers this tool too.
                    services.AddSemanticSearchTool();

                    // Plugins first, observation second: the observer wraps every IBaseTool
                    // registered so far, plugin tools included.
                    PluginBootstrap.AddPlugins(
                        services, context.Configuration, options.PluginsDirectory,
                        Environment.GetEnvironmentVariable(PluginBootstrap.DirectoryVariable), stderr);
                    observation?.Wire(services);
                }).ConfigureAwait(false);
        }
        catch (PluginLoadException ex)
        {
            await stderr.WriteLineAsync($"ERROR: plugin loading failed: {ex.Message}").ConfigureAwait(false);
            exitCode = ExitCodes.ConfigurationError;
        }
        catch (Exception ex) when (ex is DirectoryNotFoundException or MountsFileException)
        {
            await stderr.WriteLineAsync($"ERROR: {ex.Message}").ConfigureAwait(false);
            exitCode = ExitCodes.ConfigurationError;
        }

        observation?.Finished(exitCode);
        return exitCode;
    }
}
