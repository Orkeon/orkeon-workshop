using SampleTeam.Host.Mounts;

namespace SampleTeam.Host.Tests;

/// <summary>
/// <c>mounts.json</c>: declared roots, the team's own folders and the named mount sets,
/// refusals. The shape and the rules are the ones of the orkeon-bench CLI, which owns the format;
/// what the agents may reach through a binding is <see cref="MountReachTests"/>.
/// </summary>
public sealed class MountsFileTests : IDisposable
{
    private const string TeamDirectory = "/teams/sample";

    private const string Sample = """
        {
          "version": 1,
          "mounts": [
            { "root": "/workspace", "access": "ro",   "role": "inputs",       "default": "./input", "description": "Files to process" },
            { "root": "/output",    "access": "rw",   "role": "deliverables", "default": "./output" },
            { "root": "/state",     "access": "rwnd", "role": "state",        "default": "/var/lib/sample/state" }
          ]
        }
        """;

    /// <summary>A throw-away workshop: <c>teams/sample/</c> and the mount sets next to <c>teams/</c>.</summary>
    private readonly string _workshop = Path.Combine(Path.GetTempPath(), "sample-workshop-" + Guid.NewGuid().ToString("N"));

    private string Team => Path.Combine(_workshop, "teams", "sample");

    public MountsFileTests() => Directory.CreateDirectory(Team);

    public void Dispose()
    {
        if (Directory.Exists(_workshop))
            Directory.Delete(_workshop, recursive: true);
    }

    private static string OneMount(string fields) => $$"""{ "mounts": [ { {{fields}} } ] }""";

    [Fact]
    public void Bind_WithoutAnEnvironment_UsesTheDefaultsRelativeToTheTeamFolder()
    {
        var file = MountsFile.Parse(Sample);

        var bindings = file.Bind(TeamDirectory, environment: null);

        Assert.Equal(
            ["/teams/sample/input:/workspace:ro", "/teams/sample/output:/output:rw", "/var/lib/sample/state:/state:rwnd"],
            bindings.Select(b => b.ToMountString()));
        Assert.Equal(["inputs", "deliverables", "state"], bindings.Select(b => b.Role));
        Assert.Equal([false, true, true], bindings.Select(b => b.IsWritable));
        Assert.Equal([false, false, true], bindings.Select(b => b.External));
        Assert.Equal("Files to process", file.Mounts[0].Description);
    }

    [Fact]
    public void Bind_TheDefaultEnvironmentIsImplicit()
    {
        var file = MountsFile.Parse(Sample);

        Assert.Equal(
            file.Bind(TeamDirectory, null).Select(b => b.PhysicalPath),
            file.Bind(TeamDirectory, "default").Select(b => b.PhysicalPath));
    }

    [Fact]
    public void Bind_ANamedSet_BindsEveryRootToItsFolderInTheSet()
    {
        var set = Path.Combine(_workshop, "mounts.test", "sample");
        Directory.CreateDirectory(set);

        var bindings = MountsFile.Parse(Sample).Bind(Team, "test");

        Assert.Equal(
            [Path.Combine(set, "workspace"), Path.Combine(set, "output"), Path.Combine(set, "state")],
            bindings.Select(b => b.PhysicalPath));
        Assert.All(bindings, b => Assert.True(b.External));
    }

    [Fact]
    public void Bind_RefusesASetWithoutAFolderForTheTeam_AndNamesTheSetsThatExist()
    {
        Directory.CreateDirectory(Path.Combine(_workshop, "mounts.test", "sample"));
        Directory.CreateDirectory(Path.Combine(_workshop, "mounts.demo", "sample"));
        Directory.CreateDirectory(Path.Combine(_workshop, "mounts.other", "another-team"));
        Directory.CreateDirectory(Path.Combine(_workshop, "mounts.Bad", "sample"));

        var error = Assert.Throws<MountsFileException>(() => MountsFile.Parse(Sample).Bind(Team, "staging"));

        Assert.Contains("unknown environment \"staging\"", error.Message);
        Assert.Contains(Path.Combine(_workshop, "mounts.staging", "sample"), error.Message);
        Assert.Contains("known: default, demo, test", error.Message);
    }

    [Theory]
    [InlineData("Test")]
    [InlineData("../x")]
    [InlineData("a b")]
    public void Bind_RefusesASetNameThatIsNotKebabCase(string name)
    {
        var error = Assert.Throws<MountsFileException>(() => MountsFile.Parse(Sample).Bind(Team, name));

        Assert.Contains("a mount set is named in kebab-case", error.Message);
    }

    [Fact]
    public void SetNames_ListsDefaultThenTheSetsHoldingAFolderForTheTeam()
    {
        Directory.CreateDirectory(Path.Combine(_workshop, "mounts.zeta", "sample"));
        Directory.CreateDirectory(Path.Combine(_workshop, "mounts.alpha", "sample"));
        Directory.CreateDirectory(Path.Combine(_workshop, "mounts.beta", "another-team"));

        Assert.Equal(["default", "alpha", "zeta"], MountsFile.SetNames(Team));
    }

