using System.Globalization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Console;
using Orkeon.Application.Crew;
using Orkeon.Application.DependencyInjection;
using Orkeon.Compliance.Vfs;
using Orkeon.Constants.Configuration;
using Orkeon.Domain.FileSystem;
using Orkeon.Domain.Tools;
using Orkeon.Infrastructure.Configuration;
using Orkeon.Infrastructure.Crew;
using Orkeon.Infrastructure.DependencyInjection;
using Orkeon.Infrastructure.FileSystem;
using SampleTeam.Host.Events;
using SampleTeam.Host.Mounts;

namespace SampleTeam.Host.Composition;

/// <summary>
/// The composition root of the team: turns a team directory (<c>mounts.json</c>,
/// <c>appsettings.json</c>, <c>crew/</c>) into a built Orkeon container.
/// </summary>
/// <remarks>
/// The wiring order is the one Orkeon imposes:
/// <list type="number">
///   <item><description>the LLM provider, from the <c>Llm</c> section (before the infrastructure defaults);</description></item>
///   <item><description><c>AddOrkeonApplication()</c> + <c>AddOrkeonInfrastructure(configuration)</c>;</description></item>
///   <item><description><c>AddOrkeonFileSystem(configuration)</c>, with the mounts read from <c>mounts.json</c>;</description></item>
///   <item><description>the tool suites and the team's own tools;</description></item>
///   <item><description>a DI-backed <see cref="IToolRegistry"/>, so a crew can name those tools.</description></item>
/// </list>
/// </remarks>
[SuppressVfsCompliance("EXCEPTION-BOOTSTRAP: resolves the team directory, its settings files and the event file location before the DI container (and thus IFileSystemService) exists.")]
internal sealed class TeamHost : IAsyncDisposable
{
    /// <summary>Virtual root of the crew definition directory (read-only), as under <c>orkeon run</c>.</summary>
    public const string CrewVirtualRoot = "/crew";

    /// <summary>
    /// Internal virtual root of the run artefacts (the event file). Agents cannot address
    /// it, and a team cannot declare it: a root of mounts.json never starts with an underscore.
    /// </summary>
    public const string RunVirtualRoot = "/_run";

    /// <summary>Virtual root the framework writes AUTO_SUMMARY.md to, when the team declares it writable.</summary>
    public const string OutputVirtualRoot = "/output";

    private const string CrewDirectoryName = "crew";
    private const string StrictToolsKey = "Orkeon:CrewFactory:StrictTools";
    private const string PathWhitelistKey = "PathSecurity:AdditionalAllowedDirectories";

    /// <summary>The mount sections the host writes itself, from <c>mounts.json</c> and its own roots.</summary>
    private static readonly string[] HostMountKeys = [ConfigurationKeys.FileSystemMounts, ConfigurationKeys.FileSystemInternalMounts];

    private TeamHost(ServiceProvider services, IReadOnlyList<MountBinding> mounts, bool hasCrewDefinition, EventsTarget events)
    {
        Services = services;
        Mounts = mounts;
        HasCrewDefinition = hasCrewDefinition;
        Events = events;
    }

    /// <summary>The built container.</summary>
    public ServiceProvider Services { get; }

    /// <summary>The team's roots, bound for the selected environment.</summary>
    public IReadOnlyList<MountBinding> Mounts { get; }

    /// <summary>Whether the team directory holds a YAML crew under <c>crew/</c>.</summary>
    public bool HasCrewDefinition { get; }

    /// <summary>Where the event stream goes.</summary>
    public EventsTarget Events { get; }

