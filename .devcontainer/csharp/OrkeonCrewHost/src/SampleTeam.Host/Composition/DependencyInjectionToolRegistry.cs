using Orkeon.Domain.Tools;

namespace SampleTeam.Host.Composition;

/// <summary>
/// Resolves the tool names a crew lists to the <see cref="IBaseTool"/> instances registered
/// in DI. At rc.4 <c>AddOrkeonInfrastructure</c> registered an EMPTY in-memory registry that
/// never saw those registrations, and a host had to replace it (the runner did, with the
/// <c>ServiceProviderToolRegistry</c> of <c>Orkeon.Hosting</c>, which this class mirrors). On
/// <c>main</c> (77ac8a9) its default, <c>Orkeon.Infrastructure.Tools.ToolRegistry</c>, is seeded
/// from every <see cref="IBaseTool"/> of the container and the runners use it; this class,
/// registered after it, applies the same rules to names.
/// </summary>
/// <remarks>
/// Names are compared case-insensitively. Two tools with the same name are a configuration
/// error, reported with both type names instead of a bare duplicate-key exception. As in
/// Orkeon's registries, a name belongs to the first tool registered under it: registering
/// another instance under a held name returns <see langword="false"/> and keeps the first.
/// </remarks>
internal sealed class DependencyInjectionToolRegistry : IToolRegistry
{
    private readonly Dictionary<string, IBaseTool> _tools = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Initializes the registry from the DI-provided tool collection.</summary>
    /// <param name="tools">Every <see cref="IBaseTool"/> registered in the container.</param>
    public DependencyInjectionToolRegistry(IEnumerable<IBaseTool> tools)
    {
        ArgumentNullException.ThrowIfNull(tools);

        foreach (var tool in tools)
        {
            if (!_tools.TryAdd(tool.Name, tool))
            {
                throw new InvalidOperationException(
                    $"Two tools are registered under the name '{tool.Name}': {_tools[tool.Name].GetType().Name} and {tool.GetType().Name}.");
            }
        }
    }

    /// <inheritdoc />
    public Task<bool> RegisterToolAsync(IBaseTool tool)
    {
        ArgumentNullException.ThrowIfNull(tool);
        return Task.FromResult(_tools.TryAdd(tool.Name, tool) || ReferenceEquals(_tools[tool.Name], tool));
    }

    /// <inheritdoc />
    public Task<bool> UnregisterToolAsync(string toolId) => Task.FromResult(_tools.Remove(toolId));

    /// <inheritdoc />
    public Task<IBaseTool?> GetToolAsync(string toolId) => Task.FromResult(_tools.GetValueOrDefault(toolId));

    /// <inheritdoc />
    public Task<IBaseTool?> GetToolByNameAsync(string name) => Task.FromResult(_tools.GetValueOrDefault(name));

    /// <inheritdoc />
    public Task<IReadOnlyList<IBaseTool>> GetAllToolsAsync() =>
        Task.FromResult<IReadOnlyList<IBaseTool>>([.. _tools.Values]);

    /// <inheritdoc />
    public Task<bool> IsRegisteredAsync(string toolId) => Task.FromResult(_tools.ContainsKey(toolId));

    /// <inheritdoc />
    public Task ClearAsync()
    {
        _tools.Clear();
        return Task.CompletedTask;
    }
}
