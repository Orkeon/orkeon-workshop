namespace SampleTeam.Host;

/// <summary>Command line of the team host.</summary>
/// <remarks>
/// <code>
/// SampleTeam.Host [--team-dir &lt;dir&gt;] [--env &lt;name&gt;] [--events &lt;file&gt;|-|none]
///                 [--input &lt;text&gt;] [--var KEY=VALUE]... [--validate]
///                 [--mount &lt;path&gt;:&lt;root&gt;:&lt;access&gt;...] [--allow-external-mounts]
///                 [--settings &lt;file&gt;] [--no-decision] [--list-tools]
/// </code>
/// </remarks>
internal sealed record HostOptions
{
    /// <summary>Environment variable that selects a mount set: <c>mounts.&lt;name&gt;/&lt;team&gt;/</c> next to <c>teams/</c>.</summary>
    public const string EnvironmentVariable = "TEAM_ENV";

    /// <summary>Value of <c>--events</c> that sends the protocol to stdout.</summary>
    public const string EventsToStdout = "-";

    /// <summary>Value of <c>--events</c> that switches the event stream off.</summary>
    public const string EventsDisabled = "none";

    /// <summary>
    /// Default event file, relative to the team directory. It lives in a directory of its
    /// own: the host mounts that directory as an internal root, and nothing under an
    /// internal root is reachable by an agent.
    /// </summary>
    public const string DefaultEventsFile = "run/events.jsonl";

    /// <summary>Usage text printed on a bad command line.</summary>
    public static readonly string Usage = string.Join(System.Environment.NewLine,
        "Usage: SampleTeam.Host [options]",
        "  --team-dir <dir>   Team directory holding mounts.json, appsettings.json and crew/ (default: current directory)",
        "  --env <name>       Mount set to bind: mounts.<name>/<team>/ next to teams/ (default: $TEAM_ENV, else the team's own folders)",
        "  --events <target>  events.jsonl path, '-' for stdout, 'none' to disable (default: <team-dir>/run/events.jsonl)",
        "  --input <text>     Initial context handed to the crew",
        "  --var KEY=VALUE    Template variable for task descriptions ({KEY}); repeatable",
        "  --validate         Build the host and load the crew (strict tool resolution) without calling the LLM",
        "  --mount <spec>...  Bind every root of mounts.json explicitly (path:/root:access, as orkeon run), instead of",
        "                     the team's folders or a mount set; a folder outside the team folder needs",
        "  --allow-external-mounts (or ORKEON_ALLOW_EXTERNAL_MOUNTS=1), as for orkeon run",
        "  --settings <file>  The one settings file, instead of appsettings*.json and settings/<team>/appsettings.json",
        "  --no-decision      Switch the decision circuit off: no call reaches the decision model; decision tasks answer",
        "                     from their fallback (or relay), a crew with decision.mode: required is refused (exit 69)",
        "  --list-tools       Print the name of every tool the host registers, one per line, and stop");

    /// <summary>Team directory (physical). Relative paths of <c>mounts.json</c> resolve against it.</summary>
    public string TeamDirectory { get; init; } = ".";

    /// <summary>Name of the mount set (<c>mounts.&lt;name&gt;/</c>), or null for the team's own folders.</summary>
    public string? EnvironmentName { get; init; }

    /// <summary>Event target: a file path, <see cref="EventsToStdout"/> or <see cref="EventsDisabled"/>; null = default file.</summary>
    public string? Events { get; init; }

    /// <summary>Initial context handed to the crew.</summary>
    public string? InitialContext { get; init; }

    /// <summary>Template variables.</summary>
    public IReadOnlyDictionary<string, string> Variables { get; init; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Load the crew and stop, without kickoff.</summary>
    public bool Validate { get; init; }

    /// <summary>Explicit bindings (<c>path:/root:access</c>, as <c>orkeon run --mount</c>); empty for <c>mounts.json</c>'s own.</summary>
    public IReadOnlyList<string> Mounts { get; init; } = [];

    /// <summary>The one settings file of the run, as <c>orkeon run --settings</c>; null for the host's chain.</summary>
    public string? SettingsFile { get; init; }

    /// <summary>Switch the decision circuit off, as <c>orkeon run --no-decision</c>: no consumer asks the decision model (Orkeon 1.4.0, #433).</summary>
    public bool NoDecision { get; init; }

    /// <summary>Print the registered tool names and stop, as <c>orkeon run --list-tools</c>.</summary>
    public bool ListTools { get; init; }

    /// <summary>
    /// <c>--allow-external-mounts</c>: an explicit <c>--mount</c> may name a folder outside the team
    /// folder, as <c>orkeon run</c> allows one outside its working directory only on this opt-in.
    /// </summary>
    public bool AllowExternalMounts { get; init; }

    /// <summary>Parses the command line.</summary>
    /// <param name="args">Process arguments.</param>
    /// <param name="environmentName">Value of <see cref="EnvironmentVariable"/>, used when <c>--env</c> is absent.</param>
    /// <returns>The parsed options.</returns>
    /// <exception cref="FormatException">The command line is malformed.</exception>
    public static HostOptions Parse(IReadOnlyList<string> args, string? environmentName)
    {
        ArgumentNullException.ThrowIfNull(args);

        var options = new HostOptions { EnvironmentName = string.IsNullOrWhiteSpace(environmentName) ? null : environmentName };
        var variables = new Dictionary<string, string>(StringComparer.Ordinal);
        var mounts = new List<string>();

        for (var i = 0; i < args.Count; i++)
        {
            switch (args[i])
            {
                case "--team-dir":
                    options = options with { TeamDirectory = Value(args, ref i) };
                    break;
                case "--env":
                    options = options with { EnvironmentName = Value(args, ref i) };
                    break;
                case "--events":
                    options = options with { Events = Value(args, ref i) };
                    break;
                case "--input":
                    options = options with { InitialContext = Value(args, ref i) };
                    break;
                case "--var":
                    var pair = Value(args, ref i);
                    var separator = pair.IndexOf('=', StringComparison.Ordinal);
                    if (separator <= 0)
                        throw new FormatException($"Invalid --var '{pair}': expected KEY=VALUE with a non-empty KEY.");
                    variables[pair[..separator].Trim()] = pair[(separator + 1)..];
                    break;
                case "--validate":
                    options = options with { Validate = true };
                    break;
                case "--mount":
                    // One flag carries every binding, as for orkeon run: the values up to the next option.
                    var first = mounts.Count;
                    while (i + 1 < args.Count && !args[i + 1].StartsWith("--", StringComparison.Ordinal))
                        mounts.Add(args[++i]);
                    if (mounts.Count == first)
                        throw new FormatException("Option '--mount' expects at least one path:/root:access.");
                    break;
                case "--allow-external-mounts":
                    options = options with { AllowExternalMounts = true };
                    break;
                case "--settings":
                    options = options with { SettingsFile = Value(args, ref i) };
                    break;
                case "--no-decision":
                    options = options with { NoDecision = true };
                    break;
                case "--list-tools":
                    options = options with { ListTools = true };
                    break;
                default:
                    throw new FormatException($"Unknown argument '{args[i]}'.");
            }
        }

        return options with { Variables = variables, Mounts = mounts };
    }

    private static string Value(IReadOnlyList<string> args, ref int index)
    {
        if (index + 1 >= args.Count)
            throw new FormatException($"Option '{args[index]}' expects a value.");
        return args[++index];
    }
}
