using Orkeon.Application.Crew;
using Orkeon.Application.Interfaces.Ports;
using Orkeon.Constants.Protocol;

namespace OrkeonHarnessRun.Events;

/// <summary>
/// Projects a crew run onto the event stream: task starts and completions from
/// <see cref="ICrewExecutionHook"/> (the supported observation point of a C# host - domain
/// events are not dispatched during a run) and the token meter from
/// <see cref="ILlmUsageSink"/>.
/// </summary>
/// <remarks>
/// It composes, it does not replace: <c>ICrewExecutionHook</c> is a single service and the
/// runner already registers <c>AutoSummaryWriter</c> on it whenever an <c>/output:rw</c>
/// mount exists. The previously registered hook is passed as <c>inner</c> and receives
/// every callback, so observing a run never costs it its AUTO_SUMMARY.md.
/// </remarks>
internal sealed class RunEventObserver : ICrewExecutionHook, ILlmUsageSink
{
    private readonly RunEventWriter _events;
    private readonly ICrewExecutionHook? _inner;
    private readonly Lock _gate = new();
    private long _promptTokens;
    private long _completionTokens;

    /// <summary>Builds the observer over the stream and the hook it must not displace.</summary>
    /// <param name="events">The event stream.</param>
    /// <param name="inner">The hook registered before this one, or null.</param>
    public RunEventObserver(RunEventWriter events, ICrewExecutionHook? inner)
    {
        ArgumentNullException.ThrowIfNull(events);
        _events = events;
        _inner = inner;
    }

    /// <summary>Cumulative prompt-side tokens seen on the meter.</summary>
    public long PromptTokens
    {
        get { lock (_gate) { return _promptTokens; } }
    }

    /// <summary>Cumulative completion-side tokens seen on the meter.</summary>
    public long CompletionTokens
    {
        get { lock (_gate) { return _completionTokens; } }
    }

    /// <summary>Cumulative tokens seen on the meter (prompt + completion).</summary>
    public long TokensUsed
    {
        get { lock (_gate) { return _promptTokens + _completionTokens; } }
    }

    /// <inheritdoc />
    public async Task OnTaskStartedAsync(TaskStartSnapshot snapshot, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        _events.Emit(
            RunEventKinds.TaskStarted,
            new RunEventScope { AgentId = snapshot.AgentRole },
            ("taskId", snapshot.TaskId),
            ("agentRole", snapshot.AgentRole));

        if (_inner is not null)
            await _inner.OnTaskStartedAsync(snapshot, ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task OnTaskCompletedAsync(TaskExecutionSnapshot snapshot, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        _events.Emit(
            RunEventKinds.TaskCompleted,
            new RunEventScope { AgentId = snapshot.AgentRole },
            ("taskId", snapshot.TaskId),
            ("agentRole", snapshot.AgentRole),
            ("success", snapshot.Success),
            ("skipped", snapshot.Skipped),
            ("durationMs", (long)snapshot.Duration.TotalMilliseconds),
            ("tokens", snapshot.TokensUsed),
            ("toolCalls", snapshot.ToolCallCount));

        if (_inner is not null)
            await _inner.OnTaskCompletedAsync(snapshot, ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task OnCrewCompletedAsync(CrewExecutionSnapshot snapshot, CancellationToken ct) =>
        _inner?.OnCrewCompletedAsync(snapshot, ct) ?? Task.CompletedTask;

    /// <inheritdoc />
    public Task OnCrewFailedAsync(CrewExecutionSnapshot isPartial, Exception? ex, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(isPartial);

        // A run that stops - cancelled or failed, in any mode - says so on the wire before
        // run.finished.
        _events.Emit(
            RunEventKinds.Error,
            new RunEventScope { CrewId = isPartial.CrewId },
            ("code", isPartial.Status == CrewHookStatus.Canceled ? "crew_cancelled" : "crew_failed"),
            ("message", isPartial.FailureReason ?? ex?.Message ?? string.Empty),
            ("recoverable", false));

        return _inner?.OnCrewFailedAsync(isPartial, ex, ct) ?? Task.CompletedTask;
    }

    /// <inheritdoc />
    public void Record(CostUsageEvent usage)
    {
        ArgumentNullException.ThrowIfNull(usage);

        long total;
        lock (_gate)
        {
            _promptTokens += usage.PromptTokens;
            _completionTokens += usage.CompletionTokens;
            total = _promptTokens + _completionTokens;
        }

        // `tokens` is cumulative. There is no price field: the framework has no price table.
        _events.Emit(
            RunEventKinds.CostUpdated,
            new RunEventScope { CrewId = usage.CrewId, AgentId = usage.AgentId },
            ("tokens", total),
            ("model", Blank(usage.Model)),
            ("provider", Blank(usage.Provider)));
    }

    private static string? Blank(string value) => string.IsNullOrEmpty(value) ? null : value;
}
