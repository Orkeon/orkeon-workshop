namespace OrkeonStudioCheck.Tests;

/// <summary>
/// Teams laid out as <c>orkeon-bench scaffold</c> writes them, read with Studio's own code: what
/// passes, and what Studio would list, run or bind differently from the launchers.
/// </summary>
public sealed class StudioCheckTests : IDisposable
{
    private const string NotesMounts = """
        { "version": 1, "mounts": [
          { "root": "/notes", "access": "ro", "role": "inputs", "default": "./notes" },
          { "root": "/reports", "access": "rw", "role": "deliverables", "default": "./reports" } ] }
        """;

    private const string NotesCard = """
        { "name": "Notes digest", "description": "A digest of the notes", "mounts": ["./notes:/notes:ro", "./reports:/reports:rw"] }
        """;

    /// <summary>A throw-away workshop holding <c>teams/</c>.</summary>
    private readonly string _workshop = Path.Combine(Path.GetTempPath(), "studio-check-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_workshop))
            Directory.Delete(_workshop, recursive: true);
    }

    /// <summary>A YAML team as the generator and scaffold leave it.</summary>
    private string YamlTeam(string slug = "notes-digest", string mounts = NotesMounts, string? card = NotesCard)
    {
        var team = Path.Combine(_workshop, "teams", slug);
        Directory.CreateDirectory(Path.Combine(team, "crew", "agents"));
        Directory.CreateDirectory(Path.Combine(team, "crew", "tasks"));
        Directory.CreateDirectory(Path.Combine(team, "notes"));
        Directory.CreateDirectory(Path.Combine(team, "reports"));
        File.WriteAllText(Path.Combine(team, "crew", "config.yaml"), "name: notes-digest\ngoal: digest\n");
        File.WriteAllText(Path.Combine(team, "crew", "agents", "writer.yaml"), "goal: write\n");
        File.WriteAllText(Path.Combine(team, "crew", "tasks", "digest.yaml"), "description: d\nexpectedOutput: o\nagent: writer\n");
        File.WriteAllText(Path.Combine(team, "mounts.json"), mounts);
        if (card is not null)
            File.WriteAllText(Path.Combine(team, "studio-team.json"), card);
        File.WriteAllText(Path.Combine(team, "run.sh"), "#!/bin/sh\n");
        File.WriteAllText(Path.Combine(team, "run.cmd"), "@echo off\r\n");
        return team;
    }

    [Fact]
    public void Check_PassesAYamlTeamLaidOutByScaffold()
    {
        var verdict = StudioCheck.Check(YamlTeam(), []);

        Assert.True(verdict.Passed, string.Join(Environment.NewLine, verdict.Problems));
    }

    [Fact]
    public void Check_PassesATypeScriptTeam()
    {
        var team = Path.Combine(_workshop, "teams", "notes-ts");
        Directory.CreateDirectory(Path.Combine(team, "crew"));
        Directory.CreateDirectory(Path.Combine(team, "notes"));
        Directory.CreateDirectory(Path.Combine(team, "reports"));
        File.WriteAllText(Path.Combine(team, "crew", "crew.ork.ts"), "globalThis.crew = {};\n");
        File.WriteAllText(Path.Combine(team, "tsconfig.json"), "{}");
        File.WriteAllText(Path.Combine(team, "mounts.json"), NotesMounts);
        File.WriteAllText(Path.Combine(team, "studio-team.json"), NotesCard);

        var verdict = StudioCheck.Check(team, []);

        Assert.True(verdict.Passed, string.Join(Environment.NewLine, verdict.Problems));
    }

    [Fact]
    public void Check_RefusesTheTeamFolderItselfAsAMountPoint()
    {
        var team = YamlTeam(
            mounts: """{ "mounts": [ { "root": "/data", "access": "rw", "role": "state", "default": "." } ] }""",
            card: """{ "name": "x", "mounts": ["./:/data:rw"] }""");

        var verdict = StudioCheck.Check(team, []);

        Assert.Contains(
            "Studio always refuses ./:/data:rw: an entry it cannot read, or a ./ entry that names no single folder of the team (./, ./x/, ./../x)",
            verdict.Problems);
        Assert.DoesNotContain(verdict.Problems, problem => problem.StartsWith("Studio refuses to launch the team because of", StringComparison.Ordinal));
    }

