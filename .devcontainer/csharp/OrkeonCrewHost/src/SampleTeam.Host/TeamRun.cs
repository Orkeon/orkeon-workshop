using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using Microsoft.Extensions.DependencyInjection;
using Orkeon.Application.Interfaces.Services;
using Orkeon.Constants.Protocol;
using Orkeon.Domain.Agent;
using SampleTeam.Host.Composition;
using SampleTeam.Host.Crews;
using SampleTeam.Host.Events;

namespace SampleTeam.Host;

/// <summary>One run of the team: load the crew, kick it off, report, and frame the event stream.</summary>
internal static class TeamRun
{
    /// <summary>Exit code: the run (or the validation) succeeded.</summary>
    public const int Success = 0;

    /// <summary>Exit code: bad usage, invalid <c>mounts.json</c>, unloadable crew.</summary>
    public const int ConfigurationError = 1;

    /// <summary>Exit code: the crew ran and failed.</summary>
    public const int CrewFailure = 2;

    /// <summary>Exit code: the run was cancelled.</summary>
    public const int Cancelled = 130;

    /// <summary>Runs (or only validates) the crew of <paramref name="host"/>.</summary>
    /// <param name="host">The built host.</param>
    /// <param name="options">Parsed command line.</param>
    /// <param name="stdout">Standard output: the crew's answer, or the protocol with <c>--events -</c>.</param>
    /// <param name="stderr">Diagnostics.</param>
    /// <param name="cancellationToken">Cancellation token (SIGINT).</param>
    /// <returns>The process exit code.</returns>
    public static async Task<int> ExecuteAsync(
        TeamHost host, HostOptions options, TextWriter stdout, TextWriter stderr, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(host);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(stdout);
        ArgumentNullException.ThrowIfNull(stderr);

        // Same framing as `orkeon run --events jsonl`: run.started, ..., run.finished.
        var events = host.Events.Enabled ? host.Services.GetRequiredService<RunEventWriter>() : null;
        var clock = Stopwatch.StartNew();
        events?.Emit(
            RunEventKinds.RunStarted,
            ("target", host.HasCrewDefinition ? TeamHost.CrewVirtualRoot : "code"),
            ("stream", false));

        var exitCode = await RunCrewAsync(host, options, stdout, stderr, cancellationToken).ConfigureAwait(false);

        if (events is not null)
        {
            var observer = host.Services.GetRequiredService<RunEventObserver>();
            events.Emit(
                RunEventKinds.RunFinished,
                ("success", exitCode == Success),
                ("exitCode", exitCode),
                ("tokens", observer.TokensUsed),
                ("durationMs", clock.ElapsedMilliseconds),
                ("promptTokens", observer.PromptTokens),
                ("completionTokens", observer.CompletionTokens));
        }

        return exitCode;
    }

    [SuppressMessage("Design", "CA1031", Justification = "Top-level fault barrier of the host: any failure while loading or running the crew is reported on stderr and converted to an exit code, so the process ends cleanly and run.finished is still emitted. Cancellation is handled before it and maps to 130.")]
    private static async Task<int> RunCrewAsync(
        TeamHost host, HostOptions options, TextWriter stdout, TextWriter stderr, CancellationToken cancellationToken)
    {
        var loaded = false;
        try
        {
            // The orchestrator, the crew factory and the repositories are scoped services.
            var scope = host.Services.CreateAsyncScope();
            await using (scope.ConfigureAwait(false))
            {
                var crew = await CrewLoader.LoadAsync(scope.ServiceProvider, host.HasCrewDefinition, cancellationToken).ConfigureAwait(false);
                loaded = true;

                if (options.Validate)
                {
                    var agents = await scope.ServiceProvider.GetRequiredService<IAgentRepository>()
                        .GetByIdsAsync(crew.Agents, cancellationToken).ConfigureAwait(false);
                    var tools = agents.SelectMany(a => a.Tools).Select(t => t.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count();
                    await stdout.WriteLineAsync(
                        $"VALIDATION OK: {(host.HasCrewDefinition ? TeamHost.CrewVirtualRoot : "code")} (agents={crew.Agents.Count}, tasks={crew.Tasks.Count}, tools resolved={tools})").ConfigureAwait(false);
                    return Success;
                }

                var input = options.Variables.Count > 0
                    ? CrewInput.WithStringVariables(options.InitialContext, options.Variables)
                    : CrewInput.Empty(options.InitialContext);

                var orchestrator = scope.ServiceProvider.GetRequiredService<ICrewOrchestrationService>();
                var output = await orchestrator.KickoffAsync(crew.Id, input, cancellationToken).ConfigureAwait(false);

                // The answer goes to stdout, unless stdout carries the protocol.
                var answers = host.Events.ToStdout ? stderr : stdout;
                await answers.WriteLineAsync(output.FinalOutput).ConfigureAwait(false);

                // KickoffAsync never throws: its fault barrier turns a failure into an output.
                if (!output.Succeeded)
                {
                    await stderr.WriteLineAsync($"ERROR: {output.Error ?? "the crew failed"}").ConfigureAwait(false);
                    return CrewFailure;
                }

                return Success;
            }
        }
        catch (OperationCanceledException)
        {
            return Cancelled;
        }
        catch (Exception ex)
        {
            await stderr.WriteLineAsync($"{(options.Validate ? "VALIDATION FAILED" : "ERROR")}: {ex.Message}").ConfigureAwait(false);
            return loaded ? CrewFailure : ConfigurationError;
        }
    }
}