    /// <summary>Builds the host of the team described by <paramref name="options"/>.</summary>
    /// <param name="options">Parsed command line.</param>
    /// <param name="stdout">Standard output (carries the protocol with <c>--events -</c>).</param>
    /// <param name="configure">Last-word service overrides, for tests.</param>
    /// <returns>The built host.</returns>
    /// <exception cref="MountsFileException"><c>mounts.json</c> is missing or invalid.</exception>
    /// <exception cref="FormatException">The event file shares its directory with a mounted root, or a settings file declares mounts.</exception>
    public static TeamHost Build(HostOptions options, TextWriter stdout, Action<IServiceCollection>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(stdout);

        var teamDirectory = Path.GetFullPath(options.TeamDirectory);
        var bindings = MountsFile.Load(teamDirectory).Bind(teamDirectory, options.EnvironmentName);
        MountsFile.Provision(bindings);

        var crewDirectory = Path.Combine(teamDirectory, CrewDirectoryName);
        var hasCrewDefinition = Directory.Exists(crewDirectory);

        var (events, eventsDirectory) = ResolveEvents(options, teamDirectory);
        EnsureEventsDirectoryIsIsolated(eventsDirectory, bindings, hasCrewDefinition ? crewDirectory : null);
        var configuration = BuildConfiguration(teamDirectory, bindings, hasCrewDefinition ? crewDirectory : null, eventsDirectory);

        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging(logging =>
        {
            // Everything the loggers write goes to stderr: stdout is the crew's answer, or
            // the event protocol.
            logging.SetMinimumLevel(LogLevel.Warning);
            logging.AddConfiguration(configuration.GetSection("Logging"));
            logging.AddSimpleConsole(console =>
            {
                console.SingleLine = true;
                console.TimestampFormat = "HH:mm:ss ";
            });
            logging.Services.Configure<ConsoleLoggerOptions>(console => console.LogToStandardErrorThreshold = LogLevel.Trace);
        });

        // 1. LLM provider (Llm section; echo provider when the section is absent).
        services.AddTeamLlmProvider(configuration);

        // 2. Application (orchestration, services) + Infrastructure (LLM, memory, YAML...).
        services.AddOrkeonApplication();
        services.AddOrkeonInfrastructure(configuration);

        // 3. Virtual file system: the mounts were written into Orkeon:FileSystem above.
        services.AddOrkeonFileSystem(configuration);

        // 4. Tool suites, then the team's own tools.
        services.AddTeamTools();

        // 5. Name resolution for the tools a crew lists, strict as the runner is: a tool
        //    the registry does not know fails the load instead of being silently dropped.
        services.AddSingleton<IToolRegistry, DependencyInjectionToolRegistry>();
        var strictTools = configuration.GetValue(StrictToolsKey, defaultValue: true);
        services.Configure<CrewFactoryOptions>(factory => factory.StrictTools = strictTools);

        // 6. Observation: AUTO_SUMMARY.md when /output is writable (as orkeon run does),
        //    then the event stream on top of it.
        if (bindings.Any(b => b.IsWritable && string.Equals(b.Root, OutputVirtualRoot, StringComparison.Ordinal)))
        {
            services.AddScoped<ICrewExecutionHook>(sp => new AutoSummaryWriter(
                sp.GetRequiredService<IFileSystemService>(),
                OutputVirtualRoot,
                sp.GetRequiredService<ILogger<AutoSummaryWriter>>()));
        }

        if (events.Enabled)
            EventStream.Wire(services, events, stdout);

        configure?.Invoke(services);

        return new TeamHost(services.BuildServiceProvider(), bindings, hasCrewDefinition, events);
    }

    /// <inheritdoc />
    public ValueTask DisposeAsync() => Services.DisposeAsync();

    /// <summary>
    /// Decides where the events go: nowhere when validating or disabled, stdout for
    /// <c>-</c>, otherwise a file whose DIRECTORY becomes the internal <c>/_run</c> mount.
    /// </summary>
    private static (EventsTarget Target, string? Directory) ResolveEvents(HostOptions options, string teamDirectory)
    {
        if (options.Validate || string.Equals(options.Events, HostOptions.EventsDisabled, StringComparison.OrdinalIgnoreCase))
            return (EventsTarget.None, null);
        if (string.Equals(options.Events, HostOptions.EventsToStdout, StringComparison.Ordinal))
            return (new EventsTarget(ToStdout: true, VirtualPath: null), null);

        var file = Path.GetFullPath(Path.Combine(teamDirectory, options.Events ?? HostOptions.DefaultEventsFile));
        var directory = Path.GetDirectoryName(file)!;
        return (new EventsTarget(ToStdout: false, VirtualPath: $"{RunVirtualRoot}/{Path.GetFileName(file)}"), directory);
    }

    /// <summary>
    /// The directory of the event file becomes an INTERNAL mount, and Orkeon gives an agent
    /// no address at all for a path that lies under an internal mount. A directory that
    /// contains a root of the team (or the crew definition) would therefore make that root
    /// unreachable: refuse it up front, with the reason.
    /// </summary>
    private static void EnsureEventsDirectoryIsIsolated(string? eventsDirectory, IReadOnlyList<MountBinding> bindings, string? crewDirectory)
    {
        if (eventsDirectory is null)
            return;

        var mounted = bindings.Select(b => (b.Root, b.PhysicalPath));
        if (crewDirectory is not null)
            mounted = mounted.Append((CrewVirtualRoot, crewDirectory));

        var prefix = Path.TrimEndingDirectorySeparator(eventsDirectory) + Path.DirectorySeparatorChar;
        foreach (var (virtualPath, physicalPath) in mounted)
        {
            var root = Path.TrimEndingDirectorySeparator(physicalPath) + Path.DirectorySeparatorChar;
            if (root.StartsWith(prefix, StringComparison.Ordinal))
            {
                throw new FormatException(
                    $"The event file must live in a directory of its own: '{eventsDirectory}' contains the directory mounted as '{virtualPath}'. "
                    + $"Use a dedicated folder, e.g. --events {HostOptions.DefaultEventsFile}.");
            }
        }

        Directory.CreateDirectory(eventsDirectory);
    }