    [Fact]
    public void Bind_RefusesAWindowsHostPathOutsideWindows()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "A Windows host path is reachable on Windows.");
        var file = MountsFile.Parse(OneMount("""
            "root": "/workspace", "access": "ro", "role": "inputs", "default": "C:\\Shares\\inbox"
            """));

        var error = Assert.Throws<MountsFileException>(() => file.Bind(TeamDirectory, null));

        Assert.Contains("Windows host path", error.Message);
    }

    [Theory]
    [InlineData("""{ "mounts": [] }""", "at least one mount")]
    [InlineData("""{ "version": 2, "mounts": [] }""", "version: expected 1")]
    [InlineData("""{ "roots": [] }""", "mounts: expected an array")]
    [InlineData("""{ "mounts": [ { "root": "workspace", "access": "ro", "role": "inputs", "default": "./in" } ] }""", "expected a virtual root")]
    [InlineData("""{ "mounts": [ { "root": "/a/b", "access": "ro", "role": "inputs", "default": "./in" } ] }""", "expected a virtual root")]
    [InlineData("""{ "mounts": [ { "root": "/Workspace", "access": "ro", "role": "inputs", "default": "./in" } ] }""", "expected a virtual root")]
    [InlineData("""{ "mounts": [ { "root": "/crew", "access": "ro", "role": "inputs", "default": "./in" } ] }""", "reserved for the runner")]
    [InlineData("""{ "mounts": [ { "root": "/sandbox", "access": "rw", "role": "state", "default": "./in" } ] }""", "reserved for the runner")]
    [InlineData("""{ "mounts": [ { "root": "/in", "access": "write", "role": "inputs", "default": "./in" } ] }""", "expected one of ro, rw, rwnd")]
    [InlineData("""{ "mounts": [ { "root": "/in", "access": "ro", "default": "./in" } ] }""", "role: a non-empty string is required")]
    [InlineData("""{ "mounts": [ { "root": "/in", "access": "ro", "role": "My Inputs", "default": "./in" } ] }""", "kebab-case role")]
    [InlineData("""{ "mounts": [ { "root": "/in", "access": "ro", "role": "inputs" } ] }""", "default: a non-empty string is required")]
    [InlineData("""{ "mounts": [ { "root": "/in", "access": "ro", "role": "inputs", "default": "~/inbox" } ] }""", "is not expanded")]
    [InlineData("""{ "mounts": [ { "root": "/in", "access": "ro", "role": "inputs", "default": "$HOME/inbox" } ] }""", "is not expanded")]
    [InlineData("""{ "mounts": [ { "root": "/in", "access": "ro", "role": "inputs", "default": "./a" }, { "root": "/in", "access": "rw", "role": "state", "default": "./b" } ] }""", "duplicate root /in")]
    [InlineData("""{ "mounts": [ { "root": "/in", "access": "ro", "role": "inputs", "default": "%DATA%" } ] }""", "is not expanded")]
    [InlineData("""{ "mounts": [ { "root": "/in", "access": "ro", "role": "inputs", "default": "./a" } ], "environments": { "prod": { "/in": "/x" } } }""", "environments: replaced by mount sets")]
    [InlineData("""{ "mounts": [ { "root": "/in", "access": "ro", "role": "inputs", "default": "./a" } ], "environments": null }""", "environments: replaced by mount sets")]
    [InlineData("""{ "mounts": """, "not valid JSON")]
    public void Parse_RefusesAnInvalidFile(string json, string expected)
    {
        var error = Assert.Throws<MountsFileException>(() => MountsFile.Parse(json));

        Assert.Contains(expected, error.Message);
    }

    [Fact]
    public void Bind_LetsAnotherFolderOutsideTheTeamThrough_AndJudgesNoNamedSet()
    {
        var file = MountsFile.Parse(OneMount("""
            "root": "/archive", "access": "ro", "role": "archive", "default": "/srv/archive"
            """));
        Directory.CreateDirectory(Path.Combine(_workshop, "mounts.test", "sample"));

        Assert.True(Assert.Single(file.Bind(Team, environment: null)).External);
        Assert.True(Assert.Single(file.Bind(Team, "test")).External);
    }

    [Fact]
    public void Parse_AcceptsAFileWithoutVersion()
    {
        var file = MountsFile.Parse(OneMount("""
            "root": "/mail_box-2", "access": "rwnd", "role": "mailbox", "default": "./mail"
            """));

        Assert.Equal("/mail_box-2", Assert.Single(file.Mounts).Root);
    }

    [Fact]
    public void Options_ReadTheEnvironmentFromTeamEnvUnlessOverridden()
    {
        Assert.Equal("prod", HostOptions.Parse([], "prod").EnvironmentName);
        Assert.Equal("staging", HostOptions.Parse(["--env", "staging"], "prod").EnvironmentName);
        Assert.Null(HostOptions.Parse([], " ").EnvironmentName);
    }

    [Fact]
    public void Options_ParseVariablesAndRefuseUnknownArguments()
    {
        var options = HostOptions.Parse(["--var", "topic=notes", "--var", "lang=en", "--input", "go", "--validate"], null);

        Assert.Equal("notes", options.Variables["topic"]);
        Assert.Equal("en", options.Variables["lang"]);
        Assert.Equal("go", options.InitialContext);
        Assert.True(options.Validate);
        Assert.Throws<FormatException>(() => HostOptions.Parse(["--nope"], null));
        Assert.Throws<FormatException>(() => HostOptions.Parse(["--var", "novalue"], null));
        Assert.Throws<FormatException>(() => HostOptions.Parse(["--env"], null));
    }
}
