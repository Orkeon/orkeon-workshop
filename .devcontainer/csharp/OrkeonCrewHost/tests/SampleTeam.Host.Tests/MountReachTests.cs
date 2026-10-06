using SampleTeam.Host.Mounts;

namespace SampleTeam.Host.Tests;

/// <summary>
/// The reach rule of <c>mounts.json</c> (D40), case by case as its specification lists them; orkeon-bench
/// and the check scripts run the same cases. The team is <c>ws/teams/alpha</c> of a throw-away root, the
/// home folder <c>home/u</c> lies beside the workshop, <c>$ORKEON_WORKSHOP</c> names the team's own
/// workshop and <c>$XDG_CONFIG_HOME</c> is unset, unless a case says otherwise. In the paths of the cases,
/// <c>{root}</c>, <c>{ws}</c>, <c>{home}</c> and <c>{team}</c> stand for those folders; a token in upper
/// case is the same folder spelled in upper case.
/// </summary>
public sealed class MountReachTests : IDisposable
{
    private const string HiddenFolder = "a hidden folder of the home folder, where tools keep their settings and credentials";
    private const string SettingsAbove = "a folder where Orkeon looks for the settings of every run above the crews";
    private const string HomeFolder = "the home folder, with the settings and credentials of the machine's tools";

    private readonly string _root = Path.Combine(Path.GetTempPath(), "mount-reach-" + Guid.NewGuid().ToString("N"));

    public MountReachTests() => Directory.CreateDirectory(Team);

    private string Workshop => Path.Combine(_root, "ws");

    private string Team => Path.Combine(Workshop, "teams", "alpha");

    private string Home => Path.Combine(_root, "home", "u");

    private MachineFolders Machine => new(Home, Workshop, ConfigHome: null);

    public void Dispose()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    private string Expand(string path) => path
        .Replace("{team}", Team, StringComparison.Ordinal)
        .Replace("{TEAM}", Team.ToUpperInvariant(), StringComparison.Ordinal)
        .Replace("{ws}", Workshop, StringComparison.Ordinal)
        .Replace("{WS}", Workshop.ToUpperInvariant(), StringComparison.Ordinal)
        .Replace("{home}", Home, StringComparison.Ordinal)
        .Replace("{root}", _root, StringComparison.Ordinal);

    /// <summary>The folder a case binds, as the messages print it: absolute, in its own spelling.</summary>
    private string Physical(string path) => Path.TrimEndingDirectorySeparator(Path.GetFullPath(Expand(path), Team));

    /// <summary>Binds one writable mount point, <c>/drafts</c>, to <paramref name="path"/> as the team's own folder.</summary>
    private IReadOnlyList<MountBinding> Bind(string path, MachineFolders? machine = null, string? team = null)
    {
        var folder = Expand(path).Replace("\\", "\\\\", StringComparison.Ordinal);
        var file = MountsFile.Parse($$"""{ "mounts": [ { "root": "/drafts", "access": "rw", "role": "deliverables", "default": "{{folder}}" } ] }""");
        return file.Bind(team ?? Team, environment: null, machine ?? Machine);
    }

    private string Refusal(string path, MachineFolders? machine = null, string? team = null) =>
        Assert.Throws<MountsFileException>(() => Bind(path, machine, team)).Message;

    private string Holds(string path, string what) =>
        $"mounts.json: /drafts is bound to {Physical(path)}, which holds {what}: its agents would reach it - bind a folder of its own";

    private string Inside(string path, string what) =>
        $"mounts.json: /drafts is bound to {Physical(path)}, inside {what}: its agents would reach it - bind a folder of its own";

    [Theory]
    [InlineData(".")]
    [InlineData("./")]
    [InlineData("../alpha")]
    [InlineData("{team}")]
    [InlineData("{TEAM}")]
    public void Bind_RefusesTheTeamFolderItself(string path)
    {
        Assert.Equal(
            "mounts.json: /drafts is bound to the team folder itself: its agents would reach crew/, the launchers and mounts.json, and on a writable point leave an appsettings.json that the next run reads - bind a sub-folder such as ./drafts",
            Refusal(path));
    }

    [Theory]
    [InlineData("./crew", "./crew")]
    [InlineData("./Crew", "./Crew")]
    [InlineData("./Crew/x", "./Crew/x")]
    [InlineData("{ws}/teams/ALPHA/crew", "./crew")]
    public void Bind_RefusesAFolderInsideCrew(string path, string inside)
    {
        Assert.Equal(
            $"mounts.json: /drafts is bound to {inside}, inside crew/: its agents would reach the definition of the team, and on a writable point change it or leave an appsettings.json that the next run reads - bind a folder of its own",
            Refusal(path));
    }