    /// <summary>
    /// Settings, lowest to highest precedence: <c>appsettings.json</c>,
    /// <c>appsettings.local.json</c> (untracked: local endpoints), the team's settings file of
    /// the workshop - <c>settings/&lt;team&gt;/appsettings.json</c> two levels above the team folder
    /// (D33), where a team in a workshop keeps its settings - the <c>ORKEON_</c> environment
    /// (same variables as the CLI: <c>ORKEON_Llm__BaseUrl</c>...), then the mounts computed from
    /// <c>mounts.json</c>. Unlike <c>orkeon run</c>, which reads one settings file, the host merges
    /// them key by key.
    /// </summary>
    /// <remarks>
    /// The mounts are the host's alone. Configuration merges an array index by index, so a mount a
    /// settings file declared beyond the host's own would silently stay mounted: a settings file
    /// declaring <c>Orkeon:FileSystem:Mounts</c> or <c>InternalMounts</c> is refused. The path
    /// whitelist only ever widens, so the host's entries come after the declared ones, as
    /// <c>orkeon run</c> places them.
    /// </remarks>
    /// <exception cref="FormatException">A settings file, or the environment, declares mounts.</exception>
    private static IConfigurationRoot BuildConfiguration(
        string teamDirectory, IReadOnlyList<MountBinding> bindings, string? crewDirectory, string? eventsDirectory)
    {
        var builder = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(teamDirectory, "appsettings.json"), optional: true, reloadOnChange: false)
            .AddJsonFile(Path.Combine(teamDirectory, "appsettings.local.json"), optional: true, reloadOnChange: false);
        var workshop = Path.GetDirectoryName(Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(Path.GetFullPath(teamDirectory))));
        if (!string.IsNullOrEmpty(workshop))
        {
            builder.AddJsonFile(
                Path.Combine(workshop, "settings", Path.GetFileName(Path.TrimEndingDirectorySeparator(teamDirectory)), "appsettings.json"),
                optional: true, reloadOnChange: false);
        }

        builder.AddEnvironmentVariables("ORKEON_");
        var declared = builder.Build();
        RefuseDeclaredMounts(declared);

        var settings = new Dictionary<string, string?>(StringComparer.Ordinal);
        var allowed = new List<string>();
        var index = 0;

        // The crew definition is read through the VFS, as under orkeon run.
        if (crewDirectory is not null)
        {
            settings[$"{ConfigurationKeys.FileSystemMounts}:{index++}"] = $"{FileSystemMount.Quote(crewDirectory)}:{CrewVirtualRoot}:ro";
            allowed.Add(crewDirectory);
        }

        foreach (var binding in bindings)
        {
            settings[$"{ConfigurationKeys.FileSystemMounts}:{index++}"] = binding.ToMountString();
            allowed.Add(binding.PhysicalPath);
        }

        // Run artefacts live on an INTERNAL mount: resolvable by the host, absent from the
        // agents' mount table and refused to their tools.
        if (eventsDirectory is not null)
        {
            settings[$"{ConfigurationKeys.FileSystemInternalMounts}:0"] = $"{FileSystemMount.Quote(eventsDirectory)}:{RunVirtualRoot}:rw";
            allowed.Add(eventsDirectory);
        }

        // The path validator's workspace root is the current directory; a team's roots may
        // live anywhere (a share, another repository), so each bound directory is allowed
        // explicitly - what --allow-external-mounts does for the runner - after the entries
        // the settings declare.
        var next = NextIndex(declared.GetSection(PathWhitelistKey));
        for (var i = 0; i < allowed.Count; i++)
            settings[$"{PathWhitelistKey}:{next + i}"] = allowed[i];

        return builder.AddInMemoryCollection(settings).Build();
    }

    /// <summary>
    /// Refuses a settings file, or an <c>ORKEON_</c> variable, that declares an entry of the mounts
    /// the host writes itself.
    /// </summary>
    private static void RefuseDeclaredMounts(IConfigurationRoot declared)
    {
        foreach (var key in HostMountKeys)
        {
            foreach (var provider in declared.Providers)
            {
                if (!provider.GetChildKeys([], key).Any())
                    continue;

                var source = provider is FileConfigurationProvider file
                    ? $"{file.Source.FileProvider?.GetFileInfo(file.Source.Path ?? string.Empty).PhysicalPath ?? file.Source.Path}: a settings file"
                    : "an ORKEON_ environment variable";
                throw new FormatException($"{source} may not declare {key}: the team's mount points come from {MountsFile.FileName}");
            }
        }
    }

    /// <summary>The index after the highest numbered entry of <paramref name="section"/>, as <c>orkeon run</c> appends.</summary>
    private static int NextIndex(IConfigurationSection section) =>
        section.GetChildren()
            .Select(child => int.TryParse(child.Key, NumberStyles.None, CultureInfo.InvariantCulture, out var number) ? number + 1 : 0)
            .DefaultIfEmpty(0)
            .Max();
}