    [Fact]
    public void Check_SeparatesTheEntriesStudioAlwaysRefusesFromTheFoldersItsSettingsCanAllow()
    {
        var archive = Path.Combine(_workshop, "archive");
        Directory.CreateDirectory(archive);
        var team = YamlTeam(
            mounts: $$"""{ "mounts": [ { "root": "/notes", "access": "ro", "role": "inputs", "default": "./notes" } ] }""",
            card: $$"""{ "name": "x", "mounts": ["./notes:/notes:ro", "./notes/:/slash:ro", "./../x:/escape:ro", "not a mount", "{{archive}}:/archive:ro"] }""");

        var problems = StudioCheck.Check(team, []).Problems;

        Assert.Contains(
            "Studio refuses to launch the team because of /archive: a folder outside the team must be declared, spelled exactly, in Studio's Authorized folders",
            problems);
        Assert.Contains(
            "Studio always refuses ./notes/:/slash:ro, ./../x:/escape:ro, not a mount: an entry it cannot read, or a ./ entry that names no single folder of the team (./, ./x/, ./../x)",
            problems);
    }

    [Fact]
    public void Check_PassesATeamWhoseRootHoldsATasksMountFolder()
    {
        // STUDIO-59 (Orkeon fb26364): a crew/ holding a crew is the definition, so a mount point
        // named tasks/ at the root is a folder, not a crew competing with crew/.
        var team = YamlTeam(
            mounts: """{ "mounts": [ { "root": "/tasks", "access": "ro", "role": "inputs", "default": "./tasks" } ] }""",
            card: """{ "name": "x", "mounts": ["./tasks:/tasks:ro"] }""");
        Directory.CreateDirectory(Path.Combine(team, "tasks"));

        var verdict = StudioCheck.Check(team, []);

        Assert.True(verdict.Passed, string.Join(Environment.NewLine, verdict.Problems));
    }

    [Fact]
    public void Check_SeesStudioRunTheConfigOfACrewWithoutAgentsOrTasks()
    {
        var team = YamlTeam();
        Directory.Delete(Path.Combine(team, "crew", "agents"), recursive: true);
        Directory.Delete(Path.Combine(team, "crew", "tasks"), recursive: true);

        var verdict = StudioCheck.Check(team, []);

        Assert.Contains(verdict.Problems, problem => problem.StartsWith("Studio runs crew/config.yaml, the launchers crew: ", StringComparison.Ordinal));
    }

    [Fact]
    public void Check_ReportsAnArchivedTeam()
    {
        var team = YamlTeam(card: """{ "name": "x", "archived": true, "mounts": ["./notes:/notes:ro", "./reports:/reports:rw"] }""");

        Assert.Equal(["Studio does not launch an archived team until it is restored"], StudioCheck.Check(team, []).Problems);
    }

    [Fact]
    public void Check_ReportsAFolderDeclarationMissingFromTheAuthorizedFolders()
    {
        const string Id = "01J9Z3K4M5N6P7Q8R9S0T1V2W3";
        var archive = Path.Combine(_workshop, "archive");
        Directory.CreateDirectory(archive);
        var team = YamlTeam(
            mounts: $$"""{ "mounts": [ { "root": "/archive", "access": "ro", "role": "archive", "default": "{{archive}}" } ] }""",
            card: $$"""{ "name": "x", "mounts": ["{{Id}}|{{archive}}:/archive:ro"] }""");

        Assert.Contains(
            $"Studio refuses to launch the team: its card names the folder declarations {Id}, which Studio's Authorized folders do not hold; run orkeon-bench scaffold <team>, which writes the card from mounts.json without ids",
            StudioCheck.Check(team, []).Problems);
        Assert.True(StudioCheck.Check(team, [$"{Id}|{archive}:/archive:ro"]).Passed);
    }

