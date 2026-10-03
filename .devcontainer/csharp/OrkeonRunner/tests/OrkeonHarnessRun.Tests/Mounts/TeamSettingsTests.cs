using OrkeonHarnessRun.Mounts;

namespace OrkeonHarnessRun.Tests.Mounts;

/// <summary>
/// The team's settings file of the workshop (D33): passed as <c>--settings</c> only when the
/// command names none, exactly as the launchers do.
/// </summary>
public sealed class TeamSettingsTests : IDisposable
{
    /// <summary>A throw-away workshop: the team in <c>teams/sample/</c>, its settings in <c>settings/sample/</c>.</summary>
    private readonly string _workshop = Path.Combine(Path.GetTempPath(), "orkeon-harness-run-settings-" + Guid.NewGuid().ToString("N"));

    private readonly string _team;

    private readonly string _settings;

    public TeamSettingsTests()
    {
        _team = Path.Combine(_workshop, "teams", "sample");
        Directory.CreateDirectory(Path.Combine(_team, "crew"));
        File.WriteAllText(Path.Combine(_team, MountsFile.FileName), """{ "version": 1, "mounts": [] }""");
        _settings = Path.Combine(_workshop, "settings", "sample", "appsettings.json");
    }

    public void Dispose()
    {
        if (Directory.Exists(_workshop))
            Directory.Delete(_workshop, recursive: true);
    }

    private void WriteSettings()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_settings)!);
        File.WriteAllText(_settings, """{ "Llm": { "BaseUrl": "http://localhost:11434", "Model": "qwen3:8b" } }""");
    }

    [Fact]
    public void Apply_PassesTheTeamSettingsFileOfTheWorkshop()
    {
        WriteSettings();
        var options = new HarnessRunOptions { ConfigPath = "crew" };
        using var diagnostics = new StringWriter();

        var applied = TeamSettings.Apply(options, _team, diagnostics);

        Assert.Equal(_settings, applied);
        Assert.Equal(_settings, options.SettingsPath);
        Assert.Contains($"settings from {_settings}", diagnostics.ToString());
    }

    [Fact]
    public void Apply_FindsTheTeamFromTheCrewTarget()
    {
        WriteSettings();
        var options = new HarnessRunOptions { ConfigPath = Path.Combine("sample", "crew") };
        using var diagnostics = new StringWriter();

        Assert.Equal(_settings, TeamSettings.Apply(options, Path.GetDirectoryName(_team)!, diagnostics));
    }

    [Fact]
    public void Apply_LeavesAnExplicitSettingsFileAlone()
    {
        WriteSettings();
        var options = new HarnessRunOptions { ConfigPath = "crew", SettingsPath = "/elsewhere/appsettings.json" };
        using var diagnostics = new StringWriter();

        Assert.Null(TeamSettings.Apply(options, _team, diagnostics));
        Assert.Equal("/elsewhere/appsettings.json", options.SettingsPath);
        Assert.Empty(diagnostics.ToString());
    }

    [Fact]
    public void Apply_DoesNothingWithoutTheFileOrWithoutATeam()
    {
        using var diagnostics = new StringWriter();
        var options = new HarnessRunOptions { ConfigPath = "crew" };

        Assert.Null(TeamSettings.Apply(options, _team, diagnostics));
        Assert.Null(options.SettingsPath);
        Assert.Null(TeamSettings.Apply(new HarnessRunOptions { ConfigPath = "no-such-team/crew" }, Path.GetTempPath(), diagnostics));
    }

    [Fact]
    public void PathFor_IsTwoLevelsAboveTheTeamFolder()
    {
        Assert.Equal(_settings, TeamSettings.PathFor(_team));
        Assert.Equal(_settings, TeamSettings.PathFor(_team + Path.DirectorySeparatorChar));
    }
}
