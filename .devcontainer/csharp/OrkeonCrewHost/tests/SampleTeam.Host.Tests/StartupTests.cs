using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Orkeon.Domain.Agent;
using Orkeon.Domain.Common;
using Orkeon.Domain.FileSystem;
using Orkeon.Domain.Tools;
using SampleTeam.Host.Composition;
using SampleTeam.Host.Crews;

namespace SampleTeam.Host.Tests;

/// <summary>
/// The startup tests of a C# team: what <c>orkeon run --validate</c> gives a YAML team,
/// done here by building the host and the crew for real - and never calling a model.
/// </summary>
public class StartupTests
{
    private static HostOptions Options(TeamDirectory team, string? events = HostOptions.EventsDisabled, bool validate = false) =>
        new() { TeamDirectory = team.Path, Events = events, Validate = validate };

    [Fact]
    public async Task Build_LoadsTheYamlCrewWithoutCallingTheLlm()
    {
        using var team = new TeamDirectory();
        await using var host = TeamHost.Build(Options(team), TextWriter.Null);
        await using var scope = host.Services.CreateAsyncScope();
        var ct = TestContext.Current.CancellationToken;

        var crew = await CrewLoader.LoadAsync(scope.ServiceProvider, host.HasCrewDefinition, ct);

        Assert.True(host.HasCrewDefinition);
        Assert.Equal(2, crew.Agents.Count);
        Assert.Equal(2, crew.Tasks.Count);

        // Tools live on the agents: the YAML names resolved to registered IBaseTool instances.
        var agents = await scope.ServiceProvider.GetRequiredService<IAgentRepository>().GetByIdsAsync(crew.Agents, ct);
        var tools = agents.SelectMany(a => a.Tools).Select(t => t.Name).Order(StringComparer.Ordinal);
        Assert.Equal(["file_write", "sample_extractor"], tools);

        // No Llm section in the test team: the echo provider is in place, and loading a
        // crew never reached it.
        Assert.Equal(0, host.Services.GetRequiredService<EchoLlmProvider>().Calls);
    }

    [Fact]
    public async Task Build_WithoutACrewDirectory_BuildsTheCrewInCode()
    {
        using var team = new TeamDirectory(withCrewDefinition: false);
        await using var host = TeamHost.Build(Options(team), TextWriter.Null);
        await using var scope = host.Services.CreateAsyncScope();
        var ct = TestContext.Current.CancellationToken;

        var crew = await CrewLoader.LoadAsync(scope.ServiceProvider, host.HasCrewDefinition, ct);

        Assert.False(host.HasCrewDefinition);
        Assert.Single(crew.Agents);
        Assert.Single(crew.Tasks);
        var agents = await scope.ServiceProvider.GetRequiredService<IAgentRepository>().GetByIdsAsync(crew.Agents, ct);
        Assert.Equal("sample_extractor", Assert.Single(Assert.Single(agents).Tools).Name);
    }

    [Fact]
    public async Task Build_RegistersTheTeamToolByName()
    {
        using var team = new TeamDirectory();
        await using var host = TeamHost.Build(Options(team), TextWriter.Null);

        var tool = await host.Services.GetRequiredService<IToolRegistry>().GetToolByNameAsync("sample_extractor");

        Assert.NotNull(tool);
        Assert.Equal("sample_extractor", tool.Name);
    }

    [Fact]
    public async Task Build_MountsTheRootsOfMountsJsonAndNothingElseForTheAgents()
    {
        using var team = new TeamDirectory();
        await using var host = TeamHost.Build(Options(team, events: null), TextWriter.Null);

        var visible = host.Services.GetRequiredService<IFileSystemService>().GetAvailableMounts().Select(m => m.VirtualPath);

        // /crew is the definition (read-only), /workspace and /output come from mounts.json;
        // the internal /_run root that receives events.jsonl is NOT agent-facing.
        Assert.Equal(["/crew", "/output", "/workspace"], visible.Order(StringComparer.Ordinal));
        Assert.True(Directory.Exists(team.File("output")));
    }

    [Theory]
    [InlineData("Mounts")]
    [InlineData("InternalMounts")]
    public void Build_RefusesASettingsFileThatDeclaresMounts(string key)
    {
        using var team = new TeamDirectory();
        File.WriteAllText(team.File("appsettings.json"), $$"""{ "Orkeon": { "FileSystem": { "{{key}}": [ "/elsewhere:/extra:rw" ] } } }""");

        // Merged index by index with the host's own mounts, the entry would stay mounted.
        var error = Assert.Throws<FormatException>(() => TeamHost.Build(Options(team), TextWriter.Null));

        Assert.Equal(
            $"{team.File("appsettings.json")}: a settings file may not declare Orkeon:FileSystem:{key}: the team's mount points come from mounts.json",
            error.Message);
    }