    [Fact]
    public void Check_RefusesAnExternalFolderUntilItIsAuthorized()
    {
        var archive = Path.Combine(_workshop, "archive");
        Directory.CreateDirectory(archive);
        var team = YamlTeam(
            mounts: $$"""{ "mounts": [ { "root": "/archive", "access": "ro", "role": "archive", "default": "{{archive}}" } ] }""",
            card: $$"""{ "name": "x", "mounts": ["{{archive}}:/archive:ro"] }""");

        Assert.Contains(StudioCheck.Check(team, []).Problems, problem => problem.Contains("/archive", StringComparison.Ordinal) && problem.StartsWith("Studio refuses", StringComparison.Ordinal));
        Assert.True(StudioCheck.Check(team, [$"{archive}:/archive:ro"]).Passed);
    }

    [Fact]
    public void Check_ReportsACardStudioCannotRead_AndAMissingCard()
    {
        Assert.Contains(StudioCheck.Check(YamlTeam(card: "{ \"name\": \"x\", }"), []).Problems, problem => problem.StartsWith("studio-team.json: Studio ignores this card", StringComparison.Ordinal));
        Assert.Contains(
            "no studio-team.json: Studio lists the folder under its name and launches the team without the team's mount points",
            StudioCheck.Check(YamlTeam("no-card", card: null), []).Problems);
    }

    [Fact]
    public void Check_PassesATeamWhoseWritableFolderIsMissing_AndCreatesNothing()
    {
        // STUDIO-60 (Orkeon fb26364): Studio creates a missing writable folder of the team before the
        // launch, as the launchers do. The check says so and leaves the disk as it is.
        var team = YamlTeam();
        Directory.Delete(Path.Combine(team, "reports"));

        var verdict = StudioCheck.Check(team, []);

        Assert.True(verdict.Passed, string.Join(Environment.NewLine, verdict.Problems));
        Assert.False(Directory.Exists(Path.Combine(team, "reports")));
    }

    [Fact]
    public void Check_ReportsAMissingReadOnlyFolder()
    {
        var team = YamlTeam();
        Directory.Delete(Path.Combine(team, "notes"));

        Assert.Equal(
            [$"/notes: {Path.Combine(team, "notes")} does not exist; Studio refuses to launch the team without a read-only folder, and so do the launchers"],
            StudioCheck.Check(team, []).Problems);
    }

    [Fact]
    public void Check_ReportsACardOutOfStepWithMountsJson()
    {
        var team = YamlTeam(card: """{ "name": "x", "mounts": ["./notes:/notes:rw", "./old:/old:ro"] }""");
        Directory.CreateDirectory(Path.Combine(team, "old"));

        var problems = StudioCheck.Check(team, []).Problems;

        Assert.Contains(problems, problem => problem.StartsWith("/notes: Studio binds", StringComparison.Ordinal));
        Assert.Contains(problems, problem => problem.StartsWith("/reports: declared in mounts.json, absent from the card", StringComparison.Ordinal));
        Assert.Contains(problems, problem => problem.StartsWith("/old: on the card Studio reads, not in mounts.json", StringComparison.Ordinal));
    }

    [Fact]
    public void Run_ChecksEveryTeamOfTheWorkshop_AndExitsOneWhenATeamFails()
    {
        YamlTeam();
        YamlTeam("no-card", card: null);
        using var output = new StringWriter();
        using var error = new StringWriter();

        var code = Program.Run([], output, error, _workshop);

        Assert.Equal(1, code);
        var lines = output.ToString().Split(Environment.NewLine);
        Assert.Contains(lines, line => line == $"PASS {Path.Combine(_workshop, "teams", "notes-digest")}");
        Assert.Contains(lines, line => line == $"FAIL {Path.Combine(_workshop, "teams", "no-card")}");
    }

    [Fact]
    public void Run_ReadsTheAuthorizedFoldersFromASettingsFile_SpelledAsStudioReadsThem()
    {
        var archive = Path.Combine(_workshop, "archive");
        Directory.CreateDirectory(archive);
        var team = YamlTeam(
            mounts: $$"""{ "mounts": [ { "root": "/archive", "access": "ro", "role": "archive", "default": "{{archive}}" } ] }""",
            card: $$"""{ "name": "x", "mounts": ["{{archive}}:/archive:ro"] }""");
        var settings = Path.Combine(_workshop, "appsettings.json");
        var other = Path.Combine(_workshop, "other.json");
        File.WriteAllText(settings, $$"""{ "Orkeon": { "FileSystem": { "Mounts": ["{{archive}}:/archive:ro"] } }, }""");
        File.WriteAllText(other, $$"""{ "orkeon": { "FileSystem": { "Mounts": ["{{archive}}:/archive:ro"] } } }""");
        using var output = new StringWriter();
        using var error = new StringWriter();

        Assert.Equal(0, Program.Run(["--authorized", settings, team], output, error, _workshop));

        // Studio reads its settings as a JSON tree, keys spelled exactly: "orkeon" is not "Orkeon".
        Assert.Equal(1, Program.Run(["--authorized", other, team], output, error, _workshop));
    }

