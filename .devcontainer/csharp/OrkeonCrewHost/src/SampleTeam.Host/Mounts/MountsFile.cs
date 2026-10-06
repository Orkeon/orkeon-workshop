using System.Text.Json;
using System.Text.RegularExpressions;
using Orkeon.Compliance.Vfs;
using Orkeon.Domain.FileSystem;

namespace SampleTeam.Host.Mounts;

/// <summary>One virtual root declared by the team (<c>mounts.json</c>, <c>mounts[]</c>).</summary>
/// <param name="Root">Virtual root the agents see: one lowercase segment, e.g. <c>/workspace</c>.</param>
/// <param name="Access"><c>ro</c>, <c>rw</c> or <c>rwnd</c> (read-write, no delete).</param>
/// <param name="Role">What the root is for, a kebab-case word (<c>inputs</c>, <c>deliverables</c>, <c>state</c>...).</param>
/// <param name="DefaultPath">Physical path of the default environment, relative to the team folder or absolute.</param>
/// <param name="Description">Optional free text.</param>
internal sealed record MountDeclaration(string Root, string Access, string Role, string DefaultPath, string? Description);

/// <summary>A declared root bound to a physical directory for one mount set.</summary>
/// <param name="Root">Virtual root.</param>
/// <param name="Access">Access token of the mount grammar.</param>
/// <param name="Role">Declared role.</param>
/// <param name="PhysicalPath">Absolute physical directory.</param>
/// <param name="External">True when the directory is not under the team folder.</param>
internal sealed record MountBinding(string Root, string Access, string Role, string PhysicalPath, bool External)
{
    /// <summary>Whether agents may write under this root.</summary>
    public bool IsWritable => !string.Equals(Access, "ro", StringComparison.Ordinal);

    /// <summary>The binding in Orkeon's mount grammar: <c>&lt;physical&gt;:&lt;virtual&gt;:&lt;access&gt;</c>.</summary>
    public string ToMountString() => $"{FileSystemMount.Quote(PhysicalPath)}:{Root}:{Access}";
}

/// <summary>The folders of the machine that the reach rule guards besides the team's own workshop.</summary>
/// <param name="Home">The home folder (the user profile); null or blank when unknown.</param>
/// <param name="Workshop">The configured workshop, <c>$ORKEON_WORKSHOP</c>; null or blank when unset.</param>
/// <param name="ConfigHome"><c>$XDG_CONFIG_HOME</c>, which holds the machine's <c>Orkeon/</c> settings when set; null or blank when unset.</param>
internal sealed record MachineFolders(string? Home, string? Workshop, string? ConfigHome)
{
    /// <summary>The folders of the machine this process runs on.</summary>
    public static MachineFolders Current => new(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        Environment.GetEnvironmentVariable("ORKEON_WORKSHOP"),
        Environment.GetEnvironmentVariable("XDG_CONFIG_HOME"));
}

/// <summary>
/// The team's <c>mounts.json</c>: the mount points it declares, free in name and number, and
/// the folder that backs each one by default (decisions D11, D27). A crew only ever names
/// virtual paths; this file is the single place that knows the physical ones. The shape and
/// the validation rules are the ones of the <c>orkeon-bench</c> CLI, which owns the format.
/// </summary>
/// <remarks>
/// <code>
/// {
///   "version": 1,
///   "mounts": [
///     { "root": "/workspace", "access": "ro", "role": "inputs",       "default": "./input"  },
///     { "root": "/output",    "access": "rw", "role": "deliverables", "default": "./output" }
///   ]
/// }
/// </code>
/// The mount set is chosen by <c>TEAM_ENV</c>. Unset or <c>default</c>: the <c>default</c>
/// field of each mount, the team's own folders. <c>&lt;name&gt;</c>: the folder
/// <c>mounts.&lt;name&gt;/&lt;team&gt;/</c> two levels above the team folder — next to
/// <c>teams/</c> — with one sub-folder per mount point, named after it (decision D28).
/// </remarks>
[SuppressVfsCompliance("EXCEPTION-BOOTSTRAP: reads mounts.json and provisions the mount directories before the DI container (and thus IFileSystemService) exists.")]
internal sealed partial class MountsFile
{
    /// <summary>File name, at the root of the team folder.</summary>
    public const string FileName = "mounts.json";

