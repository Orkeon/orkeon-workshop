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
/// This is exactly what a host does at startup; no Orkeon binary that runs a crew does it
/// (at 1.2.0 <c>orkeon-repl</c> alone loads plugins), which is why the harness brings its own
/// runner (OrkeonRunner).
/// </summary>
public sealed class PluginLoadingTests : IDisposable
{
    private const string PluginAssemblyName = "SampleExtractor.Plugin";
    private const string ManifestFileName = "plugin.json";
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

    /// <summary>
    /// Copies the plugin built next to the tests into a drop folder: one sub-folder per plugin,
    /// holding the entry assembly and - unless <paramref name="withManifest"/> is false - its
    /// <c>plugin.json</c>. With <paramref name="flat"/> the assembly lies in the directory itself.
    /// </summary>
    private string DropPlugin(bool withManifest = true, bool flat = false)
    {
        var source = typeof(SampleExtractorPlugin).Assembly.Location;
        var target = flat ? _dropRoot : Path.Combine(_dropRoot, PluginAssemblyName);
        Directory.CreateDirectory(target);
        File.Copy(source, Path.Combine(target, PluginAssemblyName + ".dll"));
        if (withManifest)
            File.Copy(Path.Combine(Path.GetDirectoryName(source)!, ManifestFileName), Path.Combine(target, ManifestFileName));
        return _dropRoot;
    }

    private static FileSystemRegistry RegistryFor(string physicalDirectory) =>
        new([FileSystemMount.Parse($"{FileSystemMount.Quote(physicalDirectory)}:/plugins:ro")]);

    /// <summary>The real VFS over one read-only mount, with the validator a host must use.</summary>
    private static FileSystemService PluginFileSystem(string physicalDirectory, FileSystemRegistry registry) =>
        new(registry, new PluginDirectoryPathValidator(physicalDirectory), NullLogger<FileSystemService>.Instance);

    [Fact]
    public void Loader_FindsThePluginAndItsToolResolvesByName()
    {
        var drop = DropPlugin();
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

    /// <summary>
    /// The manifest the template ships agrees with the plugin class: the loader cross-checks
    /// <c>name</c> and <c>version</c>, and refuses a tool <c>tools</c> does not declare.
    /// </summary>
    [Fact]
    public void Manifest_NamesThePluginItsVersionItsAssemblyAndItsTool()
    {
        var manifest = Path.Combine(Path.GetDirectoryName(typeof(SampleExtractorPlugin).Assembly.Location)!, ManifestFileName);
        using var document = System.Text.Json.JsonDocument.Parse(File.ReadAllText(manifest));
        var root = document.RootElement;
        var plugin = new SampleExtractorPlugin();

        Assert.Equal(plugin.Name, root.GetProperty("name").GetString());
        Assert.Equal(plugin.Version, root.GetProperty("version").GetString());
        Assert.Equal(PluginAssemblyName + ".dll", root.GetProperty("entryAssembly").GetString());
        Assert.Equal(["sample_extractor"], root.GetProperty("tools").EnumerateArray().Select(tool => tool.GetString()));
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("orkeonVersion").GetString()));
    }

    /// <summary>
    /// Since Orkeon 1.0.0 a plugin is a sub-folder with a <c>plugin.json</c>: an assembly lying flat
    /// in the plugin directory, or in a folder without manifest, is refused - not skipped.
    /// </summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Loader_RefusesAnAssemblyWithoutManifest(bool flat)
    {
        var drop = DropPlugin(withManifest: false, flat: flat);
        using var registry = RegistryFor(drop);
        var fileSystem = PluginFileSystem(drop, registry);

        Assert.Throws<PluginManifestException>(() =>
            new ServiceCollection().AddOrkeonPlugins(fileSystem, options => options.Directory = "/plugins"));

        var services = new ServiceCollection();
        services.AddOrkeonPlugins(fileSystem, options =>
        {
            options.Directory = "/plugins";
            options.ContinueOnError = true;
        });
        using var provider = services.BuildServiceProvider();
        var plugins = provider.GetRequiredService<IPluginRegistry>();
        Assert.Empty(plugins.Plugins);
        Assert.Single(plugins.Failures);
        Assert.Empty(provider.GetServices<IBaseTool>());
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
    /// (stock <c>PathValidator</c>) the entry assembly is denied - it refuses every <c>.dll</c> -
    /// so the loader, which reads the manifest, then counts the assembly it names as missing and
    /// refuses the plugin (before 1.0.0 the candidate was dropped silently). When this test starts
    /// failing, Orkeon lets a stock file system load a plugin and
    /// <see cref="PluginDirectoryPathValidator"/> can go.
    /// </summary>
    [Fact]
    public void Loader_ThroughTheStockPathValidator_RefusesThePlugin()
    {
        var drop = DropPlugin();
        using var registry = RegistryFor(drop);
        var security = new PathSecurityOptions();
        security.AdditionalAllowedDirectories.Add(drop);
        var stockFileSystem = new FileSystemService(
            registry,
            new PathValidator(security, NullLogger<PathValidator>.Instance),
            NullLogger<FileSystemService>.Instance);

        var refusal = Assert.Throws<PluginManifestException>(() =>
            new ServiceCollection().AddOrkeonPlugins(stockFileSystem, options => options.Directory = "/plugins"));

        Assert.Contains("SampleExtractor.Plugin.dll", refusal.Message, StringComparison.Ordinal);
        Assert.False(stockFileSystem.ResolveAndValidate("/plugins/SampleExtractor.Plugin/SampleExtractor.Plugin.dll", FileAccessRights.Read).IsAllowed);
    }
}