    [Fact]
    public void Run_RefusesASettingsFileStudioCannotRead()
    {
        var settings = Path.Combine(_workshop, "appsettings.json");
        Directory.CreateDirectory(_workshop);
        File.WriteAllText(settings, "[ \"not an object\" ]");
        using var output = new StringWriter();
        using var error = new StringWriter();

        Assert.Equal(2, Program.Run(["--authorized", settings, YamlTeam()], output, error, _workshop));
        Assert.Equal(2, Program.Run(["--authorized", Path.Combine(_workshop, "none.json"), YamlTeam()], output, error, _workshop));
        Assert.Contains($"orkeon-studio-check: {settings}: Studio cannot read this settings file", error.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void Run_RefusesABadCommandLine()
    {
        using var output = new StringWriter();
        using var error = new StringWriter();

        Assert.Equal(2, Program.Run(["--frobnicate"], output, error, _workshop));
        Assert.Equal(2, Program.Run([YamlTeam(), "--authorized"], output, error, _workshop));
        Assert.Contains("orkeon-studio-check: --authorized needs the settings file that holds Studio's Authorized folders", error.ToString(), StringComparison.Ordinal);
        Assert.Empty(output.ToString());
    }

    [Fact]
    public void Run_TakesASlugForATeamOfTheWorkshop()
    {
        var team = YamlTeam();
        using var output = new StringWriter();
        using var error = new StringWriter();

        Assert.Equal(0, Program.Run(["notes-digest"], output, error, _workshop));
        Assert.Equal($"PASS {team}", output.ToString().Trim());
        Assert.Equal(2, Program.Run(["no-such-team"], output, error, _workshop));
        Assert.Contains($"orkeon-studio-check: no-such-team is neither a folder nor a team of {Path.Combine(_workshop, "teams")}", error.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void Run_PrintsTheUsageWithItsLimits()
    {
        using var output = new StringWriter();
        using var error = new StringWriter();

        Assert.Equal(0, Program.Run(["--help"], output, error, _workshop));
        Assert.Contains("[<team folder or slug>...]", output.ToString(), StringComparison.Ordinal);
        Assert.Contains("(run.sh and run.cmd themselves are not read)", output.ToString(), StringComparison.Ordinal);
        Assert.Contains("path on the card counts as refused unless --authorized spells it exactly.", output.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void Check_ReportsWhatItCannotRead()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "Unix file modes.");
        var team = YamlTeam();
        var crew = Path.Combine(team, "crew");
        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(Path.Combine(team, "studio-team.json"), UnixFileMode.None);
            File.SetUnixFileMode(Path.Combine(team, "mounts.json"), UnixFileMode.None);
            File.SetUnixFileMode(crew, UnixFileMode.None);
        }

        try
        {
            Assert.SkipWhen(CanRead(Path.Combine(team, "mounts.json")), "Running as a user who reads any file.");

            var problems = StudioCheck.Check(team, []).Problems;

            Assert.Contains(problems, problem => problem.StartsWith("studio-team.json: Studio ignores this card (", StringComparison.Ordinal));
            Assert.Contains(problems, problem => problem.StartsWith("mounts.json cannot be read (", StringComparison.Ordinal));
            Assert.Contains(problems, problem => problem.StartsWith("Studio cannot read the folder to find the crew (", StringComparison.Ordinal));
        }
        finally
        {
            // A folder nobody may list cannot be deleted with its content.
            if (!OperatingSystem.IsWindows())
                File.SetUnixFileMode(crew, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }
    }

    private static bool CanRead(string file)
    {
        try
        {
            File.ReadAllText(file);
            return true;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }
}
