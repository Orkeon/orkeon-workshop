using Orkeon.Domain.Common;
using Orkeon.Domain.Tools;

namespace SampleTeam.Host.Composition;

/// <summary>
/// Resolves the tool names a crew lists to the <see cref="IBaseTool"/> instances registered
/// in DI. <c>AddOrkeonInfrastructure</c> registers an EMPTY in-memory registry that never
/// sees those registrations; a host must replace it (the runner does it with
/// <c>ServiceProviderToolRegistry</c> from <c>Orkeon.Hosting</c>, which this class mirrors
/// so the host does not need that package).
/// </summary>
/// <remarks>
/// Names are compared case-insensitively. Two tools with the same name are a configuration
/// error, reported with both type names instead of a bare duplicate-key exception.
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
        _tools[tool.Name] = tool;
        return Task.FromResult(true);
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
    public Task<IReadOnlyList<IBaseTool>> GetToolsByTagsAsync(params string[] tags) =>
        Task.FromResult<IReadOnlyList<IBaseTool>>([]);

    /// <inheritdoc />
    public Task<bool> IsRegisteredAsync(string toolId) => Task.FromResult(_tools.ContainsKey(toolId));

    /// <inheritdoc />
    public Task<IReadOnlyList<IBaseTool>> GetToolsByCapabilityAsync(string capability) =>
        Task.FromResult<IReadOnlyList<IBaseTool>>([]);

    /// <inheritdoc />
    public Task<IReadOnlyList<IBaseTool>> GetToolsAsync(IEnumerable<ITool> tools)
    {
        ArgumentNullException.ThrowIfNull(tools);
        var names = tools.Select(t => t.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return Task.FromResult<IReadOnlyList<IBaseTool>>([.. _tools.Values.Where(t => names.Contains(t.Name))]);
    }

    /// <inheritdoc />
    public Task ClearAsync()
    {
        _tools.Clear();
        return Task.CompletedTask;
    }
}