    /// <summary>Name of the implicit mount set made of the <c>default</c> bindings: the team's own folders.</summary>
    public const string DefaultEnvironment = "default";

    /// <summary>Prefix of the folder of a named mount set, next to <c>teams/</c>.</summary>
    public const string SetPrefix = "mounts.";

    private const int SupportedVersion = 1;

    private static readonly string[] AccessTokens = ["ro", "rw", "rwnd"];

    /// <summary>
    /// The root orkeon-harness-run loads plugins from when no <c>--plugins</c> names a folder: a team
    /// may declare it, but read-only.
    /// </summary>
    private const string PluginsRoot = "/plugins";

    /// <summary>What a folder named <c>appsettings</c> or <c>_shared</c> above the team holds.</summary>
    private const string SettingsAboveTheCrews = "a folder where Orkeon looks for the settings of every run above the crews";

    /// <summary>Roots the runner mounts itself; a team cannot declare them.</summary>
    private static readonly string[] ReservedRoots = ["/crew", "/script", "/llm-logs", "/sandbox", "/credentials"];

    /// <summary>
    /// Folder names refused at the root of a team folder, compared ignoring case: <c>crew/</c> is the
    /// definition; Orkeon reads <c>appsettings/appsettings.json</c> or <c>_shared/appsettings.json</c> there
    /// when it looks for settings above <c>crew/</c>. A folder named <c>agents</c> or <c>tasks</c> is free:
    /// Orkeon Studio and <c>orkeon run</c> read <c>crew/</c> first, whatever the root holds (Orkeon
    /// <c>main</c> at fb26364, STUDIO-59).
    /// </summary>
    private static readonly string[] ReservedTeamFolders = ["crew", "appsettings", "_shared"];

    /// <summary>The folders of a workshop that no mount point may hold or lie in, and what each one would expose.</summary>
    private static readonly (string Name, string What)[] WorkshopFolders =
    [
        ("settings", "the settings of every team"),
        ("workbooks", "the workbooks of every team, with the approvals of paid runs"),
        ("tests", "the tests of every team, with their budgets"),
        (".claude", "the harness"),
        ("library", "the workshop's library, which other teams are built from"),
        ("references", "the reference documents Claude builds teams from"),
        (".devcontainer", "the workshop's container configuration, which runs at its next start"),
        (".git", "the workshop's git repository, whose hooks run at the next git command"),
    ];

    private MountsFile(IReadOnlyList<MountDeclaration> mounts)
    {
        Mounts = mounts;
    }

    /// <summary>The declared roots, in file order (the order they are passed to Orkeon).</summary>
    public IReadOnlyList<MountDeclaration> Mounts { get; }

    /// <summary>
    /// The mount sets a team can be bound to: <c>default</c> first, then every
    /// <c>mounts.&lt;name&gt;/</c> next to <c>teams/</c> that holds a folder for this team.
    /// </summary>
    /// <param name="teamDirectory">Physical team folder.</param>
    /// <returns>The set names, sorted after <c>default</c>.</returns>
    public static IReadOnlyList<string> SetNames(string teamDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(teamDirectory);

        var folder = Path.TrimEndingDirectorySeparator(Path.GetFullPath(teamDirectory));
        var workshop = Path.GetFullPath(Path.Combine(folder, "..", ".."));
        var team = Path.GetFileName(folder);
        var names = new List<string>();
        if (Directory.Exists(workshop))
        {
            foreach (var directory in Directory.EnumerateDirectories(workshop, SetPrefix + "*"))
            {
                var fileName = Path.GetFileName(directory);
                if (!fileName.StartsWith(SetPrefix, StringComparison.Ordinal))
                    continue;
                var name = fileName[SetPrefix.Length..];
                if (KebabCase().IsMatch(name) && Directory.Exists(Path.Combine(directory, team)))
                    names.Add(name);
            }
        }

        names.Sort(StringComparer.Ordinal);
        return [DefaultEnvironment, .. names];
    }

