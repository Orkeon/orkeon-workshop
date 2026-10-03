using Microsoft.Extensions.DependencyInjection;
using Orkeon.Application.Interfaces;
using Orkeon.Domain.Agent;
using Orkeon.Domain.Common;
using Orkeon.Domain.Crew;
using Orkeon.Domain.Task;
using Orkeon.Domain.Tools;
using SampleTeam.Host.Composition;
using DomainCrew = Orkeon.Domain.Crew.Crew;

namespace SampleTeam.Host.Crews;

/// <summary>
/// Produces the crew to run: the YAML definition under <c>crew/</c> when the team has one,
/// otherwise a crew built in code with the fluent builders.
/// </summary>
internal static class CrewLoader
{
    private const string SampleToolName = "sample_extractor";

    /// <summary>Loads or builds the crew. Never calls the LLM.</summary>
    /// <param name="services">A SCOPED provider: the repositories and the factory are scoped.</param>
    /// <param name="hasCrewDefinition">Whether <c>/crew</c> holds a YAML crew.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The crew, already stored in the repositories the orchestrator reads.</returns>
    public static Task<DomainCrew> LoadAsync(IServiceProvider services, bool hasCrewDefinition, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(services);

        // The YAML loader reads through the VFS: the path is VIRTUAL (the host mounts the
        // crew directory read-only under /crew), never a physical one.
        return hasCrewDefinition
            ? services.GetRequiredService<ICrewFactory>().CreateFromDirectoryAsync(TeamHost.CrewVirtualRoot, cancellationToken)
            : BuildInCodeAsync(services, cancellationToken);
    }

    /// <summary>
    /// The C# form of the same crew, for a team that needs what YAML cannot express
    /// (custom orchestration, StateGraph, flows...). There is no Deliverable(...) on the
    /// builders: call task.SetDeliverable(...) before the kickoff, or write from the host with
    /// the task outputs. OutputFile is stored and never written; OutputJson validates the
    /// answer and writes nothing.
    /// </summary>
    private static async Task<DomainCrew> BuildInCodeAsync(IServiceProvider services, CancellationToken cancellationToken)
    {
        var registry = services.GetRequiredService<IToolRegistry>();
        var extractor = await registry.GetToolByNameAsync(SampleToolName).ConfigureAwait(false)
            ?? throw new InvalidOperationException($"Tool '{SampleToolName}' is not registered.");

        var agent = new AgentBuilder()
            .Role("Extractor")
            .Goal("Extract the key/value pairs of the notes file")
            .Backstory("You read structured notes with the sample_extractor tool and report exactly what it returns.")
            .WithTool(extractor)
            .AllowDelegation(false)
            .MaxIterations(3)
            .Build();

        var task = new CrewTaskBuilder()
            .Description("Call sample_extractor with path \"/workspace/notes.txt\" and list every key and value it returns, one per line, as \"key = value\".")
            .ExpectedOutput("One line per extracted entry, formatted as key = value")
            .AssignTo(agent)
            .Build();

        var crew = new CrewBuilder()
            .Goal("Summarise the structured notes of the workspace")
            .Sequential()
            .WithAgent(agent)
            .WithTask(task)
            .Build();

        // The orchestrator resolves a crew by id from the repositories: persist all three.
        await services.GetRequiredService<IAgentRepository>().AddAsync(agent, cancellationToken).ConfigureAwait(false);
        await services.GetRequiredService<ITaskRepository>().AddAsync(task, cancellationToken).ConfigureAwait(false);
        await services.GetRequiredService<ICrewRepository>().AddAsync(crew, cancellationToken).ConfigureAwait(false);
        return crew;
    }
}
