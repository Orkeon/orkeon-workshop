using Orkeon.Application.Crew;
using Orkeon.Application.Interfaces.Ports;
using Orkeon.Constants.Protocol;
using Orkeon.Domain.Graph;

namespace SampleTeam.Host.Events;

/// <summary>
/// Projects a crew run onto the event stream: task starts and completions from
/// <see cref="ICrewExecutionHook"/> (the supported observation point of a C# host - domain
/// events are not dispatched during a run), the token meter from
/// <see cref="ILlmUsageSink"/>, the nodes a graph enters from <see cref="IGraphNodeObserver"/> and
/// a profile's switch to its fallback from <see cref="ILlmFallbackObserver"/>.
/// </summary>
/// <remarks>
/// It composes, it does not replace: <c>ICrewExecutionHook</c> is a single service and the
/// runner already registers <c>AutoSummaryWriter</c> on it whenever an <c>/output:rw</c>
/// mount exists. The previously registered hook is passed as <c>inner</c> and receives
/// every callback, so observing a run never costs it its AUTO_SUMMARY.md.
/// </remarks>
internal sealed class RunEventObserver : ICrewExecutionHook, ILlmUsageSink, IGraphNodeObserver, ILlmFallbackObserver
{
    private readonly RunEventWriter _events;
    private readonly ICrewExecutionHook? _inner;
    private readonly Lock _gate = new();
    private long _promptTokens;
    private long _completionTokens;
    private readonly Dictionary<string, bool> _lastAttemptCapped = [];
    private readonly Dictionary<string, bool> _lastAttemptMissingDeliverable = [];

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

    /// <summary>Tasks whose last attempt ended on the iteration cap, for the closing event.</summary>
    public int CappedTasks
    {
        get { lock (_gate) { return _lastAttemptCapped.Values.Count(capped => capped); } }
    }

    /// <summary>Tasks whose last attempt succeeded without writing its <c>tool_call</c> deliverable, for the closing event.</summary>
    public int MissingDeliverables
    {
        get { lock (_gate) { return _lastAttemptMissingDeliverable.Values.Count(missing => missing); } }
    }

    /// <inheritdoc />
    public void NodeEntered(GraphNodeEntered entered)
    {
        ArgumentNullException.ThrowIfNull(entered);

        _events.Emit(
            RunEventKinds.GraphNodeEntered,
            ("node", entered.Node),
            ("visit", entered.Visit),
            ("task", entered.Task),
            ("graph", entered.Graph));
    }

    /// <inheritdoc />
    public void FallbackTaken(string profile, string fromProfile, string toProfile, string reason) =>
        _events.Emit(
            RunEventKinds.LlmFallback,
            ("profile", profile),
            ("from", fromProfile),
            ("to", toProfile),
            ("reason", reason));

    /// <inheritdoc />
    public Task OnHumanInputAsync(HumanInputNotice notice, CancellationToken ct) =>
        _inner?.OnHumanInputAsync(notice, ct) ?? Task.CompletedTask;

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

        lock (_gate)
        {
            _lastAttemptCapped[snapshot.TaskId] = snapshot.EndedOnIterationCap;
            // Only a task that succeeded counts: a failed one is never flagged.
            _lastAttemptMissingDeliverable[snapshot.TaskId] = snapshot.Success && snapshot.DeliverableMissing;
        }

        _events.Emit(
            RunEventKinds.TaskCompleted,
            new RunEventScope { AgentId = snapshot.AgentRole },
            ("taskId", snapshot.TaskId),
            ("agentRole", snapshot.AgentRole),
            ("success", snapshot.Success),
            ("skipped", snapshot.Skipped),
            ("resumed", snapshot.Resumed),
            ("attempt", snapshot.Attempt),
            ("durationMs", (long)snapshot.Duration.TotalMilliseconds),
            ("tokens", snapshot.TokensUsed),
            ("toolCalls", snapshot.ToolCallCount),
            // The decision fields, as Orkeon writes them (Orkeon.Hosting, Runs/RunEventObserver.cs):
            // the booleans always, skipReason and decision (the answers as compact JSON, a string)
            // only when set; then the two flags of a task that ended without its result.
            ("skipReason", snapshot.SkipReason),
            ("defaulted", snapshot.Defaulted),
            ("isDecision", snapshot.IsDecision),
            ("decision", snapshot.DecisionAnswers),
            ("endedOnIterationCap", snapshot.EndedOnIterationCap),
            ("deliverableMissing", snapshot.DeliverableMissing));

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
            ("code", isPartial.Status == CrewHookStatus.Canceled ? RunEventErrorCodes.CrewCancelled : RunEventErrorCodes.CrewFailed),
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
