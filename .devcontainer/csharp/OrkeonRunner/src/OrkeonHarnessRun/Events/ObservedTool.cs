using System.Diagnostics;
using Orkeon.Application.Interfaces.Ports;
using Orkeon.Constants.Protocol;
using Orkeon.Domain.Common;
using Orkeon.Domain.Tools;
using ProtocolToolCallRequest = Orkeon.Domain.Tools.Protocol.ToolCallRequest;
using ProtocolToolCallResponse = Orkeon.Domain.Tools.Protocol.ToolCallResponse;
using ProtocolToolSchema = Orkeon.Domain.Tools.Protocol.ToolSchema;

namespace OrkeonHarnessRun.Events;

/// <summary>
/// Wraps a tool so each call becomes a <c>tool.called</c> / <c>tool.returned</c> pair on
/// the event stream, correlated, the return emitted even when the tool throws.
/// </summary>
/// <remarks>
/// The decorator implements <see cref="ITool"/>, not just <see cref="IBaseTool"/>: the crew
/// factory attaches a resolved tool with <c>tool is ITool</c>, so a base-only wrapper would
/// leave every agent without tools. Argument VALUES never reach the stream - a call can
/// carry a whole file - only a digest of the argument names.
/// </remarks>
internal sealed class ObservedTool : ITool, IDisposable
{
    private const string DelegateToolName = "delegate_work_to_coworker";
    private const string SpawnToolName = "spawn_agent";
    private const int SummarizedArguments = 6;

    private readonly IBaseTool _inner;
    private readonly RunEventWriter _events;

    /// <summary>Wraps <paramref name="inner"/>.</summary>
    /// <param name="inner">The tool to observe.</param>
    /// <param name="events">The event stream.</param>
    public ObservedTool(IBaseTool inner, RunEventWriter events)
    {
        ArgumentNullException.ThrowIfNull(inner);
        ArgumentNullException.ThrowIfNull(events);
        _inner = inner;
        _events = events;
    }

    /// <inheritdoc />
    public string Name => _inner.Name;

    /// <inheritdoc />
    public string Description => _inner.Description;

    /// <inheritdoc />
    public ProtocolToolSchema Schema => _inner.Schema;

    /// <inheritdoc />
    public ToolAccess Access => _inner.Access;

    /// <inheritdoc />
    public async Task<ProtocolToolCallResponse> CallAsync(ProtocolToolCallRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var correlationId = Announce(request.Parameters);
        var stopwatch = Stopwatch.StartNew();
        try
        {
            var response = await _inner.CallAsync(request, cancellationToken).ConfigureAwait(false);
            Report(correlationId, response?.Success ?? false, stopwatch);
            return response!;
        }
        catch (Exception) when (ReportFailure(correlationId, stopwatch))
        {
            throw; // the filter never matches; it only lets the event out before unwinding
        }
    }

    /// <inheritdoc />
    public async Task<ToolResult> ExecuteAsync(string input, CancellationToken cancellationToken = default)
    {
        var correlationId = Announce(arguments: null);
        var stopwatch = Stopwatch.StartNew();
        try
        {
            var result = await _inner.ExecuteAsync(input, cancellationToken).ConfigureAwait(false);
            Report(correlationId, result?.Success ?? false, stopwatch);
            return result!;
        }
        catch (Exception) when (ReportFailure(correlationId, stopwatch))
        {
            throw;
        }
    }

    /// <inheritdoc />
    public bool ValidateInput(string input) => _inner.ValidateInput(input);

    /// <inheritdoc />
    public void Dispose() => (_inner as IDisposable)?.Dispose();

    private string Announce(Dictionary<string, object?>? arguments)
    {
        var correlationId = Guid.NewGuid().ToString("N");
        var scope = new RunEventScope { CorrelationId = correlationId };

        switch (Name)
        {
            case DelegateToolName:
                _events.Emit(
                    RunEventKinds.DelegationStarted, scope,
                    ("toRole", Argument(arguments, "coworker_role") ?? Argument(arguments, "coworkerRole")));
                break;

            case SpawnToolName:
                _events.Emit(
                    RunEventKinds.AgentSpawned, scope,
                    ("role", Argument(arguments, "role")),
                    ("reason", Argument(arguments, "goal")));
                break;

            default:
                _events.Emit(
                    RunEventKinds.ToolCalled, scope,
                    ("toolName", Name),
                    ("argsSummary", Summarize(arguments)));
                break;
        }

        return correlationId;
    }

    private void Report(string correlationId, bool success, Stopwatch stopwatch)
    {
        stopwatch.Stop();
        _events.Emit(
            RunEventKinds.ToolReturned,
            new RunEventScope { CorrelationId = correlationId },
            ("toolName", Name),
            ("success", success),
            ("durationMs", stopwatch.ElapsedMilliseconds));
    }

    private bool ReportFailure(string correlationId, Stopwatch stopwatch)
    {
        // A tool that throws still returned: reported from an exception filter so the event
        // goes out before the stack unwinds, and false so the exception travels untouched.
        Report(correlationId, success: false, stopwatch);
        return false;
    }

    private static string? Argument(Dictionary<string, object?>? arguments, string name) =>
        arguments is not null && arguments.TryGetValue(name, out var value) ? value?.ToString() : null;

    private static string? Summarize(Dictionary<string, object?>? arguments)
    {
        if (arguments is null || arguments.Count == 0)
            return null;

        var summary = string.Join(", ", arguments.Keys.Take(SummarizedArguments));
        return arguments.Count > SummarizedArguments ? summary + ", ..." : summary;
    }
}

/// <summary>
/// Gives the per-agent tools that are built with <c>new</c> rather than through DI (the
/// delegation pair) the same decorator, which is what produces <c>delegation.started</c>.
/// </summary>
internal sealed class ObservedToolDecorator : IToolDecorator
{
    private readonly RunEventWriter _events;

    /// <summary>Builds the decorator over the event stream.</summary>
    /// <param name="events">The event stream.</param>
    public ObservedToolDecorator(RunEventWriter events)
    {
        ArgumentNullException.ThrowIfNull(events);
        _events = events;
    }

    /// <inheritdoc />
    public ITool Decorate(ITool tool)
    {
        ArgumentNullException.ThrowIfNull(tool);
        return tool is ObservedTool ? tool : new ObservedTool(tool, _events);
    }
}
