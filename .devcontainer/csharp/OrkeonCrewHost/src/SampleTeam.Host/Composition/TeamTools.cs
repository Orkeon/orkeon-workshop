using Microsoft.Extensions.DependencyInjection;
using Orkeon.Domain.Tools;
using Orkeon.Infrastructure.DependencyInjection;
using Orkeon.Tools.FileSystem.DependencyInjection;
using SampleExtractor.Tool;

namespace SampleTeam.Host.Composition;

/// <summary>
/// The tools this team can use: the built-in suites it needs, then its own C# tools.
/// This is the one place to edit when the team gains a tool.
/// </summary>
internal static class TeamTools
{
    /// <summary>Registers the tool suites and the team's tools as <see cref="IBaseTool"/>.</summary>
    /// <param name="services">The service collection.</param>
    /// <returns><paramref name="services"/>.</returns>
    public static IServiceCollection AddTeamTools(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        // Built-in suites (Orkeon.Tools.FileSystem): file_read, file_write, directory_read,
        // directory_search, count_pattern. Add AddOrkeonDataTools(), AddOrkeonWebTools(),
        // AddOrkeonCodeTools() with their packages when needed; the e-mail family, email_parser
        // included, comes from AddOrkeonEmailTools(configuration) (Orkeon.Tools.Email).
        services.AddOrkeonFileSystemTools();

        // human_input with the unattended AutoApprove provider, as the runner registers it:
        // a task declared humanInput then never blocks a batch run.
        services.AddOrkeonHumanInput();

        // The team's own tools: one IBaseTool registration per tool (never TryAddSingleton,
        // which keys on the service type and would keep only the first tool). A name
        // belongs to one tool: a name already held, a built-in's included, is refused.
        services.AddSingleton<IBaseTool, SampleExtractorTool>();

        return services;
    }
}