    /// <summary>Reads and validates <c>mounts.json</c> in <paramref name="teamDirectory"/>.</summary>
    /// <param name="teamDirectory">Physical team folder.</param>
    /// <returns>The parsed file.</returns>
    /// <exception cref="MountsFileException">The file is missing or invalid.</exception>
    public static MountsFile Load(string teamDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(teamDirectory);

        var path = Path.Combine(teamDirectory, FileName);
        if (!File.Exists(path))
            throw new MountsFileException($"{FileName} not found in the team folder '{teamDirectory}'.");
        return Parse(File.ReadAllText(path));
    }

    /// <summary>Tells whether <paramref name="directory"/> holds a <c>mounts.json</c>.</summary>
    /// <param name="directory">A physical directory.</param>
    /// <returns>True when the file exists.</returns>
    public static bool ExistsIn(string directory) =>
        !string.IsNullOrWhiteSpace(directory) && File.Exists(Path.Combine(directory, FileName));

    /// <summary>Parses and validates the JSON text of a <c>mounts.json</c>.</summary>
    /// <param name="json">The file content.</param>
    /// <returns>The parsed file.</returns>
    /// <exception cref="MountsFileException">The content is invalid.</exception>
    public static MountsFile Parse(string json)
    {
        ArgumentNullException.ThrowIfNull(json);

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(json, new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
        }
        catch (JsonException ex)
        {
            throw new MountsFileException($"{FileName} is not valid JSON: {ex.Message}", ex);
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
                throw new MountsFileException($"{FileName} must be a JSON object.");
            if (root.TryGetProperty("version", out var version)
                && (version.ValueKind != JsonValueKind.Number || !version.TryGetInt32(out var number) || number != SupportedVersion))
            {
                throw new MountsFileException($"{FileName}: version: expected {SupportedVersion}.");
            }

            if (!root.TryGetProperty("mounts", out var mountsElement) || mountsElement.ValueKind != JsonValueKind.Array)
                throw new MountsFileException($"{FileName}: mounts: expected an array of mount declarations.");

            // The per-environment paths of the first format: refused, with what replaced them.
            if (root.TryGetProperty("environments", out _))
                throw new MountsFileException($"{FileName}: environments: replaced by mount sets: a named set is the folder mounts.<name>/<team>/ next to teams/, one sub-folder per mount point - remove this key.");

            var mounts = new List<MountDeclaration>();
            var index = 0;
            foreach (var element in mountsElement.EnumerateArray())
                mounts.Add(ReadDeclaration(element, $"mounts[{index++}]", mounts));
            if (mounts.Count == 0)
                throw new MountsFileException($"{FileName}: mounts: a team declares at least one mount.");

            return new MountsFile(mounts);
        }
    }

    /// <summary>Binds every root to a physical directory of the mount set <paramref name="environment"/>.</summary>
    /// <param name="teamDirectory">Physical team folder; relative bindings resolve against it.</param>
    /// <param name="environment">Mount set; null, empty or <c>default</c> for the team's own folders.</param>
    /// <returns>One binding per declared root, in file order.</returns>
    /// <exception cref="MountsFileException">The mount set has no folder for this team, a binding cannot be reached, or one of the team's own folders is one its agents must never reach.</exception>
    public IReadOnlyList<MountBinding> Bind(string teamDirectory, string? environment) =>
        Bind(teamDirectory, environment, MachineFolders.Current);