    [Fact]
    public async Task Build_AllowsTheFoldersOfTheTeamAfterTheDirectoriesTheSettingsAllow()
    {
        using var team = new TeamDirectory();
        await File.WriteAllTextAsync(
            team.File("appsettings.json"),
            """{ "PathSecurity": { "AdditionalAllowedDirectories": [ "/declared/a", "/declared/b" ] } }""",
            TestContext.Current.CancellationToken);
        await using var host = TeamHost.Build(Options(team), TextWriter.Null);

        var allowed = host.Services.GetRequiredService<IConfiguration>()
            .GetSection("PathSecurity:AdditionalAllowedDirectories").GetChildren()
            .Select(entry => entry.Value)
            .ToList();

        Assert.Equal(["/declared/a", "/declared/b", team.File("crew"), team.File("input"), team.File("output")], allowed);
    }

    [Fact]
    public async Task Validate_PrintsTheVerdictAndWritesNoEvents()
    {
        using var team = new TeamDirectory();
        await using var host = TeamHost.Build(Options(team, events: null, validate: true), TextWriter.Null);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();

        var exitCode = await TeamRun.ExecuteAsync(
            host, Options(team, events: null, validate: true), stdout, stderr, TestContext.Current.CancellationToken);

        Assert.Equal(TeamRun.Success, exitCode);
        Assert.Equal("VALIDATION OK: /crew (agents=2, tasks=2, tools resolved=2)", stdout.ToString().Trim());
        Assert.False(File.Exists(team.File("run", "events.jsonl")));
    }

    [Fact]
    public async Task Validate_FailsOnAToolTheHostDoesNotRegister()
    {
        using var team = new TeamDirectory();
        await File.WriteAllTextAsync(
            team.File("crew", "agents", "extractor.yaml"),
            "role: \"Extractor\"\ngoal: \"g\"\nbackstory: \"b\"\ntools:\n  - \"no_such_tool\"\n",
            TestContext.Current.CancellationToken);
        await using var host = TeamHost.Build(Options(team, validate: true), TextWriter.Null);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();

        var exitCode = await TeamRun.ExecuteAsync(
            host, Options(team, validate: true), stdout, stderr, TestContext.Current.CancellationToken);

        Assert.Equal(TeamRun.ConfigurationError, exitCode);
        Assert.Contains("no_such_tool", stderr.ToString());
    }

    [Fact]
    public void Build_RefusesAnEventFileWhoseDirectoryContainsAMountedRoot()
    {
        using var team = new TeamDirectory();

        // <team>/events.jsonl would turn the team directory itself into the internal /_run
        // mount, hiding /crew, /workspace and /output from the agents.
        var error = Assert.Throws<FormatException>(() => TeamHost.Build(Options(team, events: "events.jsonl"), TextWriter.Null));

        Assert.Contains("directory of its own", error.Message);
    }

    [Fact]
    public async Task Run_WithTheEchoProvider_WritesTheEventStreamThroughTheVfs()
    {
        using var team = new TeamDirectory();
        var options = Options(team, events: null);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();

        int exitCode;
        await using (var host = TeamHost.Build(options, stdout))
        {
            exitCode = await TeamRun.ExecuteAsync(host, options, stdout, stderr, TestContext.Current.CancellationToken);
        }

        Assert.True(exitCode == TeamRun.Success, stderr.ToString());

        // The host is disposed: events.jsonl is flushed and closed.
        var events = (await File.ReadAllLinesAsync(team.File("run", "events.jsonl"), TestContext.Current.CancellationToken))
            .Where(line => line.Length > 0)
            .Select(line => JsonDocument.Parse(line).RootElement)
            .ToList();
        var kinds = events.Select(e => e.GetProperty("kind").GetString()).ToList();

        Assert.Equal("run.started", kinds[0]);
        Assert.Equal("run.finished", kinds[^1]);
        Assert.Equal(2, kinds.Count(k => k == "task.started"));
        Assert.Equal(2, kinds.Count(k => k == "task.completed"));
        Assert.All(events, e => Assert.Equal(2, e.GetProperty("v").GetInt32()));
        Assert.Equal(Enumerable.Range(1, events.Count).Select(i => (long)i), events.Select(e => e.GetProperty("seq").GetInt64()));

        var finished = events[^1];
        Assert.True(finished.GetProperty("success").GetBoolean());
        Assert.Equal(0, finished.GetProperty("exitCode").GetInt32());
        Assert.True(finished.TryGetProperty("durationMs", out _));
        Assert.True(finished.TryGetProperty("promptTokens", out _));
        Assert.True(finished.TryGetProperty("completionTokens", out _));
    }
}
