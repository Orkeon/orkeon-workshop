using System.Text.Json;
using Orkeon.Compliance.Vfs;
using Orkeon.Constants.FileSystem;
using Orkeon.Studio.Core.FileSystem;
using Orkeon.Studio.Core.Targets;
using Orkeon.Studio.Core.Teams;

namespace OrkeonStudioCheck;

/// <summary>What Orkeon Studio makes of one team folder.</summary>
/// <param name="Folder">The team folder, absolute.</param>
/// <param name="Problems">Why Studio would not list, read or launch the team as its launchers do; empty when it would.</param>
internal sealed record TeamVerdict(string Folder, IReadOnlyList<string> Problems)
{
    /// <summary>True when Studio lists, reads and launches the team as its launchers do.</summary>
    public bool Passed => Problems.Count == 0;
}

/// <summary>
/// Reads a team folder of the workshop the way Orkeon Studio does, with Studio's own code
/// (<c>Orkeon.Studio.Core</c>, the UI-agnostic core of the desktop app): the card through
/// <see cref="StudioTeamMetadata"/>, the crew through <see cref="RunTargetDetector"/>, the launch
/// refusals and the mounts through <see cref="TeamCatalog.DescribeTarget"/> and
/// <see cref="DeclaredMounts.BlockingFolders"/>. What Studio would do is then compared with what the
/// launchers <c>orkeon-bench scaffold</c> writes do - run <c>crew/</c> or <c>crew/crew.ork.ts</c>
/// from the team folder, with the mount points of <c>mounts.json</c> - without reading the
/// launchers themselves.
/// </summary>
[SuppressVfsCompliance(
    "EXCEPTION-BOOTSTRAP: a host-side checker; it reads team folders on the physical disk, as Orkeon " +
    "Studio does before a launch, and runs nothing.")]
internal static class StudioCheck
{
    /// <summary>The team's mount points, the single source its launchers and its card derive from (D27).</summary>
    public const string MountsFile = "mounts.json";