    [Theory]
    [InlineData("./appsettings", "./appsettings", "appsettings")]
    [InlineData("./_shared/x", "./_shared/x", "_shared")]
    public void Bind_RefusesAFolderNameKeptForSettings(string path, string inside, string name)
    {
        Assert.Equal(
            $"mounts.json: /drafts is bound to {inside}: Orkeon looks for {name}/appsettings.json in the team folder when it searches for settings above crew/, so that name is kept for settings - name the folder otherwise",
            Refusal(path));
    }

    [Theory]
    [InlineData("./crew.", "crew.")]
    [InlineData("./notes ", "notes ")]
    [InlineData("./notes./in", "notes.")]
    [InlineData("{root}/srv/data./in", "data.")]
    [InlineData("./...", "...")]
    public void Bind_RefusesAFolderNameEndingWithADotOrASpace(string path, string name)
    {
        Assert.Equal(
            $"mounts.json: /drafts is bound to {Expand(path)}, whose folder name \"{name}\" ends with a dot or a space: Windows drops them, so on the host Orkeon Studio and run.cmd would bind another folder - name the folder without them",
            Refusal(path));
    }

    // agents and tasks: Orkeon Studio and orkeon run read crew/ first, whatever the root holds (fb26364, STUDIO-59).
    [Theory]
    [InlineData("./agents")]
    [InlineData("./Tasks")]
    [InlineData("./data/agents")]
    [InlineData("./inbox")]
    [InlineData("./inbox/.")]
    [InlineData("./.inbox")]
    public void Bind_AcceptsAnyOtherFolderOfTheTeam(string path)
    {
        var binding = Assert.Single(Bind(path));

        Assert.False(binding.External);
        Assert.Equal(Physical(path), binding.PhysicalPath);
    }

    [Theory]
    [InlineData("/", "the whole file system")]
    [InlineData("{home}", HomeFolder)]
    [InlineData("{root}/home", HomeFolder)]
    [InlineData("{ws}", "the workshop")]
    [InlineData("{WS}", "the workshop")]
    [InlineData("{ws}/teams", "every team")]
    [InlineData("{ws}/settings", "the settings of every team")]
    [InlineData("{ws}/workbooks", "the workbooks of every team, with the approvals of paid runs")]
    [InlineData("{ws}/tests", "the tests of every team, with their budgets")]
    [InlineData("{ws}/.claude", "the harness")]
    [InlineData("{ws}/references", "the reference documents Claude builds teams from")]
    [InlineData("{ws}/.devcontainer", "the workshop's container configuration, which runs at its next start")]
    [InlineData("{ws}/teams/appsettings", SettingsAbove)]
    [InlineData("{ws}/_shared", SettingsAbove)]
    [InlineData("/appsettings", SettingsAbove)]
    [InlineData("{ws}/mounts.test", "the mount sets of every team")]
    public void Bind_RefusesAFolderThatHoldsAGuardedOne(string path, string what)
    {
        Assert.Equal(Holds(path, what), Refusal(path));
    }

    [Theory]
    [InlineData("{ws}/settings/alpha", "the settings of every team")]
    [InlineData("{ws}/workbooks/alpha", "the workbooks of every team, with the approvals of paid runs")]
    [InlineData("{ws}/tests/alpha/datasets", "the tests of every team, with their budgets")]
    [InlineData("{ws}/.claude/skills", "the harness")]
    [InlineData("{ws}/library/datasets", "the workshop's library, which other teams are built from")]
    [InlineData("{ws}/.git/hooks", "the workshop's git repository, whose hooks run at the next git command")]
    [InlineData("{ws}/teams/_shared/x", SettingsAbove)]
    [InlineData("{home}/.ssh", HiddenFolder)]
    [InlineData("{home}/.config/gh", HiddenFolder)]
    [InlineData("{home}/.config/Orkeon", HiddenFolder)]
    [InlineData("{home}/.claude", HiddenFolder)]
    [InlineData("{home}/AppData/Roaming/Orkeon", "the user's application data, with Orkeon Studio's settings and the tokens of its mail accounts")]
    public void Bind_RefusesAFolderInsideAClosedOne(string path, string what)
    {
        Assert.Equal(Inside(path, what), Refusal(path));
    }