    /// <summary>
    /// Binds every root to a physical directory of the mount set <paramref name="environment"/>,
    /// judging the team's own folders against the folders of <paramref name="machine"/>.
    /// </summary>
    /// <param name="teamDirectory">Physical team folder; relative bindings resolve against it.</param>
    /// <param name="environment">Mount set; null, empty or <c>default</c> for the team's own folders.</param>
    /// <param name="machine">The home folder, the configured workshop and the configuration home to guard.</param>
    /// <returns>One binding per declared root, in file order.</returns>
    /// <exception cref="MountsFileException">The mount set has no folder for this team, a binding cannot be reached, or one of the team's own folders is one its agents must never reach.</exception>
    internal IReadOnlyList<MountBinding> Bind(string teamDirectory, string? environment, MachineFolders machine)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(teamDirectory);
        ArgumentNullException.ThrowIfNull(machine);

        var name = string.IsNullOrWhiteSpace(environment) ? DefaultEnvironment : environment;
        var folder = Path.TrimEndingDirectorySeparator(Path.GetFullPath(teamDirectory));
        string? setFolder = null;
        if (!string.Equals(name, DefaultEnvironment, StringComparison.Ordinal))
        {
            if (!KebabCase().IsMatch(name))
                throw new MountsFileException($"{FileName}: unknown environment \"{name}\": a mount set is named in kebab-case, like its folder mounts.<name>/.");
            setFolder = Path.GetFullPath(Path.Combine(folder, "..", "..", SetPrefix + name, Path.GetFileName(folder)));
            if (!Directory.Exists(setFolder))
                throw new MountsFileException($"{FileName}: unknown environment \"{name}\": {setFolder} does not exist (known: {string.Join(", ", SetNames(folder))}).");
        }

        var bindings = new List<MountBinding>(Mounts.Count);
        foreach (var mount in Mounts)
        {
            var declared = setFolder is null ? mount.DefaultPath : Path.Combine(setFolder, mount.Root.TrimStart('/'));

            // Windows drops a trailing dot or space from a folder name (./crew. is crew/ there), and Studio
            // and run.cmd bind the same declarations on the host.
            if (setFolder is null && TrailingDotOrSpace(declared) is { } trailing)
                throw new MountsFileException($"{FileName}: {mount.Root} is bound to {declared}, whose folder name \"{trailing}\" ends with a dot or a space: Windows drops them, so on the host Orkeon Studio and run.cmd would bind another folder - name the folder without them");

            // A path of the Windows host (C:\Shares\inbox, \\nas\share) is legal in the file -
            // Studio runs there and reads the same bindings - but only reachable on Windows.
            if (WindowsAbsolutePath().IsMatch(declared) && !OperatingSystem.IsWindows())
                throw new MountsFileException($"{FileName}: root {mount.Root} is bound to a Windows host path for environment \"{name}\" ({declared}): it cannot be mounted from this machine.");

            var physical = Path.TrimEndingDirectorySeparator(
                Path.GetFullPath(Path.IsPathRooted(declared) ? declared : Path.Combine(folder, declared)));
            var within = IsWithin(folder, physical);
            if (setFolder is null)
                CheckReach(mount.Root, physical, folder, within, machine);
            bindings.Add(new MountBinding(mount.Root, mount.Access, mount.Role, physical, External: !within));
        }

