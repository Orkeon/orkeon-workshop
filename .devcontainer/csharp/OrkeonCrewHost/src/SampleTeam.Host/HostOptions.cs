namespace SampleTeam.Host;

/// <summary>Command line of the team host.</summary>
/// <remarks>
/// <code>
/// SampleTeam.Host [--team-dir &lt;dir&gt;] [--env &lt;name&gt;] [--events &lt;file&gt;|-|none]
///                 [--input &lt;text&gt;] [--var KEY=VALUE]... [--validate]
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
        "  --validate         Build the host and load the crew (strict tool resolution) without calling the LLM");

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
                default:
                    throw new FormatException($"Unknown argument '{args[i]}'.");
            }
        }

        return options with { Variables = variables };
    }

    private static string Value(IReadOnlyList<string> args, ref int index)
    {
        if (index + 1 >= args.Count)
            throw new FormatException($"Option '{args[index]}' expects a value.");
        return args[++index];
    }
}
