using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Orkeon.Domain.Tools;
using Orkeon.Plugins;
using OrkeonHarnessRun.Plugins;

namespace OrkeonHarnessRun.Tests.Plugins;

/// <summary>Where the plugin directory comes from, and what an empty one yields.</summary>
public sealed class PluginBootstrapTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "orkeon-harness-run-tests-" + Guid.NewGuid().ToString("N"));

    public PluginBootstrapTests() => Directory.CreateDirectory(_root);

    public void Dispose()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    private static IConfiguration Configuration(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value)))
            .Build();

    [Fact]
    public void Resolve_PrefersTheExplicitDirectory()
    {
        var configuration = Configuration(("Orkeon:FileSystem:Mounts:0", $"{_root}:/plugins:ro"));

        var resolved = PluginBootstrap.ResolvePhysicalDirectory(configuration, "/opt/explicit", "/opt/from-env", "/plugins", TextWriter.Null);

        Assert.Equal("/opt/explicit", resolved);
    }

    [Fact]
    public void Resolve_FallsBackToTheEnvironmentThenToTheMount()
    {
        var configuration = Configuration(
            ("Orkeon:FileSystem:Mounts:0", "/data/in:/workspace:ro"),
            ("Orkeon:FileSystem:Mounts:1", $"{_root}:/plugins:ro"));

        Assert.Equal("/opt/from-env", PluginBootstrap.ResolvePhysicalDirectory(configuration, null, "/opt/from-env", "/plugins", TextWriter.Null));
        Assert.Equal(_root, PluginBootstrap.ResolvePhysicalDirectory(configuration, null, null, "/plugins", TextWriter.Null));
    }

    [Fact]
    public void Resolve_FindsAPluginRootNestedUnderAMount()
    {
        var configuration = Configuration(("Orkeon:FileSystem:Mounts:0", $"{_root}:/library:ro"));

        var resolved = PluginBootstrap.ResolvePhysicalDirectory(configuration, null, null, "/library/plugins", TextWriter.Null);

        Assert.Equal(Path.Combine(_root, "plugins"), resolved);
    }

    [Fact]
    public void Resolve_ReturnsNullWhenNothingProvidesThePluginRoot()
    {
        var configuration = Configuration(
            ("Orkeon:FileSystem:Mounts:0", "/data/in:/workspace:ro"),
            ("Orkeon:FileSystem:Mounts:1", ""),
            ("Orkeon:FileSystem:Mounts:2", "not a mount string"));

        Assert.Null(PluginBootstrap.ResolvePhysicalDirectory(configuration, null, null, "/plugins", TextWriter.Null));
    }

    [Theory]
    [InlineData(":/plugins:rw")]
    [InlineData(":/plugins:rwnd")]
    [InlineData(":/plugins:ro;X:rw")]
    public void Resolve_SkipsAMountItsAgentsCanWriteTo_AndSaysSo(string mount)
    {
        var configuration = Configuration(("Orkeon:FileSystem:Mounts:0", _root + mount));
        using var diagnostics = new StringWriter();

        Assert.Null(PluginBootstrap.ResolvePhysicalDirectory(configuration, null, null, "/plugins", diagnostics));
        Assert.Contains($"plugins NOT loaded from /plugins: its mount ({_root}) is writable", diagnostics.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void Resolve_JudgesTheRightsOfANestedPluginRoot()
    {
        using var diagnostics = new StringWriter();

        // A writable sub-path elsewhere in the mount leaves the plugin folder read-only.
        Assert.Equal(
            Path.Combine(_root, "plugins"),
            PluginBootstrap.ResolvePhysicalDirectory(
                Configuration(("Orkeon:FileSystem:Mounts:0", $"{_root}:/library:ro;docs:rw")), null, null, "/library/plugins", diagnostics));
        Assert.Null(PluginBootstrap.ResolvePhysicalDirectory(
            Configuration(("Orkeon:FileSystem:Mounts:0", $"{_root}:/library:ro;plugins:rw")), null, null, "/library/plugins", diagnostics));
        Assert.Null(PluginBootstrap.ResolvePhysicalDirectory(
            Configuration(("Orkeon:FileSystem:Mounts:0", $"{_root}:/library:ro;plugins/X:rw")), null, null, "/library/plugins", diagnostics));
        Assert.Null(PluginBootstrap.ResolvePhysicalDirectory(
            Configuration(("Orkeon:FileSystem:Mounts:0", $"{_root}:/library:rw")), null, null, "/library/plugins", diagnostics));
    }

    [Fact]
    public void AddPlugins_LoadsNothingFromAWritableMount()
    {
        File.WriteAllText(Path.Combine(_root, "NotAnAssembly.dll"), "this is not a managed assembly");
        var services = new ServiceCollection();
        using var diagnostics = new StringWriter();

        var registry = PluginBootstrap.AddPlugins(
            services, Configuration(("Orkeon:FileSystem:Mounts:0", $"{_root}:/plugins:rw")), null, null, diagnostics);

        // Nothing was even read: a load would have failed on the file above.
        Assert.Null(registry);
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IPluginRegistry));
        Assert.Contains("plugins NOT loaded from /plugins", diagnostics.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void AddPlugins_DoesNothingWithoutAPluginDirectory()
    {
        var services = new ServiceCollection();
        using var diagnostics = new StringWriter();

        var registry = PluginBootstrap.AddPlugins(services, Configuration(), null, null, diagnostics);

        Assert.Null(registry);
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IPluginRegistry));
    }

    [Fact]
    public void AddPlugins_OverAnEmptyDirectoryRegistersAnEmptyRegistry()
    {
        var services = new ServiceCollection();
        using var diagnostics = new StringWriter();

        var registry = PluginBootstrap.AddPlugins(services, Configuration(), _root, null, diagnostics);

        Assert.NotNull(registry);
        Assert.Empty(registry.Plugins);
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IBaseTool));
        Assert.Contains("no plugin found under /plugins", diagnostics.ToString());
    }

    [Fact]
    public void AddPlugins_RefusesADesignatedDirectoryThatDoesNotExist()
    {
        using var diagnostics = new StringWriter();

        Assert.Throws<DirectoryNotFoundException>(() => PluginBootstrap.AddPlugins(
            new ServiceCollection(), Configuration(), Path.Combine(_root, "missing"), null, diagnostics));
    }

    [Fact]
    public void AddPlugins_RecordsAFileThatIsNotAnAssemblyWhenToldToContinue()
    {
        File.WriteAllText(Path.Combine(_root, "NotAnAssembly.dll"), "this is not a managed assembly");
        var services = new ServiceCollection();
        using var diagnostics = new StringWriter();

        var registry = PluginBootstrap.AddPlugins(
            services, Configuration(("Plugins:ContinueOnError", "true")), _root, null, diagnostics);

        Assert.NotNull(registry);
        Assert.Empty(registry.Plugins);
        Assert.Single(registry.Failures);
        Assert.Contains("plugin NOT loaded: /plugins/NotAnAssembly.dll", diagnostics.ToString());
    }

    [Fact]
    public void AddPlugins_FailsFastOnAFileThatIsNotAnAssemblyByDefault()
    {
        File.WriteAllText(Path.Combine(_root, "NotAnAssembly.dll"), "this is not a managed assembly");
        using var diagnostics = new StringWriter();

        Assert.Throws<PluginLoadException>(() => PluginBootstrap.AddPlugins(
            new ServiceCollection(), Configuration(), _root, null, diagnostics));
    }

    [Fact]
    public void Validator_AdmitsAssembliesInsideThePluginDirectoryOnly()
    {
        var validator = new PluginDirectoryPathValidator(_root);

        Assert.True(validator.ValidatePath(Path.Combine(_root, "X.dll")).IsAllowed);
        Assert.True(validator.ValidatePath(Path.Combine(_root, "X", "X.dll")).IsAllowed);
        Assert.True(validator.ValidatePath(_root).IsAllowed);
        Assert.False(validator.ValidatePath(Path.Combine(_root, "..", "elsewhere.dll")).IsAllowed);
        Assert.False(validator.ValidatePath(_root + "-sibling/X.dll").IsAllowed);
        Assert.False(validator.ValidatePath(" ").IsAllowed);
    }
}
