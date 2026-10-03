using Microsoft.Extensions.DependencyInjection;
using Orkeon.Domain.Common;
using Orkeon.Domain.FileSystem;
using Orkeon.Domain.Tools;
using SampleExtractor.Plugin.Tests.Doubles;
using SampleExtractor.Tool;

namespace SampleExtractor.Plugin.Tests;

/// <summary>
/// The plugin seen from the host's side, without the loader: what
/// <see cref="SampleExtractorPlugin.ConfigureServices"/> puts in the container.
/// </summary>
public class SampleExtractorPluginTests
{
    private static ServiceProvider BuildHost()
    {
        var services = new ServiceCollection();
        services.AddSingleton<IFileSystemService>(
            new FakeFileSystemService().AddMount("/workspace", FileAccessRights.ReadOnly));
        new SampleExtractorPlugin().ConfigureServices(services);
        return services.BuildServiceProvider();
    }

    [Fact]
    public void Plugin_ExposesAStableNameAndAVersion()
    {
        var plugin = new SampleExtractorPlugin();

        Assert.Equal("orkeon-harness.sample-extractor", plugin.Name);
        Assert.False(string.IsNullOrWhiteSpace(plugin.Version));
    }

    [Fact]
    public void ConfigureServices_RegistersTheToolUnderIBaseTool()
    {
        using var provider = BuildHost();

        var tool = Assert.Single(provider.GetServices<IBaseTool>());

        Assert.IsType<SampleExtractorTool>(tool);
        Assert.Equal("sample_extractor", tool.Name);
    }

    [Fact]
    public void RegisteredTool_IsAnITool_SoStrictToolsAcceptsIt()
    {
        using var provider = BuildHost();

        // CrewFactory resolves a YAML tool name with `tool is ITool`; an IBaseTool-only
        // registration would be listed by --list-tools and still refused at crew load.
        Assert.All(provider.GetServices<IBaseTool>(), tool => Assert.IsType<ITool>(tool, exactMatch: false));
    }

    [Fact]
    public void ConfigureServices_RejectsANullCollection()
    {
        Assert.Throws<ArgumentNullException>(() => new SampleExtractorPlugin().ConfigureServices(null!));
    }
}
