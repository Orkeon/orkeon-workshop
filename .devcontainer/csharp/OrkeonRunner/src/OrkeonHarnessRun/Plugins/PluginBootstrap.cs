using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Orkeon.Compliance.Vfs;
using Orkeon.Constants.Configuration;
using Orkeon.Domain.FileSystem;
using Orkeon.Infrastructure.FileSystem;
using Orkeon.Plugins;

namespace OrkeonHarnessRun.Plugins;

/// <summary>
/// Activates the Orkeon plugin system for one run.
/// </summary>
/// <remarks>
/// <para>
/// <c>AddOrkeonPlugins</c> needs an <c>IFileSystemService</c> at REGISTRATION time (plugins
/// contribute services before the container is built), and the host hook does not provide
/// one. This class builds it: a private registry holding a single read-only mount of the
/// plugin directory under the virtual root named by <c>Plugins:Directory</c> (default
/// <c>/plugins</c>), served by the real <see cref="FileSystemService"/> with
/// <see cref="PluginDirectoryPathValidator"/>.
/// </para>
/// <para>
/// Configuration (section <c>Plugins</c>, same keys as Orkeon): <c>Directory</c> (virtual
/// path), <c>SearchPattern</c> (default <c>*.dll</c>), <c>ContinueOnError</c> (default
/// false: the first unloadable assembly fails the startup). Layouts, first level only:
/// <c>/plugins/X.dll</c> or <c>/plugins/X/X.dll</c> (private dependencies next to it).
/// </para>
/// </remarks>
[SuppressVfsCompliance("EXCEPTION-BOOTSTRAP: plugin discovery runs at registration time, before the DI container and its IFileSystemService exist; this class provisions the private read-only mount discovery goes through.")]
internal static class PluginBootstrap
{
    /// <summary>Environment variable naming the default physical plugin directory.</summary>
    public const string DirectoryVariable = "ORKEON_HARNESS_PLUGINS";

    /// <summary>
    /// Discovers and loads the plugins, letting each one register its services in
    /// <paramref name="services"/>. Does nothing when no plugin directory is designated.
    /// </summary>
    /// <param name="services">The host's service collection.</param>
    /// <param name="configuration">Host configuration (settings file, environment, CLI mounts).</param>
    /// <param name="explicitDirectory">Value of <c>--plugins</c>, or null.</param>
    /// <param name="environmentDirectory">Value of <see cref="DirectoryVariable"/>, or null.</param>
    /// <param name="diagnostics">Where the one-line load report goes (stderr).</param>
    /// <returns>The plugin registry, or null when plugins stay off.</returns>
    /// <exception cref="DirectoryNotFoundException">An explicitly designated directory does not exist.</exception>
    /// <exception cref="PluginLoadException">A plugin failed to load and <c>ContinueOnError</c> is false.</exception>
    public static IPluginRegistry? AddPlugins(
        IServiceCollection services,
        IConfiguration configuration,
        string? explicitDirectory,
        string? environmentDirectory,
        TextWriter diagnostics)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(diagnostics);

        var options = new OrkeonPluginsOptions();
        configuration.GetSection(OrkeonPluginsServiceCollectionExtensions.ConfigurationSection).Bind(options);
        var virtualRoot = NormalizeVirtualDirectory(options.Directory);

        var physical = ResolvePhysicalDirectory(configuration, explicitDirectory, environmentDirectory, virtualRoot, diagnostics);
        if (physical is null)
            return null;
        if (!Directory.Exists(physical))
            throw new DirectoryNotFoundException($"plugin directory does not exist: {physical}");

        // Private bootstrap file system: one read-only mount, discarded once the assemblies
        // are loaded. It is never registered in DI, so no agent can reach it.
        using var registry = new FileSystemRegistry([new FileSystemMount(physical, virtualRoot, FileAccessRights.ReadOnly)]);
        var fileSystem = new FileSystemService(
            registry, new PluginDirectoryPathValidator(physical), NullLogger<FileSystemService>.Instance);

        services.AddOrkeonPlugins(fileSystem, configuration);