    [Theory]
    [InlineData("/proc", "which holds")]
    [InlineData("/proc/1", "inside")]
    public void Bind_RefusesTheProcessesOfTheMachine(string path, string relation)
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "Windows has no /proc.");

        Assert.Equal(
            $"mounts.json: /drafts is bound to {path}, {relation} the environment of every process, with the key of the model: its agents would reach it - bind a folder of its own",
            Refusal(path));
    }

    [Theory]
    [InlineData("{ws}/teams/beta/inbox")]
    [InlineData("{ws}/teams/alphabet")]
    [InlineData("{ws}/Teams/beta")]
    [InlineData("../beta/output")]
    public void Bind_RefusesAFolderOfAnotherTeam(string path)
    {
        Assert.Equal(
            $"mounts.json: /drafts is bound to {Physical(path)}, inside another team: the agents of a team never reach the folders of another - share through a folder of its own",
            Refusal(path));
    }

    [Fact]
    public void Bind_RefusesTheMountSetOfAnotherTeam()
    {
        const string path = "{ws}/mounts.test/beta/inbox";

        Assert.Equal(
            $"mounts.json: /drafts is bound to {Physical(path)}, inside a mount set of another team: the agents of a team never reach the folders of another - share through a folder of its own",
            Refusal(path));
    }

    [Theory]
    [InlineData("{ws}/mounts.test/alpha/inbox")]
    [InlineData("{ws}/inbox")]
    [InlineData("{home}/projects/in")]
    [InlineData("/srv/archive")]
    public void Bind_LetsAnyOtherFolderOutsideTheTeamThrough(string path)
    {
        var binding = Assert.Single(Bind(path));

        Assert.True(binding.External);
        Assert.Equal(Physical(path), binding.PhysicalPath);
    }

    [Fact]
    public void Bind_GuardsTheConfiguredWorkshopToo()
    {
        // A team outside the workshop named by $ORKEON_WORKSHOP: that workshop is guarded as well.
        var gamma = Path.Combine(_root, "srv", "x", "teams", "gamma");

        Assert.Equal(Holds("{ws}/settings", "the settings of every team"), Refusal("{ws}/settings", team: gamma));
        Assert.Equal(
            $"mounts.json: /drafts is bound to {Physical("{ws}/teams/alpha")}, inside another team: the agents of a team never reach the folders of another - share through a folder of its own",
            Refusal("{ws}/teams/alpha", team: gamma));
        Assert.True(Assert.Single(Bind("{ws}/settings", new MachineFolders(Home, Workshop: null, ConfigHome: null), gamma)).External);
    }

    [Theory]
    [InlineData("{root}/cfg", "{root}/cfg/Orkeon", "which holds")]
    [InlineData("{root}/cfg", "{root}/cfg/Orkeon/x", "inside")]
    [InlineData("{home}/.config", "{home}/.config/Orkeon", "which holds")]
    public void Bind_GuardsTheOrkeonSettingsOfTheConfigurationHome(string configHome, string path, string relation)
    {
        var machine = new MachineFolders(Home, Workshop, Expand(configHome));

        Assert.Equal(
            $"mounts.json: /drafts is bound to {Physical(path)}, {relation} the machine's Orkeon settings and the OAuth tokens of its mail accounts: its agents would reach it - bind a folder of its own",
            Refusal(path, machine));
    }

    [Fact]
    public void Bind_GuardsTheHomeFolderOfThisMachine()
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        Assert.SkipWhen(
            string.IsNullOrWhiteSpace(home) || string.Equals(Path.GetPathRoot(home), Path.TrimEndingDirectorySeparator(home), StringComparison.Ordinal),
            "No home folder below the root of the file system.");
        var file = MountsFile.Parse($$"""{ "mounts": [ { "root": "/drafts", "access": "ro", "role": "reference", "default": "{{home.Replace("\\", "\\\\", StringComparison.Ordinal)}}" } ] }""");

        var error = Assert.Throws<MountsFileException>(() => file.Bind(Team, environment: null));

        Assert.Contains($"which holds {HomeFolder}", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("rw")]
    [InlineData("rwnd")]
    public void Parse_RefusesAWritablePluginsRoot(string access)
    {
        var error = Assert.Throws<MountsFileException>(() => MountsFile.Parse(
            $$"""{ "mounts": [ { "root": "/plugins", "access": "{{access}}", "role": "plugins", "default": "./plugins" } ] }"""));

        Assert.Equal(
            "mounts.json: mounts[0].access: /plugins is where orkeon-harness-run loads plugins from when no --plugins names a folder: declare it \"access\": \"ro\", or its agents could drop code that the next run executes",
            error.Message);
    }

    [Fact]
    public void Parse_AcceptsAReadOnlyPluginsRoot()
    {
        var file = MountsFile.Parse("""{ "mounts": [ { "root": "/plugins", "access": "ro", "role": "plugins", "default": "./plugins" } ] }""");

        Assert.Equal("ro", Assert.Single(file.Mounts).Access);
    }
}
