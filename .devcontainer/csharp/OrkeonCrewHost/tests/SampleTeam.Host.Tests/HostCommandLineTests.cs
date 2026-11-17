using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Orkeon.Application.Crew.Execution;
using SampleTeam.Host.Composition;
using SampleTeam.Host.Mounts;

namespace SampleTeam.Host.Tests;

/// <summary>
/// The options a test bench runs the host with, as it runs <c>orkeon run</c>: explicit
/// <c>--mount</c> bindings, one <c>--settings</c> file, <c>--no-decision</c>. Independent of the
/// team's crew: they stay as they are when the startup tests are adapted to a team.
/// </summary>
public sealed class HostCommandLineTests : IDisposable
{
    private const string Declared = """
        {
          "version": 1,
          "mounts": [
            { "root": "/workspace", "access": "ro", "role": "inputs",       "default": "./input" },
            { "root": "/output",    "access": "rw", "role": "deliverables", "default": "./output" }
          ]
        }
        """;

    private readonly string _sandbox = Path.Combine(Path.GetTempPath(), "host-command-line-" + Guid.NewGuid().ToString("N"));

    public HostCommandLineTests() => Directory.CreateDirectory(_sandbox);

    public void Dispose()
    {
        if (Directory.Exists(_sandbox))
            Directory.Delete(_sandbox, recursive: true);
    }

    [Fact]
    public void Parse_ReadsTheOptionsOfOrkeonRun()
    {
        var options = HostOptions.Parse(
            ["--events", "-", "--no-decision", "--list-tools", "--settings", "/s/appsettings.json", "--mount", "/a:/workspace:ro", "/b:/output:rw", "--allow-external-mounts", "--validate"],
            environmentName: null);

        Assert.Equal(["/a:/workspace:ro", "/b:/output:rw"], options.Mounts);
        Assert.Equal("/s/appsettings.json", options.SettingsFile);
        Assert.True(options.NoDecision);
        Assert.True(options.Validate);
        Assert.True(options.ListTools);
        Assert.Equal(HostOptions.EventsToStdout, options.Events);
    }

    [Fact]
    public void Parse_RefusesAMountFlagWithoutABinding() =>
        Assert.Throws<FormatException>(() => HostOptions.Parse(["--mount", "--validate"], environmentName: null));

    [Fact]
    public void BindExplicit_BindsEveryDeclaredRootToTheFolderGiven()
    {
        var bindings = MountsFile.Parse(Declared).BindExplicit("/teams/sample", ["/sandbox/out:/output:rw", "/sandbox/in:/workspace:ro"], allowExternal: true);

        Assert.Equal(["/sandbox/in:/workspace:ro", "/sandbox/out:/output:rw"], bindings.Select(b => b.ToMountString()));
        Assert.Equal(["inputs", "deliverables"], bindings.Select(b => b.Role));
        Assert.All(bindings, b => Assert.True(b.External));
    }

