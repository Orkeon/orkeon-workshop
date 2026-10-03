using Orkeon.Compliance.Vfs;

namespace OrkeonHarnessRun.Mounts;

/// <summary>
/// The <c>mounts.json</c> convenience of the runner: when the command line carries no
/// <c>--mount</c> and the team folder holds a <c>mounts.json</c>, the mounts are derived
/// from it, for the mount set named by <c>TEAM_ENV</c> (the team's own folders when unset).
/// </summary>
/// <remarks>
/// The result is exactly what the launchers and <c>orkeon-bench</c> pass explicitly:
/// <c>--mount &lt;abs&gt;:/workspace:ro &lt;abs&gt;:/output:rw [--allow-external-mounts]</c>.
/// An explicit <c>--mount</c> always wins, so the runner keeps accepting the very same
/// arguments as <c>orkeon run</c>.
/// </remarks>
[SuppressVfsCompliance("EXCEPTION-BOOTSTRAP: locates the team folder and its mounts.json from the command line, before the host (and thus IFileSystemService) is built.")]
internal static class TeamMounts
{
    /// <summary>Environment variable that selects a mount set: <c>mounts.&lt;name&gt;/&lt;team&gt;/</c> next to <c>teams/</c>.</summary>
    public const string EnvironmentVariable = "TEAM_ENV";

    /// <summary>
    /// Fills <see cref="Orkeon.Hosting.RunnerOptionsBase.Mounts"/> from <c>mounts.json</c>
    /// when the caller gave no mount.
    /// </summary>
    /// <param name="options">Parsed command line; updated in place.</param>
    /// <param name="workingDirectory">The current directory (the team folder under a launcher).</param>
    /// <param name="environmentName">Value of <see cref="EnvironmentVariable"/>, or null.</param>
    /// <param name="diagnostics">Where the one-line report goes (stderr).</param>
    /// <returns>True when mounts were derived from the file.</returns>
    /// <exception cref="MountsFileException">The file is invalid, or a read-only root does not exist.</exception>
    public static bool Apply(HarnessRunOptions options, string workingDirectory, string? environmentName, TextWriter diagnostics)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentException.ThrowIfNullOrWhiteSpace(workingDirectory);
        ArgumentNullException.ThrowIfNull(diagnostics);

        // --list-tools loads no crew and needs no team root; an explicit --mount always wins.
        if (options.ListTools || options.Mounts.Any())
            return false;

        var teamDirectory = Locate(workingDirectory, options.ConfigPath);
        if (teamDirectory is null)
            return false;

        var bindings = MountsFile.Load(teamDirectory).Bind(teamDirectory, environmentName);
        MountsFile.Provision(bindings);
        options.Mounts = [.. bindings.Select(b => b.ToMountString())];

        // Orkeon refuses a mount outside the WORKING directory unless told otherwise; the
        // bindings of a team may live anywhere (a share, another repository).
        var workspace = Path.TrimEndingDirectorySeparator(Path.GetFullPath(workingDirectory));
        if (bindings.Any(b => !IsWithin(workspace, b.PhysicalPath)))
            options.AllowExternalMounts = true;

        var environment = string.IsNullOrWhiteSpace(environmentName) ? MountsFile.DefaultEnvironment : environmentName;
        diagnostics.WriteLine(
            $"{HarnessRunner.LoggerCategory}: mounts from {Path.Combine(teamDirectory, MountsFile.FileName)} (environment: {environment}): "
            + string.Join(" ", bindings.Select(b => $"{b.Root}:{b.Access}")));
        return true;
    }

    /// <summary>
    /// The team folder is the working directory (launchers run <c>crew</c> from it), or
    /// else the parent of the crew target (<c>orkeon-harness-run teams/x/crew</c>).
    /// </summary>
    internal static string? Locate(string workingDirectory, string? target)
    {
        if (MountsFile.ExistsIn(workingDirectory))
            return Path.GetFullPath(workingDirectory);
        if (string.IsNullOrWhiteSpace(target))
            return null;

        var parent = Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.Combine(workingDirectory, target))));
        return parent is not null && MountsFile.ExistsIn(parent) ? parent : null;
    }

    private static bool IsWithin(string folder, string path) =>
        string.Equals(path, folder, StringComparison.Ordinal)
        || path.StartsWith(folder + Path.DirectorySeparatorChar, StringComparison.Ordinal);
}
