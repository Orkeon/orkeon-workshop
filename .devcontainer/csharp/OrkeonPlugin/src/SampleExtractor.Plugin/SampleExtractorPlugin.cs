using Microsoft.Extensions.DependencyInjection;
using Orkeon.Domain.Tools;
using Orkeon.Plugins;
using SampleExtractor.Tool;

namespace SampleExtractor.Plugin;

/// <summary>
/// Plugin entry point: contributes the <c>sample_extractor</c> tool to the host container.
/// The loader (<c>AddOrkeonPlugins</c>) finds every non-abstract class implementing
/// <see cref="IOrkeonPlugin"/> in a plugin assembly, instantiates it through its public
/// parameterless constructor and calls <see cref="ConfigureServices"/> once, BEFORE the
/// service provider is built.
/// </summary>
/// <remarks>
/// <para>
/// The tool is registered under <see cref="IBaseTool"/>: that is the service a DI-backed
/// <c>IToolRegistry</c> (<c>ServiceProviderToolRegistry</c> in <c>Orkeon.Hosting</c>)
/// enumerates, so a YAML crew can list the tool by its contract name. A name belongs to one
/// tool: a plugin tool named like a built-in or another plugin's tool is refused.
/// </para>
/// <para>
/// Trust boundary: a plugin runs with the full privileges of the host process. There is no
/// sandbox in Orkeon v1 - only drop this assembly in a plugin folder you control.
/// </para>
/// </remarks>
public sealed class SampleExtractorPlugin : IOrkeonPlugin
{
    /// <inheritdoc />
    public string Name => "orkeon-harness.sample-extractor";

    /// <inheritdoc />
    public string Version => "0.1.0";

    /// <inheritdoc />
    public void ConfigureServices(IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        // One IBaseTool registration per tool (not TryAddSingleton<IBaseTool, ...>: TryAdd keys
        // on the service type, a second tool would be silently ignored). The constructor's
        // IFileSystemService and ILogger are resolved from the HOST container.
        services.AddSingleton<IBaseTool, SampleExtractorTool>();
    }
}