    [Theory]
    [InlineData("/sandbox/in:/workspace:ro", "/output of mounts.json is not bound")]
    [InlineData("/sandbox/in:/workspace:rw|/sandbox/out:/output:rw", "declares /workspace ro, not rw")]
    [InlineData("/sandbox/in:/workspace:ro|/sandbox/out:/output:rw|/sandbox/x:/extra:rw", "/extra is not a root of mounts.json")]
    [InlineData("/sandbox/in:/workspace:ro|/sandbox/again:/workspace:ro|/sandbox/out:/output:rw", "/workspace is bound twice")]
    public void BindExplicit_RefusesWhatMountsJsonDoesNotDeclare(string specs, string message)
    {
        var error = Assert.Throws<MountsFileException>(() => MountsFile.Parse(Declared).BindExplicit("/teams/sample", specs.Split('|'), allowExternal: true));

        Assert.Contains(message, error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void BindExplicit_RefusesAFolderOutsideTheTeamWithoutTheFlag_AsOrkeonRunDoes()
    {
        var error = Assert.Throws<MountsFileException>(() => MountsFile.Parse(Declared).BindExplicit("/teams/sample", ["/sandbox/in:/workspace:ro", "/sandbox/out:/output:rw"]));

        Assert.Contains("/workspace is bound to /sandbox/in, outside the team folder /teams/sample: pass --allow-external-mounts", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void BindExplicit_BindsFoldersUnderTheTeamWithoutTheFlag()
    {
        var bindings = MountsFile.Parse(Declared).BindExplicit("/teams/sample", ["./input:/workspace:ro", "/teams/sample/output:/output:rw"]);

        Assert.All(bindings, b => Assert.False(b.External));
    }

    [Theory]
    [InlineData("/teams/sample/crew:/workspace:ro", "inside crew/")]
    [InlineData("/teams/sample/host/src:/workspace:ro", "inside host/")]
    [InlineData("/teams/sample:/workspace:ro", "bound to the team folder itself")]
    public void BindExplicit_RefusesTheReservedFoldersOfTheTeam_EvenWithTheFlag(string spec, string message)
    {
        var error = Assert.Throws<MountsFileException>(() => MountsFile.Parse(Declared).BindExplicit("/teams/sample", [spec, "/sandbox/out:/output:rw"], allowExternal: true));

        Assert.Contains(message, error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("/home/tester:/workspace:ro", "which holds the home folder")]
    [InlineData("/ws:/workspace:ro", "which holds the workshop")]
    [InlineData("/:/workspace:ro", "which holds the whole file system")]
    public void BindExplicit_RefusesAFolderThatHoldsTheHomeOrTheWorkshop_EvenWithTheFlag(string spec, string message)
    {
        var machine = new MachineFolders(Home: "/home/tester", Workshop: null, ConfigHome: null);

        var error = Assert.Throws<MountsFileException>(() => MountsFile.Parse(Declared).BindExplicit("/ws/teams/sample", [spec, "/sandbox/out:/output:rw"], allowExternal: true, machine));

        Assert.Contains(message, error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Parse_ReadsAllowExternalMounts()
    {
        Assert.True(HostOptions.Parse(["--mount", "/a:/workspace:ro", "--allow-external-mounts"], environmentName: null).AllowExternalMounts);
        Assert.False(HostOptions.Parse(["--mount", "/a:/workspace:ro"], environmentName: null).AllowExternalMounts);
    }

    [Fact]
    public void RouteConsoleAway_SendsConsoleOutputToStderrWhileStdoutCarriesTheEvents()
    {
        var original = Console.Out;
        using var stderr = new StringWriter();
        var line = $"from a tool {Guid.NewGuid():N}";
        using (ConsoleRouting.AwayFromProtocol(protocolOnStdout: true, stderr))
            Console.WriteLine(line);

        Assert.Same(original, Console.Out);
        Assert.Contains(line, stderr.ToString(), StringComparison.Ordinal);

        using (ConsoleRouting.AwayFromProtocol(protocolOnStdout: false, stderr))
            Assert.Same(original, Console.Out);
    }

    [Fact]
    public async Task Build_WithSettings_ReadsThatFileAloneAndSwitchesTheDecisionCircuitOff()
    {
        using var team = new TeamDirectory();
        var ct = TestContext.Current.CancellationToken;
        await File.WriteAllTextAsync(team.File("appsettings.json"), """{ "Llm": { "Model": "from-the-team-folder" } }""", ct);
        var settings = Path.Combine(_sandbox, "appsettings.json");
        await File.WriteAllTextAsync(settings, """{ "Llm": { "Model": "from-settings" } }""", ct);

        await using var host = TeamHost.Build(
            new HostOptions { TeamDirectory = team.Path, Events = HostOptions.EventsDisabled, SettingsFile = settings, NoDecision = true },
            TextWriter.Null);

        Assert.Equal("from-settings", host.Services.GetRequiredService<IConfiguration>()["Llm:Model"]);
        Assert.Equal(DecisionCircuit.Off, host.Services.GetRequiredService<DecisionCircuit>());
    }

    [Fact]
    public async Task ListTools_PrintsEveryRegisteredToolOncePerLine()
    {
        using var team = new TeamDirectory();
        var options = new HostOptions { TeamDirectory = team.Path, ListTools = true };
        await using var host = TeamHost.Build(options, TextWriter.Null);
        await using var stdout = new StringWriter();

        var exitCode = await TeamRun.ExecuteAsync(host, options, stdout, TextWriter.Null, TestContext.Current.CancellationToken);

        Assert.Equal(TeamRun.Success, exitCode);
        var names = stdout.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Assert.Contains("file_write", names);
        Assert.Equal(names.Order(StringComparer.Ordinal), names);
        Assert.Equal(names.Distinct(StringComparer.Ordinal), names);
    }

    [Fact]
    public void Build_RefusesASettingsFileThatDoesNotExist()
    {
        using var team = new TeamDirectory();

        Assert.Throws<FileNotFoundException>(() => TeamHost.Build(
            new HostOptions { TeamDirectory = team.Path, Events = HostOptions.EventsDisabled, SettingsFile = Path.Combine(_sandbox, "missing.json") },
            TextWriter.Null));
    }
}
