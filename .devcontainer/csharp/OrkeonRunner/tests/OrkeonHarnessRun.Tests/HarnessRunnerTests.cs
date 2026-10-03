namespace OrkeonHarnessRun.Tests;

/// <summary>
/// The runner driven in process, without any LLM: <c>--list-tools</c> and
/// <c>--validate</c> never probe the model endpoint. Hosting writes its verdicts on the
/// process-wide console, so these tests run one at a time.
/// </summary>
[Collection(ConsoleCollection.Name)]
public class HarnessRunnerTests
{
    private static string SmokeCrew => Path.Combine(AppContext.BaseDirectory, "smoke-crew");

    private static async Task<(int ExitCode, string Stdout, string Stderr)> RunAsync(HarnessRunOptions options)
    {
        var previousOut = Console.Out;
        var previousError = Console.Error;
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        Console.SetOut(stdout);
        Console.SetError(stderr);
        try
        {
            var exitCode = await HarnessRunner.RunAsync(options, stdout, TextReader.Null, stderr);
            return (exitCode, stdout.ToString(), stderr.ToString());
        }
        finally
        {
            Console.SetOut(previousOut);
            Console.SetError(previousError);
        }
    }

    [Fact]
    public async Task ListTools_PrintsTheSameBuiltInManifestAsOrkeonRun()
    {
        var (exitCode, stdout, _) = await RunAsync(new HarnessRunOptions
        {
            ListTools = true,
            SettingsPath = Path.Combine(SmokeCrew, "appsettings.echo.json"),
        });

        Assert.Equal(ExitCodes.Success, exitCode);
        var tools = stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Assert.Contains("file_read", tools);
        Assert.Contains("file_write", tools);
        Assert.Contains("human_input", tools);
        Assert.DoesNotContain("sample_extractor", tools);
    }

    [Fact]
    public async Task Validate_RefusesACrewWhoseToolIsNotRegistered()
    {
        // The smoke crew names sample_extractor, which only the plugin provides: without the
        // plugin, StrictTools fails the load instead of dropping the tool silently.
        var (exitCode, _, stderr) = await RunAsync(new HarnessRunOptions
        {
            Target = SmokeCrew,
            Validate = true,
            SettingsPath = Path.Combine(SmokeCrew, "appsettings.echo.json"),
        });

        Assert.Equal(ExitCodes.ConfigurationError, exitCode);
        Assert.Contains("VALIDATION FAILED", stderr);
        Assert.Contains("sample_extractor", stderr);
    }

    [Fact]
    public async Task Events_OnlyAcceptsJsonLines()
    {
        var (exitCode, stdout, stderr) = await RunAsync(new HarnessRunOptions { Target = SmokeCrew, Events = "xml" });

        Assert.Equal(ExitCodes.ConfigurationError, exitCode);
        Assert.Empty(stdout);
        Assert.Contains("unsupported --events format 'xml'", stderr);
    }

    [Fact]
    public async Task Plugins_ADesignatedDirectoryThatDoesNotExistIsAConfigurationError()
    {
        var (exitCode, _, stderr) = await RunAsync(new HarnessRunOptions
        {
            ListTools = true,
            SettingsPath = Path.Combine(SmokeCrew, "appsettings.echo.json"),
            PluginsDirectory = Path.Combine(SmokeCrew, "no-such-plugin-directory"),
        });

        Assert.Equal(ExitCodes.ConfigurationError, exitCode);
        Assert.Contains("plugin directory does not exist", stderr);
    }
}

/// <summary>Serializes the tests that redirect the process-wide console.</summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class ConsoleCollection
{
    public const string Name = "console";
}
