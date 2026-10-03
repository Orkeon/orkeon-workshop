using CommandLine;

namespace OrkeonHarnessRun;

/// <summary>Entry point of <c>orkeon-harness-run</c>.</summary>
internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        var parsed = Parser.Default.ParseArguments<HarnessRunOptions>(args);
        if (parsed is not Parsed<HarnessRunOptions> { Value: var options })
        {
            // --help and --version are not failures; anything else is a usage error.
            var informational = parsed.Errors.All(
                e => e.Tag is ErrorType.HelpRequestedError or ErrorType.VersionRequestedError);
            return informational ? ExitCodes.Success : ExitCodes.ConfigurationError;
        }

        return await HarnessRunner.RunAsync(options, Console.Out, Console.In, Console.Error).ConfigureAwait(false);
    }
}

/// <summary>Exit codes, identical to the ones <c>orkeon run</c> documents.</summary>
internal static class ExitCodes
{
    /// <summary>The run, the validation or the listing succeeded.</summary>
    public const int Success = 0;

    /// <summary>Bad usage, unreadable settings, unloadable crew or plugin.</summary>
    public const int ConfigurationError = 1;

    /// <summary>The crew ran and failed.</summary>
    public const int CrewFailure = 2;

    /// <summary>The run was cancelled (SIGINT / SIGTERM).</summary>
    public const int Cancelled = 130;
}