        return bindings;
    }

    /// <summary>
    /// Makes sure every bound directory exists: a writable root (deliverables, state) is
    /// created on demand, a read-only root must already be there.
    /// </summary>
    /// <param name="bindings">Bindings returned by <see cref="Bind(string, string)"/>.</param>
    /// <exception cref="MountsFileException">A read-only root points at a missing directory.</exception>
    public static void Provision(IEnumerable<MountBinding> bindings)
    {
        ArgumentNullException.ThrowIfNull(bindings);

        foreach (var binding in bindings)
        {
            if (Directory.Exists(binding.PhysicalPath))
                continue;
            if (!binding.IsWritable)
                throw new MountsFileException($"{FileName}: read-only root {binding.Root} is bound to a directory that does not exist: {binding.PhysicalPath}");
            Directory.CreateDirectory(binding.PhysicalPath);
        }
    }

    /// <summary>
    /// What the agents of the team reach through one binding of its own folders (D40). Orkeon's VFS gives
    /// them the folder behind each mount point and nothing else, so that folder must hold neither the
    /// definition of the team, nor the settings, credentials or harness of the machine, nor another team.
    /// The rule and its messages are the ones of orkeon-bench (<c>domain/mounts/mount-reach.ts</c>) and of
    /// the check scripts, which also warn about any other folder outside the team: Orkeon Studio launches
    /// the team only when that folder is declared, spelled exactly, in its Authorized folders. Folders are
    /// compared ignoring case, as a Windows host folder is, and judged as written: a symbolic link is not
    /// followed, and a folder name ending with a dot or a space is refused in <see cref="Bind(string, string, MachineFolders)"/>.
    /// </summary>
    private static void CheckReach(string root, string physical, string teamFolder, bool within, MachineFolders machine)
    {
        var problem = within
            ? InsideProblem(root, string.Join('/', SegmentsBelow(teamFolder, physical)))
            : OutsideProblem(root, physical, teamFolder, machine);
        if (problem is not null)
            throw new MountsFileException($"{FileName}: {problem}");
    }

    /// <summary>A folder of the team (<paramref name="inside"/>, relative, empty for the team folder itself) that no point may use.</summary>
    private static string? InsideProblem(string root, string inside)
    {
        if (inside.Length == 0)
            return $"{root} is bound to the team folder itself: its agents would reach crew/, the launchers and mounts.json, and on a writable point leave an appsettings.json that the next run reads - bind a sub-folder such as ./{root[1..]}";

        var first = inside.Split('/')[0];
        var reserved = ReservedTeamFolders.FirstOrDefault(name => string.Equals(name, first, StringComparison.OrdinalIgnoreCase));
        return reserved switch
        {
            null => null,
            "crew" => $"{root} is bound to ./{inside}, inside crew/: its agents would reach the definition of the team, and on a writable point change it or leave an appsettings.json that the next run reads - bind a folder of its own",
            _ => $"{root} is bound to ./{inside}: Orkeon looks for {reserved}/appsettings.json in the team folder when it searches for settings above crew/, so that name is kept for settings - name the folder otherwise",
        };
    }

    /// <summary>
    /// A folder outside the team that no point may use: one that holds a guarded folder, lies in a closed
    /// one or in a hidden folder of the home folder, or lies in another team or in its mount set. The
    /// workshops are the team's own, two levels above it, then <c>$ORKEON_WORKSHOP</c> when it names
    /// another one.
    /// </summary>
    private static string? OutsideProblem(string root, string physical, string teamFolder, MachineFolders machine)
    {
        var home = FullPath(machine.Home);
        var workshop = Path.GetFullPath(Path.Combine(teamFolder, "..", ".."));
        List<string> workshops = [workshop];
        if (FullPath(machine.Workshop) is { } configured && !string.Equals(configured, workshop, StringComparison.OrdinalIgnoreCase))
            workshops.Add(configured);

        var guarded = GuardedFolders(physical, teamFolder, workshops, home, FullPath(machine.ConfigHome));
        foreach (var (folder, what, _) in guarded)
        {
            if (IsWithin(physical, folder))
                return $"{root} is bound to {physical}, which holds {what}: its agents would reach it - bind a folder of its own";
        }

        foreach (var (folder, what, closed) in guarded)
        {
            if (closed && IsWithin(folder, physical))
                return $"{root} is bound to {physical}, inside {what}: its agents would reach it - bind a folder of its own";
        }

        if (home is not null && SegmentsBelow(home, physical) is [var below, ..] && below.StartsWith('.'))
            return $"{root} is bound to {physical}, inside a hidden folder of the home folder, where tools keep their settings and credentials: its agents would reach it - bind a folder of its own";

        var slug = Path.GetFileName(teamFolder);
        foreach (var segments in workshops.Select(folder => SegmentsBelow(folder, physical)))
        {
            if (segments is [var teams, var team, ..]
                && string.Equals(teams, "teams", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(team, slug, StringComparison.OrdinalIgnoreCase))
            {
                return $"{root} is bound to {physical}, inside another team: the agents of a team never reach the folders of another - share through a folder of its own";
            }

            if (segments is [var set, ..] && set.StartsWith(SetPrefix, StringComparison.OrdinalIgnoreCase))
            {
                if (segments.Length == 1)
                    return $"{root} is bound to {physical}, which holds the mount sets of every team: its agents would reach it - bind a folder of its own";
                if (!string.Equals(segments[1], slug, StringComparison.OrdinalIgnoreCase))
                    return $"{root} is bound to {physical}, inside a mount set of another team: the agents of a team never reach the folders of another - share through a folder of its own";
            }
        }

        return null;
    }

    /// <summary>
    /// The folders no mount point outside the team may hold, in the order they are judged, with what each
    /// one would expose; a point may not lie inside a closed one either.
    /// </summary>
    private static List<(string Folder, string What, bool Closed)> GuardedFolders(
        string physical, string teamFolder, List<string> workshops, string? home, string? configHome)
    {
        List<(string Folder, string What, bool Closed)> guarded = [(Path.GetPathRoot(physical) ?? "/", "the whole file system", false)];
        if (home is not null)
            guarded.Add((home, "the home folder, with the settings and credentials of the machine's tools", false));
        guarded.AddRange(workshops.Select(workshop => (workshop, "the workshop", false)));
        guarded.AddRange(workshops.Select(workshop => (Path.Combine(workshop, "teams"), "every team", false)));
        guarded.Add((teamFolder, "the team folder", false));
        guarded.AddRange(workshops.SelectMany(workshop => WorkshopFolders.Select(folder => (Path.Combine(workshop, folder.Name), folder.What, true))));
        for (var above = Path.GetDirectoryName(teamFolder); above is not null; above = Path.GetDirectoryName(above))
        {
            guarded.Add((Path.Combine(above, "appsettings"), SettingsAboveTheCrews, true));
            guarded.Add((Path.Combine(above, "_shared"), SettingsAboveTheCrews, true));
        }

        if (home is not null)
            guarded.Add((Path.Combine(home, "AppData"), "the user's application data, with Orkeon Studio's settings and the tokens of its mail accounts", true));
        if (configHome is not null)
            guarded.Add((Path.Combine(configHome, "Orkeon"), "the machine's Orkeon settings and the OAuth tokens of its mail accounts", true));
        if (!OperatingSystem.IsWindows())
            guarded.Add(("/proc", "the environment of every process, with the key of the model", true));
        return guarded;
    }

    /// <summary>The first folder name of <paramref name="path"/> (either separator) that ends with a dot or a space, or null.</summary>
    private static string? TrailingDotOrSpace(string path) =>
        path.Split('/', '\\').FirstOrDefault(segment => segment is not ("." or "..") && segment.Length > 0 && segment[^1] is '.' or ' ');

    /// <summary>A folder named by the machine, absolute and without a trailing separator; null when unset.</summary>
    private static string? FullPath(string? folder) =>
        string.IsNullOrWhiteSpace(folder) ? null : Path.TrimEndingDirectorySeparator(Path.GetFullPath(folder));

    /// <summary>True when <paramref name="path"/> is <paramref name="folder"/> or lies below it, ignoring case (a Windows host folder does).</summary>
    private static bool IsWithin(string folder, string path)
    {
        var trimmed = Path.TrimEndingDirectorySeparator(folder);
        var prefix = trimmed.EndsWith(Path.DirectorySeparatorChar) ? trimmed : trimmed + Path.DirectorySeparatorChar;
        return string.Equals(Path.TrimEndingDirectorySeparator(path), trimmed, StringComparison.OrdinalIgnoreCase)
            || path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// The segments of <paramref name="path"/> below <paramref name="folder"/>, found ignoring case and kept
    /// in the path's own spelling; empty when the path is the folder itself or lies elsewhere.
    /// </summary>
    private static string[] SegmentsBelow(string folder, string path)
    {
        var trimmed = Path.TrimEndingDirectorySeparator(folder);
        var prefix = trimmed.EndsWith(Path.DirectorySeparatorChar) ? trimmed : trimmed + Path.DirectorySeparatorChar;
        return path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            ? path[prefix.Length..].Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries)
            : [];
    }

    private static MountDeclaration ReadDeclaration(JsonElement element, string location, List<MountDeclaration> seen)
    {
        if (element.ValueKind != JsonValueKind.Object)
            throw new MountsFileException($"{FileName}: {location}: expected an object.");

        var root = RequiredString(element, "root", location);
        if (!VirtualRoot().IsMatch(root))
            throw new MountsFileException($"{FileName}: {location}.root: expected a virtual root such as /workspace (got \"{root}\").");
        if (ReservedRoots.Contains(root, StringComparer.Ordinal))
            throw new MountsFileException($"{FileName}: {location}.root: {root} is reserved for the runner ({string.Join(", ", ReservedRoots)}).");
        if (seen.Any(m => string.Equals(m.Root, root, StringComparison.Ordinal)))
            throw new MountsFileException($"{FileName}: {location}.root: duplicate root {root}.");

        var access = RequiredString(element, "access", location);
        if (!AccessTokens.Contains(access, StringComparer.Ordinal))
            throw new MountsFileException($"{FileName}: {location}.access: expected one of ro, rw, rwnd (got \"{access}\").");
        if (string.Equals(root, PluginsRoot, StringComparison.Ordinal) && !string.Equals(access, "ro", StringComparison.Ordinal))
            throw new MountsFileException($"{FileName}: {location}.access: {PluginsRoot} is where orkeon-harness-run loads plugins from when no --plugins names a folder: declare it \"access\": \"ro\", or its agents could drop code that the next run executes");

        var role = RequiredString(element, "role", location);
        if (!KebabCase().IsMatch(role))
            throw new MountsFileException($"{FileName}: {location}.role: expected a kebab-case role such as inputs (got \"{role}\").");

        var description = element.TryGetProperty("description", out var text) && text.ValueKind == JsonValueKind.String ? text.GetString() : null;
        return new MountDeclaration(root, access, role, PhysicalPath(RequiredString(element, "default", location), $"{location}.default"), description);
    }

    /// <summary>
    /// A physical path as written in the file. Nothing expands <c>~</c>, <c>$VAR</c> or
    /// <c>%VAR%</c>, so such a path would silently bind a folder of that name: refused.
    /// </summary>
    private static string PhysicalPath(string value, string location)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new MountsFileException($"{FileName}: {location}: a physical path is required.");
        if (value[0] is '~' or '$' or '%')
            throw new MountsFileException($"{FileName}: {location}: \"{value}\" is not expanded: write a path relative to the team folder, or an absolute path.");
        return value;
    }

    private static string RequiredString(JsonElement element, string name, string location)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()))
            throw new MountsFileException($"{FileName}: {location}.{name}: a non-empty string is required.");
        return value.GetString()!;
    }

    [GeneratedRegex("^/[a-z0-9][a-z0-9_-]*$", RegexOptions.CultureInvariant)]
    private static partial Regex VirtualRoot();

    [GeneratedRegex("^[a-z][a-z0-9-]*$", RegexOptions.CultureInvariant)]
    private static partial Regex KebabCase();

    [GeneratedRegex(@"^(?:[A-Za-z]:[\\/]|\\\\)", RegexOptions.CultureInvariant)]
    private static partial Regex WindowsAbsolutePath();
}

/// <summary>A <c>mounts.json</c> that is missing, malformed or inconsistent.</summary>
internal sealed class MountsFileException : Exception
{
    /// <summary>Initializes the exception.</summary>
    public MountsFileException()
    {
    }

    /// <summary>Initializes the exception with a message.</summary>
    /// <param name="message">What is wrong with the file.</param>
    public MountsFileException(string message)
        : base(message)
    {
    }

    /// <summary>Initializes the exception with a message and its cause.</summary>
    /// <param name="message">What is wrong with the file.</param>
    /// <param name="innerException">The underlying error.</param>
    public MountsFileException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
