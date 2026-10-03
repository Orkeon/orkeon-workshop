using System.Runtime.Loader;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Orkeon.Domain.Common;
using Orkeon.Domain.FileSystem;
using Orkeon.Domain.Tools;
using Orkeon.Domain.Tools.Security;
using Orkeon.Infrastructure.Configuration;
using Orkeon.Infrastructure.FileSystem;
using Orkeon.Infrastructure.Security;
using Orkeon.Plugins;
using SampleExtractor.Plugin.Tests.Hosting;

namespace SampleExtractor.Plugin.Tests;

/// <summary>
/// The plugin route end to end, in process: the built plugin DLL is dropped in a folder,
/// the folder is mounted as <c>/plugins</c>, and the REAL loader (<c>AddOrkeonPlugins</c>)
/// discovers it, loads it in an isolated AssemblyLoadContext and lets it register its tool.
/// This is exactly what a host does at startup; no Orkeon binary shipped at rc.4 does it,
/// which is why the harness brings its own runner (OrkeonRunner).
/// </summary>
public sealed class PluginLoadingTests : IDisposable
{
    private const string PluginAssemblyName = "SampleExtractor.Plugin";
    private readonly string _dropRoot = Path.Combine(Path.GetTempPath(), "orkeon-plugin-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_dropRoot))
                Directory.Delete(_dropRoot, recursive: true);
        }
        catch (IOException)
        {
            // Best effort: a still-loaded plugin context may keep the file busy on Windows.
        }
    }

    /// <summary>Copies the plugin DLL built next to the tests into a drop folder.</summary>
    private string DropPlugin(bool folderPerPlugin)
    {
        var source = typeof(SampleExtractorPlugin).Assembly.Location;
        var target = folderPerPlugin ? Path.Combine(_dropRoot, PluginAssemblyName) : _dropRoot;
        Directory.CreateDirectory(target);
        File.Copy(source, Path.Combine(target, PluginAssemblyName + ".dll"));
        return _dropRoot;
    }

    private static FileSystemRegistry RegistryFor(string physicalDirectory) =>
        new([FileSystemMount.Parse($"{FileSystemMount.Quote(physicalDirectory)}:/plugins:ro")]);

    /// <summary>The real VFS over one read-only mount, with the validator a host must use.</summary>
    private static FileSystemService PluginFileSystem(string physicalDirectory, FileSystemRegistry registry) =>
        new(registry, new PluginDirectoryPathValidator(physicalDirectory), NullLogger<FileSystemService>.Instance);

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Loader_FindsThePluginAndItsToolResolvesByName(bool folderPerPlugin)
    {
        var drop = DropPlugin(folderPerPlugin);
        using var registry = RegistryFor(drop);
        var fileSystem = PluginFileSystem(drop, registry);

        var services = new ServiceCollection();
        services.AddSingleton<IFileSystemService>(fileSystem);
        services.AddOrkeonPlugins(fileSystem, options => options.Directory = "/plugins");
        using var provider = services.BuildServiceProvider();

        // The registry lists what was loaded...
        var plugins = provider.GetRequiredService<IPluginRegistry>();
        Assert.Empty(plugins.Failures);
        var plugin = Assert.Single(plugins.Plugins);
        Assert.Equal("orkeon-harness.sample-extractor", plugin.Name);

        // ...and the tool the plugin contributed resolves by its contract name.
        var tools = provider.GetServices<IBaseTool>().ToDictionary(t => t.Name, StringComparer.OrdinalIgnoreCase);
        var tool = Assert.Contains("sample_extractor", tools);

        // It comes from the plugin's own load context, not from the copy the tests reference.
        Assert.NotSame(AssemblyLoadContext.Default, AssemblyLoadContext.GetLoadContext(tool.GetType().Assembly));
    }

    [Fact]
    public void Loader_ReturnsNothingWhenThePluginFolderIsEmpty()
    {
        Directory.CreateDirectory(_dropRoot);
        using var registry = RegistryFor(_dropRoot);
        var fileSystem = PluginFileSystem(_dropRoot, registry);

        var services = new ServiceCollection();
        services.AddOrkeonPlugins(fileSystem, options => options.Directory = "/plugins");
        using var provider = services.BuildServiceProvider();

        Assert.Empty(provider.GetRequiredService<IPluginRegistry>().Plugins);
        Assert.Empty(provider.GetServices<IBaseTool>());
    }

    /// <summary>
    /// Canary for an upstream behaviour the harness works around: through the regular VFS
    /// (stock <c>PathValidator</c>) the candidate <c>.dll</c> is denied and silently
    /// dropped, so nothing loads. When this test starts failing, Orkeon has fixed it and
    /// <see cref="PluginDirectoryPathValidator"/> can go.
    /// </summary>
    [Fact]
    public void Loader_ThroughTheStockPathValidator_SilentlyFindsNothing()
    {
        var drop = DropPlugin(folderPerPlugin: false);
        using var registry = RegistryFor(drop);
        var security = new PathSecurityOptions();
        security.AdditionalAllowedDirectories.Add(drop);
        var stockFileSystem = new FileSystemService(
            registry,
            new PathValidator(security, NullLogger<PathValidator>.Instance),
            NullLogger<FileSystemService>.Instance);

        var services = new ServiceCollection();
        services.AddOrkeonPlugins(stockFileSystem, options => options.Directory = "/plugins");
        using var provider = services.BuildServiceProvider();

        var plugins = provider.GetRequiredService<IPluginRegistry>();
        Assert.Empty(plugins.Plugins);
        Assert.Empty(plugins.Failures);
        Assert.False(stockFileSystem.ResolveAndValidate("/plugins/SampleExtractor.Plugin.dll", FileAccessRights.Read).IsAllowed);
    }
}
