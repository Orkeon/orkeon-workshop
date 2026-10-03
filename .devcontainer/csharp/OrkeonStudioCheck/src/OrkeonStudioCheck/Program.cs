using System.Text.Json;
using Orkeon.Compliance.Vfs;
using Orkeon.Studio.Core.Configuration;

namespace OrkeonStudioCheck;

/// <summary>
/// <c>orkeon-studio-check [--authorized &lt;appsettings.json&gt;] [&lt;team folder or slug&gt;...]</c>: checks
/// the teams of the workshop as Orkeon Studio reads them. A slug names <c>&lt;workshop&gt;/teams/&lt;slug&gt;</c>;
/// without a folder, every team of <c>$ORKEON_WORKSHOP/teams</c> (<c>/workspace/teams</c> by default).
/// Exit code 0 when every team passes, 1 when one fails, 2 on a usage error.
/// </summary>
[SuppressVfsCompliance(
    "EXCEPTION-BOOTSTRAP: a host-side checker; it reads the settings file it is given and lists team " +
    "folders on the physical disk, as Orkeon Studio does, and runs nothing.")]
internal static class Program
{
    /// <summary>The help text.</summary>
    public const string Usage = """
        usage: orkeon-studio-check [--authorized <appsettings.json>] [<team folder or slug>...]

        Reads each team folder the way Orkeon Studio does, with Studio's own code (Orkeon.Studio.Core):
        the card studio-team.json, the crew Studio would run and from where, the launches Studio would
        refuse and the mount points it would bind. Compares that with what the launchers written by
        orkeon-bench scaffold do: run crew/ or crew/crew.ork.ts from the team folder, with the mount
        points of mounts.json (run.sh and run.cmd themselves are not read). A slug stands for
        <workshop>/teams/<slug>. Without a folder: every team of $ORKEON_WORKSHOP/teams
        (/workspace/teams).

          --authorized <file>   a settings file whose Orkeon:FileSystem:Mounts, keys spelled exactly, are
                                Studio's Authorized folders (Studio reads %APPDATA%\Orkeon\appsettings.json);
                                default: none

        Limits: in the container paths compare case-sensitively, where Studio on Windows does not; the
        Hidden and System attributes that hide a folder from Studio on Windows are not seen; a Windows
        path on the card counts as refused unless --authorized spells it exactly.

        Exit code: 0 every team passes, 1 a team fails, 2 usage error.
        """;

    /// <summary>Entry point.</summary>
    /// <param name="args">Command-line arguments.</param>
    /// <returns>The exit code.</returns>
    public static int Main(string[] args) =>
        Run(args, Console.Out, Console.Error, Environment.GetEnvironmentVariable("ORKEON_WORKSHOP"));

    /// <summary>Runs the check with explicit streams and workshop, for the tests.</summary>
    /// <param name="args">Command-line arguments.</param>
    /// <param name="output">Where the verdicts go.</param>
    /// <param name="error">Where usage errors go.</param>
    /// <param name="workshop">The workshop folder (<c>ORKEON_WORKSHOP</c>); null or blank for <c>/workspace</c>.</param>
    /// <returns>The exit code.</returns>
    internal static int Run(string[] args, TextWriter output, TextWriter error, string? workshop)
    {
        string? authorizedFile = null;
        var arguments = new List<string>();
        for (var index = 0; index < args.Length; index++)
        {
            var argument = args[index];
            if (argument is "-h" or "--help")
            {
                output.WriteLine(Usage);
                return 0;
            }

            if (argument == "--authorized")
            {
                if (index + 1 == args.Length)
                    return UsageError(error, "--authorized needs the settings file that holds Studio's Authorized folders");
                authorizedFile = args[++index];
            }
            else if (argument.StartsWith('-'))
            {
                return UsageError(error, $"unknown option {argument}");
            }
            else
            {
                arguments.Add(argument);
            }
        }

        IReadOnlyList<string> authorized = [];
        if (authorizedFile is not null)
        {
            var read = ReadAuthorized(authorizedFile);
            if (read.Error is not null)
            {
                error.WriteLine($"orkeon-studio-check: {read.Error}");
                return 2;
            }

            authorized = read.Mounts;
        }

        var teams = Path.Combine(string.IsNullOrWhiteSpace(workshop) ? "/workspace" : workshop, "teams");
        var folders = new List<string>();
        foreach (var argument in arguments)
        {
            // A name that is no folder here and no path at all is a slug of the workshop.
            var slug = !Directory.Exists(argument) && argument.IndexOfAny(['/', '\\']) < 0;
            var folder = slug ? Path.Combine(teams, argument) : argument;
            if (!Directory.Exists(folder))
            {
                error.WriteLine(slug
                    ? $"orkeon-studio-check: {argument} is neither a folder nor a team of {teams}"
                    : $"orkeon-studio-check: {folder} is not a folder");
                return 2;
            }

            folders.Add(folder);
        }

        if (folders.Count == 0)
        {
            folders.AddRange(StudioCheck.TeamFolders(teams));
            if (folders.Count == 0)
            {
                output.WriteLine($"no team in {teams}");
                return 0;
            }
        }

        var failed = 0;
        foreach (var folder in folders)
        {
            var verdict = StudioCheck.Check(folder, authorized);
            output.WriteLine($"{(verdict.Passed ? "PASS" : "FAIL")} {verdict.Folder}");
            foreach (var problem in verdict.Problems)
                output.WriteLine($"  - {problem}");
            if (!verdict.Passed)
                failed++;
        }

        return failed == 0 ? 0 : 1;
    }

    private static int UsageError(TextWriter error, string message)
    {
        error.WriteLine($"orkeon-studio-check: {message}");
        error.WriteLine(Usage);
        return 2;
    }

    /// <summary>
    /// The <c>Orkeon:FileSystem:Mounts</c> entries of a settings file, the list Studio's Settings ›
    /// Authorized folders edits, read as Studio reads it (<see cref="AppSettingsDocument"/>): keys
    /// spelled exactly, every entry kept as written, even one nobody can parse.
    /// </summary>
    private static (IReadOnlyList<string> Mounts, string? Error) ReadAuthorized(string file)
    {
        if (!File.Exists(file))
            return ([], $"{file} does not exist");

        try
        {
            return (AppSettingsDocument.Parse(File.ReadAllText(file)).Mounts.RawEntries, null);
        }
        catch (JsonException ex)
        {
            return ([], $"{file}: Studio cannot read this settings file ({ex.Message})");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return ([], $"{file} cannot be read ({ex.Message})");
        }
    }
}
