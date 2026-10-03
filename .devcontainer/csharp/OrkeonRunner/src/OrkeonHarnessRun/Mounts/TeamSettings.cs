using Orkeon.Compliance.Vfs;

namespace OrkeonHarnessRun.Mounts;

/// <summary>
/// The team's own Orkeon settings (D33): <c>settings/&lt;team&gt;/appsettings.json</c> two levels
/// above the team folder, passed as <c>--settings</c> when the command names no settings file -
/// what the launchers do. Orkeon then reads it instead of the user's settings file.
/// </summary>
/// <remarks>
/// The team is the one <see cref="TeamMounts"/> finds (the working directory, else the parent
/// of the crew target, holding a <c>mounts.json</c>). An explicit <c>--settings</c> always wins.
/// </remarks>
[SuppressVfsCompliance("EXCEPTION-BOOTSTRAP: locates the team's settings file from the command line, before the host (and thus IFileSystemService) is built.")]
internal static class TeamSettings
{
    /// <summary>The folder of the workshop that holds one settings folder per team.</summary>
    public const string FolderName = "settings";

    /// <summary>The settings file of a team, inside its folder of <see cref="FolderName"/>.</summary>
    public const string FileName = "appsettings.json";

    /// <summary>
    /// Fills <see cref="Orkeon.Hosting.RunnerOptionsBase.SettingsPath"/> with the team's settings
    /// file when the caller named none and the file exists.
    /// </summary>
    /// <param name="options">Parsed command line; updated in place.</param>
    /// <param name="workingDirectory">The current directory (the team folder under a launcher).</param>
    /// <param name="diagnostics">Where the one-line report goes (stderr).</param>
    /// <returns>The settings file now passed, or null.</returns>
    public static string? Apply(HarnessRunOptions options, string workingDirectory, TextWriter diagnostics)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentException.ThrowIfNullOrWhiteSpace(workingDirectory);
        ArgumentNullException.ThrowIfNull(diagnostics);

        if (!string.IsNullOrWhiteSpace(options.SettingsPath))
            return null;

        var teamDirectory = TeamMounts.Locate(workingDirectory, options.ConfigPath);
        var path = teamDirectory is null ? null : PathFor(teamDirectory);
        if (path is null || !File.Exists(path))
            return null;

        options.SettingsPath = path;
        diagnostics.WriteLine($"{HarnessRunner.LoggerCategory}: settings from {path}");
        return path;
    }

    /// <summary>
    /// <c>&lt;workshop&gt;/settings/&lt;team&gt;/appsettings.json</c> for a team folder
    /// <c>&lt;workshop&gt;/teams/&lt;team&gt;</c>; null when the folder has no grandparent.
    /// </summary>
    internal static string? PathFor(string teamDirectory)
    {
        var team = Path.TrimEndingDirectorySeparator(Path.GetFullPath(teamDirectory));
        var workshop = Path.GetDirectoryName(Path.GetDirectoryName(team));
        return string.IsNullOrEmpty(workshop) ? null : Path.Combine(workshop, FolderName, Path.GetFileName(team), FileName);
    }
}
