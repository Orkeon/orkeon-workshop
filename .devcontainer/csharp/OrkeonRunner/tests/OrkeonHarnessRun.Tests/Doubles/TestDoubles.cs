using Orkeon.Application.Crew;
using Orkeon.Domain.Common;
using Orkeon.Domain.Tools;
using ProtocolToolCallRequest = Orkeon.Domain.Tools.Protocol.ToolCallRequest;
using ProtocolToolCallResponse = Orkeon.Domain.Tools.Protocol.ToolCallResponse;
using ProtocolToolSchema = Orkeon.Domain.Tools.Protocol.ToolSchema;

namespace OrkeonHarnessRun.Tests.Doubles;

/// <summary>Hand-rolled <see cref="IBaseTool"/>: answers, or throws when told to.</summary>
internal sealed class StubTool : IBaseTool
{
    public StubTool(string name) => Name = name;

    public string Name { get; }

    public string Description => $"Stub tool {Name}";

    public ProtocolToolSchema Schema => new(Name, Description, []);

    public bool Succeeds { get; init; } = true;

    public Exception? Throws { get; init; }

    public int Calls { get; private set; }

    public Task<ProtocolToolCallResponse> CallAsync(ProtocolToolCallRequest request, CancellationToken cancellationToken = default)
    {
        Calls++;
        if (Throws is not null)
            throw Throws;
        return Task.FromResult(new ProtocolToolCallResponse(Succeeds, Succeeds ? "ok" : null, Succeeds ? null : "failed"));
    }

    public Task<ToolResult> ExecuteAsync(string input, CancellationToken cancellationToken = default) =>
        Task.FromResult(Succeeds ? ToolResult.CreateSuccess("ok") : ToolResult.CreateError("failed"));

    public bool ValidateInput(string input) => true;
}

/// <summary>Hand-rolled <see cref="ICrewExecutionHook"/> recording what reached it.</summary>
internal sealed class RecordingHook : ICrewExecutionHook
{
    public List<string> Calls { get; } = [];

    public Task OnTaskStartedAsync(TaskStartSnapshot snapshot, CancellationToken ct)
    {
        Calls.Add($"started:{snapshot.TaskId}");
        return Task.CompletedTask;
    }

    public Task OnTaskCompletedAsync(TaskExecutionSnapshot snapshot, CancellationToken ct)
    {
        Calls.Add($"completed:{snapshot.TaskId}");
        return Task.CompletedTask;
    }

    public Task OnCrewCompletedAsync(CrewExecutionSnapshot snapshot, CancellationToken ct)
    {
        Calls.Add($"crew-completed:{snapshot.CrewId}");
        return Task.CompletedTask;
    }

    public Task OnCrewFailedAsync(CrewExecutionSnapshot isPartial, Exception? ex, CancellationToken ct)
    {
        Calls.Add($"crew-failed:{isPartial.CrewId}");
        return Task.CompletedTask;
    }
}

/// <summary>A clock that always tells the same time, so event lines are comparable.</summary>
internal sealed class FixedTimeProvider : TimeProvider
{
    private readonly DateTimeOffset _now;

    public FixedTimeProvider(DateTimeOffset now) => _now = now;

    public override DateTimeOffset GetUtcNow() => _now;
}
