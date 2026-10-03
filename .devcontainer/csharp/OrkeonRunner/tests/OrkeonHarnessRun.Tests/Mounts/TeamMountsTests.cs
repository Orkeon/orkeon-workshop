using OrkeonHarnessRun.Mounts;

namespace OrkeonHarnessRun.Tests.Mounts;

/// <summary>
/// The mounts.json convenience: used only when the command line gives no mount, and
/// producing exactly the arguments a launcher would pass to <c>orkeon run</c>.
/// </summary>
public sealed class TeamMountsTests : IDisposable
{
    private const string Sample = """
        {
          "version": 1,
          "mounts": [
            { "root": "/workspace", "access": "ro", "role": "inputs",       "default": "./input"  },
            { "root": "/output",    "access": "rw", "role": "deliverables", "default": "./output" }
          ]
        }
        """;

    /// <summary>A throw-away workshop: the team in <c>teams/sample/</c>, its mount sets next to <c>teams/</c>.</summary>
    private readonly string _workshop = Path.Combine(Path.GetTempPath(), "orkeon-harness-run-workshop-" + Guid.NewGuid().ToString("N"));

    private readonly string _team;

    public TeamMountsTests()
    {
        _team = Path.Combine(_workshop, "teams", "sample");
        Directory.CreateDirectory(Path.Combine(_team, "crew"));
        Directory.CreateDirectory(Path.Combine(_team, "input"));
        File.WriteAllText(Path.Combine(_team, MountsFile.FileName), Sample);
    }

    public void Dispose()
    {
        if (Directory.Exists(_workshop))
            Directory.Delete(_workshop, recursive: true);
    }

    [Fact]
    public void Apply_DerivesTheMountsOfTheTeamFolder()
    {
        var options = new HarnessRunOptions { ConfigPath = "crew" };
        using var diagnostics = new StringWriter();

        var applied = TeamMounts.Apply(options, _team, environmentName: null, diagnostics);

        Assert.True(applied);
        Assert.Equal(
            [$"{Path.Combine(_team, "input")}:/workspace:ro", $"{Path.Combine(_team, "output")}:/output:rw"],
            options.Mounts);
        Assert.False(options.AllowExternalMounts);
        Assert.True(Directory.Exists(Path.Combine(_team, "output")));
        Assert.Contains("(environment: default): /workspace:ro /output:rw", diagnostics.ToString());
    }

    [Fact]
    public void Apply_LeavesAnExplicitMountAlone()
    {
        var options = new HarnessRunOptions { ConfigPath = "crew", Mounts = ["/data:/workspace:ro"] };
        using var diagnostics = new StringWriter();

        Assert.False(TeamMounts.Apply(options, _team, null, diagnostics));
        Assert.Equal(["/data:/workspace:ro"], options.Mounts);
        Assert.Empty(diagnostics.ToString());
    }

    [Fact]
    public void Apply_DoesNothingForListToolsOrWithoutMountsJson()
    {
        using var diagnostics = new StringWriter();
        var elsewhere = Path.GetTempPath();

        Assert.False(TeamMounts.Apply(new HarnessRunOptions { ListTools = true }, _team, null, diagnostics));
        Assert.False(TeamMounts.Apply(new HarnessRunOptions { ConfigPath = "no-such-team/crew" }, elsewhere, null, diagnostics));
    }

    [Fact]
    public void Apply_FindsTheTeamFolderFromTheCrewTarget()
    {
        // Run from above the team folder: orkeon-harness-run <team>/crew
        var parent = Path.GetDirectoryName(_team)!;
        var options = new HarnessRunOptions { ConfigPath = Path.Combine(Path.GetFileName(_team), "crew") };
        using var diagnostics = new StringWriter();

        Assert.True(TeamMounts.Apply(options, parent, null, diagnostics));
        Assert.Equal(2, options.Mounts.Count());

        // The team folder lies under the working directory: nothing is external for Orkeon.
        Assert.False(options.AllowExternalMounts);
    }

    [Fact]
    public void Apply_BindsAMountSetOutsideTheWorkingDirectoryAndAllowsItsMounts()
    {
        var set = Path.Combine(_workshop, "mounts.prod", "sample");
        Directory.CreateDirectory(Path.Combine(set, "workspace"));
        var options = new HarnessRunOptions { ConfigPath = "crew" };
        using var diagnostics = new StringWriter();

        Assert.True(TeamMounts.Apply(options, _team, "prod", diagnostics));

        // What orkeon run requires as soon as a mount is outside the working directory.
        Assert.True(options.AllowExternalMounts);
        Assert.Equal(
            [$"{Path.Combine(set, "workspace")}:/workspace:ro", $"{Path.Combine(set, "output")}:/output:rw"],
            options.Mounts);
        Assert.True(Directory.Exists(Path.Combine(set, "output")));
        Assert.Contains("(environment: prod)", diagnostics.ToString());
    }

    [Fact]
    public void Apply_RefusesAMountSetWhoseReadOnlyRootIsMissing()
    {
        Directory.CreateDirectory(Path.Combine(_workshop, "mounts.prod", "sample"));
        var options = new HarnessRunOptions { ConfigPath = "crew" };
        using var diagnostics = new StringWriter();

        var error = Assert.Throws<MountsFileException>(() => TeamMounts.Apply(options, _team, "prod", diagnostics));

        Assert.Contains("read-only root /workspace", error.Message);
    }

    // The rule case by case is MountReachTests; these cases go through the runner's own route.
    [Theory]
    [InlineData(".", "is bound to the team folder itself")]
    [InlineData("./crew", "inside crew/")]
    [InlineData("./appsettings", "Orkeon looks for appsettings/appsettings.json in the team folder")]
    [InlineData("../../settings/sample", "inside the settings of every team")]
    [InlineData("../../workbooks/sample", "inside the workbooks of every team")]
    public void Apply_RefusesAFolderTheAgentsMustNeverReach(string path, string expected)
    {
        File.WriteAllText(
            Path.Combine(_team, MountsFile.FileName),
            $$"""{ "mounts": [ { "root": "/drafts", "access": "rw", "role": "deliverables", "default": "{{path}}" } ] }""");
        var options = new HarnessRunOptions { ConfigPath = "crew" };
        using var diagnostics = new StringWriter();

        var error = Assert.Throws<MountsFileException>(() => TeamMounts.Apply(options, _team, environmentName: null, diagnostics));

        Assert.Contains(expected, error.Message);
        Assert.Empty(options.Mounts);
    }

    [Fact]
    public void Apply_RefusesAMountSetWithoutAFolderForTheTeam()
    {
        Directory.CreateDirectory(Path.Combine(_workshop, "mounts.prod", "sample"));
        var options = new HarnessRunOptions { ConfigPath = "crew" };
        using var diagnostics = new StringWriter();

        var error = Assert.Throws<MountsFileException>(() => TeamMounts.Apply(options, _team, "staging", diagnostics));

        Assert.Contains("unknown environment \"staging\"", error.Message);
        Assert.Contains("(known: default, prod)", error.Message);
    }
}