        var loaded = services.LastOrDefault(d => d.ServiceType == typeof(IPluginRegistry))?.ImplementationInstance as IPluginRegistry;
        Report(loaded, virtualRoot, diagnostics);
        return loaded;
    }

    /// <summary>
    /// Picks the physical plugin directory: <c>--plugins</c>, then the environment variable,
    /// then the mount (settings or <c>--mount</c>) that provides the plugin virtual root - only
    /// when its agents cannot write there: a plugin is code the runner executes, and a writable
    /// folder would let them drop some for the next run. A writable one is reported and skipped.
    /// </summary>
    /// <returns>An absolute physical path, or null when nothing designates one.</returns>
    internal static string? ResolvePhysicalDirectory(
        IConfiguration configuration, string? explicitDirectory, string? environmentDirectory, string virtualRoot, TextWriter diagnostics)
    {
        ArgumentNullException.ThrowIfNull(diagnostics);

        if (!string.IsNullOrWhiteSpace(explicitDirectory))
            return Path.GetFullPath(explicitDirectory);
        if (!string.IsNullOrWhiteSpace(environmentDirectory))
            return Path.GetFullPath(environmentDirectory);

        FileSystemMount? best = null;
        foreach (var entry in configuration.GetSection(ConfigurationKeys.FileSystemMounts).GetChildren())
        {
            if (string.IsNullOrWhiteSpace(entry.Value) || !TryParse(entry.Value, out var mount))
                continue;

            var mountRoot = mount.VirtualPath.TrimEnd('/');
            var provides = string.Equals(virtualRoot, mountRoot, StringComparison.Ordinal)
                || virtualRoot.StartsWith(mountRoot + "/", StringComparison.Ordinal);
            if (provides && (best is null || mount.VirtualPath.Length > best.VirtualPath.Length))
                best = mount;
        }

        if (best is null)
            return null;

        var relative = virtualRoot[best.VirtualPath.TrimEnd('/').Length..].TrimStart('/');
        var physical = Path.GetFullPath(relative.Length == 0
            ? best.BasePath
            : Path.Combine(best.BasePath, relative.Replace('/', Path.DirectorySeparatorChar)));
        if (LetsAgentsWrite(best, relative))
        {
            diagnostics.WriteLine(
                $"{HarnessRunner.LoggerCategory}: plugins NOT loaded from {virtualRoot}: its mount ({physical}) is writable, so its agents could drop code "
                + "that the next run executes - mount it read-only (ro), or name the folder with --plugins");
            return null;
        }

        return physical;
    }

    /// <summary>
    /// True when the agents can write at <paramref name="relative"/> (below the root of
    /// <paramref name="mount"/>) or anywhere under it: the rights there, or a sub-path override below it.
    /// </summary>
    private static bool LetsAgentsWrite(FileSystemMount mount, string relative)
    {
        const FileAccessRights writing = FileAccessRights.Write | FileAccessRights.Create | FileAccessRights.Delete;
        if ((mount.ResolveRights(relative) & writing) != 0)
            return true;

        return mount.Overrides.Any(entry =>
        {
            var path = entry.RelativePath.Replace('\\', '/').Trim('/');
            var below = relative.Length == 0
                || string.Equals(path, relative, StringComparison.Ordinal)
                || path.StartsWith(relative + "/", StringComparison.Ordinal);
            return below && (entry.Rights & writing) != 0;
        });
    }

    private static bool TryParse(string mountString, out FileSystemMount mount)
    {
        try
        {
            mount = FileSystemMount.Parse(mountString);
            return true;
        }
        catch (Exception ex) when (ex is FormatException or ArgumentException)
        {
            // A malformed mount is reported by the host itself, with its own precise message.
            mount = null!;
            return false;
        }
    }

    private static string NormalizeVirtualDirectory(string directory)
    {
        var trimmed = (directory ?? string.Empty).Trim().TrimEnd('/');
        return trimmed.StartsWith('/') ? trimmed : "/" + trimmed;
    }

    private static void Report(IPluginRegistry? registry, string virtualRoot, TextWriter diagnostics)
    {
        if (registry is null)
            return;

        foreach (var plugin in registry.Plugins)
            diagnostics.WriteLine($"{HarnessRunner.LoggerCategory}: plugin loaded from {virtualRoot}: {plugin.Name} {plugin.Version}");
        foreach (var failure in registry.Failures)
            diagnostics.WriteLine($"{HarnessRunner.LoggerCategory}: plugin NOT loaded: {failure.VirtualPath} - {failure.Reason}");
        if (registry.Plugins.Count == 0 && registry.Failures.Count == 0)
            diagnostics.WriteLine($"{HarnessRunner.LoggerCategory}: no plugin found under {virtualRoot}");
    }
}