    private static readonly JsonDocumentOptions LenientJson = new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true };

    /// <summary>The folders Studio lists under <paramref name="teamsRoot"/>, archived ones included.</summary>
    /// <param name="teamsRoot">The catalogue: the <c>teams/</c> folder of the workshop.</param>
    /// <returns>The team folders, in Studio's order.</returns>
    public static IReadOnlyList<string> TeamFolders(string teamsRoot) =>
        [.. TeamCatalog.List(teamsRoot, TeamListFilter.All).Select(team => team.Path)];

    /// <summary>Checks one team folder.</summary>
    /// <param name="teamDirectory">The team folder.</param>
    /// <param name="authorized">Studio's Authorized folders (<c>Orkeon:FileSystem:Mounts</c> of its settings).</param>
    /// <returns>The verdict.</returns>
    public static TeamVerdict Check(string teamDirectory, IReadOnlyList<string> authorized)
    {
        var team = Path.TrimEndingDirectorySeparator(Path.GetFullPath(teamDirectory));
        var problems = new List<string>();
        if (Path.GetFileName(team).StartsWith('.'))
            problems.Add("Studio does not list a folder whose name starts with a dot");
        CheckCard(team, problems);
        CheckTarget(team, problems);
        var description = TeamCatalog.DescribeTarget(team, authorized);
        CheckLaunch(team, description, authorized, problems);
        CheckMounts(team, description, problems);
        return new TeamVerdict(team, problems);
    }

    private static void CheckCard(string team, List<string> problems)
    {
        var path = Path.Combine(team, ConventionalNames.TeamSidecarFile);
        if (!File.Exists(path))
        {
            problems.Add($"no {ConventionalNames.TeamSidecarFile}: Studio lists the folder under its name and launches the team without the team's mount points");
            return;
        }

        try
        {
            // Studio's own reading (TeamCatalog.TryReadMetadata): default options, so names are
            // case-sensitive, comments and trailing commas are errors, unknown keys are skipped.
            if (JsonSerializer.Deserialize<StudioTeamMetadata>(File.ReadAllText(path)) is null)
                problems.Add($"{ConventionalNames.TeamSidecarFile} holds null: Studio lists the folder under its name and launches the team without the team's mount points");
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            // An unreadable card is no card for Studio either: TryReadMetadata returns null.
            problems.Add($"{ConventionalNames.TeamSidecarFile}: Studio ignores this card ({ex.Message}) and launches the team without the team's mount points");
        }
    }

    private static void CheckTarget(string team, List<string> problems)
    {
        RunTargetDetection detection;
        try
        {
            detection = new RunTargetDetector().Detect(team);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            problems.Add($"Studio cannot read the folder to find the crew ({ex.Message})");
            return;
        }

        if (detection.Status == RunTargetDetectionStatus.NeedsSelection)
        {
            problems.Add($"Studio asks which script to run: {string.Join(", ", detection.Candidates.Select(candidate => Relative(team, candidate)))}");
            return;
        }

        if (detection is not { IsResolved: true, Target: { } target })
        {
            problems.Add($"Studio finds no crew to run: {detection.Error}");
            return;
        }

        var runPath = Path.TrimEndingDirectorySeparator(Path.GetFullPath(target.RunPath));
        var expected = LauncherTarget(team);
        if (expected is null)
            problems.Add($"Studio runs {Relative(team, runPath)}, but the folder holds neither crew/config.yaml nor crew/crew.ork.ts, which the launchers run");
        else if (!string.Equals(runPath, expected, StringComparison.Ordinal))
            problems.Add($"Studio runs {Relative(team, runPath)}, the launchers {Relative(team, expected)}: agents/, tasks/, the flat triplet or crew.ork.ts at the root takes the place of crew/, or crew/ holds no agents/ or tasks/");

        var workingDirectory = target.WorkingDirectory is { } directory ? Path.TrimEndingDirectorySeparator(Path.GetFullPath(directory)) : null;
        if (!string.Equals(workingDirectory, team, StringComparison.Ordinal))
            problems.Add($"Studio starts the run from {workingDirectory ?? "no folder"}, the launchers from the team folder");
    }

    /// <summary>
    /// The refusals of Studio's launch screen (<c>LaunchTabViewModel.CanLaunch</c>): an archived team,
    /// a card naming folder declarations this machine lacks, and a mount Studio cannot vouch for -
    /// either an entry it can never accept, or a folder outside the team its Authorized folders do
    /// not declare, which only the machine's settings can lift.
    /// </summary>
    private static void CheckLaunch(string team, TargetDescription description, IReadOnlyList<string> authorized, List<string> problems)
    {
        if (description.IsArchived)
            problems.Add("Studio does not launch an archived team until it is restored");

        if (description.HasUnknownMountIds)
        {
            problems.Add(
                $"Studio refuses to launch the team: its card names the folder declarations {string.Join(", ", description.UnknownMountIds())}, " +
                "which Studio's Authorized folders do not hold; run orkeon-bench scaffold <team>, which writes the card from mounts.json without ids");
        }

        var undeclared = new List<string>();
        var unreadable = new List<string>();
        foreach (var mount in description.Mounts)
        {
            // One entry at a time through Studio's own rule, then sorted by what could lift it.
            var blocking = DeclaredMounts.BlockingFolders([mount], authorized, team);
            if (blocking.Count == 0)
                continue;
            if (!MountDefinition.TryParse(mount, out _, out _) || (TeamMountPaths.IsTeamRelative(mount) && !TeamMountPaths.TryGetRelativeFolder(mount, out _)))
                unreadable.Add(mount);
            else
                undeclared.AddRange(blocking);
        }

        if (undeclared.Count > 0)
        {
            problems.Add(
                $"Studio refuses to launch the team because of {string.Join(", ", undeclared)}: a folder outside the team must be declared, spelled exactly, " +
                "in Studio's Authorized folders");
        }

        if (unreadable.Count > 0)
        {
            problems.Add(
                $"Studio always refuses {string.Join(", ", unreadable)}: an entry it cannot read, or a ./ entry that names no single folder of the team " +
                "(./, ./x/, ./../x)");
        }
    }

    private static void CheckMounts(string team, TargetDescription description, List<string> problems)
    {
        var bound = new Dictionary<string, (string Physical, string Access)>(StringComparer.Ordinal);
        foreach (var mount in description.ResolvedMounts)
        {
            if (!MountDefinition.TryParse(mount.Effective, out var definition, out _))
                continue;
            var physical = Path.TrimEndingDirectorySeparator(Path.GetFullPath(definition.PhysicalPath, team));
            bound[definition.VirtualPath] = (physical, MountRightsTokens.ToToken(definition.Rights));
            if (mount.Source == TeamMountSource.InsideTeam && !Directory.Exists(physical))
                problems.Add($"{definition.VirtualPath}: {physical} does not exist; Studio does not create it, and orkeon run refuses a missing mount folder");
        }

        CompareWithMountsFile(team, bound, problems);
    }

    /// <summary>The mount points of <c>mounts.json</c> against what Studio binds from the card.</summary>
    private static void CompareWithMountsFile(string team, Dictionary<string, (string Physical, string Access)> bound, List<string> problems)
    {
        var path = Path.Combine(team, MountsFile);
        if (!File.Exists(path))
            return;

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(File.ReadAllText(path), LenientJson);
        }
        catch (JsonException ex)
        {
            problems.Add($"{MountsFile} is not valid JSON ({ex.Message})");
            return;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            problems.Add($"{MountsFile} cannot be read ({ex.Message})");
            return;
        }

        using (document)
        {
            if (!document.RootElement.TryGetProperty("mounts", out var mounts) || mounts.ValueKind != JsonValueKind.Array)
                return;
            var declared = new HashSet<string>(StringComparer.Ordinal);
            foreach (var entry in mounts.EnumerateArray())
            {
                if (!TryString(entry, "root", out var root) || !TryString(entry, "access", out var access) || !TryString(entry, "default", out var folder))
                    continue;
                declared.Add(root);
                if (IsWindowsPath(folder) && !OperatingSystem.IsWindows())
                    continue;
                var physical = Path.TrimEndingDirectorySeparator(Path.GetFullPath(folder, team));
                if (!bound.TryGetValue(root, out var binding))
                    problems.Add($"{root}: declared in {MountsFile}, absent from the card Studio reads; run orkeon-bench scaffold <team>");
                else if (!string.Equals(binding.Physical, physical, StringComparison.Ordinal) || !string.Equals(binding.Access, access, StringComparison.Ordinal))
                    problems.Add($"{root}: Studio binds {binding.Physical}:{binding.Access}, the launchers {physical}:{access}; run orkeon-bench scaffold <team>");
            }

            foreach (var root in bound.Keys.Where(root => !declared.Contains(root)))
                problems.Add($"{root}: on the card Studio reads, not in {MountsFile}; run orkeon-bench scaffold <team>");
        }
    }

    /// <summary>What the launchers hand to <c>orkeon run</c>: <c>crew/</c> for YAML, <c>crew/crew.ork.ts</c> for TypeScript.</summary>
    private static string? LauncherTarget(string team)
    {
        var crew = Path.Combine(team, "crew");
        if (File.Exists(Path.Combine(crew, "config.yaml")))
            return crew;
        var script = Path.Combine(crew, "crew.ork.ts");
        return File.Exists(script) ? script : null;
    }

    private static bool TryString(JsonElement element, string name, out string value)
    {
        value = string.Empty;
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.String)
            return false;
        value = property.GetString() ?? string.Empty;
        return value.Length > 0;
    }

    private static bool IsWindowsPath(string path) =>
        (path.Length > 2 && char.IsAsciiLetter(path[0]) && path[1] == ':' && path[2] is '\\' or '/') || path.StartsWith(@"\\", StringComparison.Ordinal);

    private static string Relative(string team, string path)
    {
        var relative = Path.GetRelativePath(team, path).Replace('\\', '/');
        return relative == "." ? "the team folder" : relative;
    }
}
