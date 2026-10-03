using System.Collections.Immutable;
using System.Text.Json;
using Orkeon.Application.Crew;
using Orkeon.Application.Interfaces.Ports;
using Orkeon.Domain.HumanInput;
using OrkeonHarnessRun.Events;
using OrkeonHarnessRun.Tests.Doubles;
using ProtocolToolCallRequest = Orkeon.Domain.Tools.Protocol.ToolCallRequest;

namespace OrkeonHarnessRun.Tests.Events;

/// <summary>What a run says on the stream: tasks, cost, tools, questions, failure.</summary>
public class RunEventObserverTests
{
    private static List<JsonElement> Events(StringWriter output) =>
        [.. output.ToString()
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(line => JsonDocument.Parse(line).RootElement)];

    private static CrewExecutionSnapshot CrewSnapshot(CrewHookStatus status, string? reason = null) => new()
    {
        CrewId = "crew-1",
        StartedAt = DateTimeOffset.UnixEpoch,
        EndedAt = DateTimeOffset.UnixEpoch.AddSeconds(3),
        Tasks = ImmutableList<TaskExecutionSnapshot>.Empty,
        Status = status,
        FailureReason = reason,
    };

    [Fact]
    public async Task TaskCallbacks_BecomeTaskStartedAndTaskCompleted()
    {
        var output = new StringWriter();
        var inner = new RecordingHook();
        var observer = new RunEventObserver(new RunEventWriter(output), inner);
        var ct = TestContext.Current.CancellationToken;

        await observer.OnTaskStartedAsync(
            new TaskStartSnapshot { TaskId = "extract", AgentRole = "Extractor", StartedAt = DateTimeOffset.UtcNow }, ct);
        await observer.OnTaskCompletedAsync(
            new TaskExecutionSnapshot
            {
                TaskId = "extract",
                AgentRole = "Extractor",
                Success = true,
                Duration = TimeSpan.FromMilliseconds(1500),
                CompletedAt = DateTimeOffset.UtcNow,
                TokensUsed = 321,
                ToolCallCount = 2,
            }, ct);

        var events = Events(output);
        Assert.Equal(["task.started", "task.completed"], events.Select(e => e.GetProperty("kind").GetString()));
        Assert.Equal("Extractor", events[0].GetProperty("agentId").GetString());
        var completed = events[1];
        Assert.Equal("extract", completed.GetProperty("taskId").GetString());
        Assert.Equal("Extractor", completed.GetProperty("agentRole").GetString());
        Assert.True(completed.GetProperty("success").GetBoolean());
        Assert.False(completed.GetProperty("skipped").GetBoolean());
        Assert.Equal(1500, completed.GetProperty("durationMs").GetInt64());
        Assert.Equal(321, completed.GetProperty("tokens").GetInt32());
        Assert.Equal(2, completed.GetProperty("toolCalls").GetInt32());

        // The hook that was registered first still hears everything.
        Assert.Equal(["started:extract", "completed:extract"], inner.Calls);
    }

    [Fact]
    public void Usage_BecomesACumulativeCostUpdated()
    {
        var output = new StringWriter();
        var observer = new RunEventObserver(new RunEventWriter(output), inner: null);

        observer.Record(new CostUsageEvent { AgentId = "Extractor", Model = "qwen2.5:7b", PromptTokens = 100, CompletionTokens = 20 });
        observer.Record(new CostUsageEvent { AgentId = "Extractor", PromptTokens = 50, CompletionTokens = 5 });

        var events = Events(output);
        Assert.All(events, e => Assert.Equal("cost.updated", e.GetProperty("kind").GetString()));
        Assert.Equal([120L, 175L], events.Select(e => e.GetProperty("tokens").GetInt64()));
        Assert.Equal("qwen2.5:7b", events[0].GetProperty("model").GetString());
        Assert.False(events[1].TryGetProperty("model", out _));
        Assert.Equal(150, observer.PromptTokens);
        Assert.Equal(25, observer.CompletionTokens);
        Assert.Equal(175, observer.TokensUsed);
    }

    [Fact]
    public async Task CrewFailure_BecomesAnErrorEvent()
    {
        var output = new StringWriter();
        var inner = new RecordingHook();
        var observer = new RunEventObserver(new RunEventWriter(output), inner);

        await observer.OnCrewFailedAsync(
            CrewSnapshot(CrewHookStatus.Canceled, "timeout"), ex: null, TestContext.Current.CancellationToken);

        var error = Assert.Single(Events(output));
        Assert.Equal("error", error.GetProperty("kind").GetString());
        Assert.Equal("crew_cancelled", error.GetProperty("code").GetString());
        Assert.Equal("timeout", error.GetProperty("message").GetString());
        Assert.False(error.GetProperty("recoverable").GetBoolean());
        Assert.Equal(["crew-failed:crew-1"], inner.Calls);
    }

    [Fact]
    public async Task ObservedTool_EmitsACorrelatedCallAndReturn()
    {
        var output = new StringWriter();
        using var tool = new ObservedTool(new StubTool("sample_extractor"), new RunEventWriter(output));

        var response = await tool.CallAsync(
            new ProtocolToolCallRequest("sample_extractor", new Dictionary<string, object?> { ["path"] = "/workspace/a.txt", ["keys"] = null }),
            TestContext.Current.CancellationToken);

        Assert.True(response.Success);
        var events = Events(output);
        Assert.Equal(["tool.called", "tool.returned"], events.Select(e => e.GetProperty("kind").GetString()));
        Assert.Equal("path, keys", events[0].GetProperty("argsSummary").GetString());
        Assert.DoesNotContain("/workspace/a.txt", output.ToString());
        Assert.Equal(events[0].GetProperty("correlationId").GetString(), events[1].GetProperty("correlationId").GetString());
        Assert.True(events[1].GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task ObservedTool_ReportsAReturnEvenWhenTheToolThrows()
    {
        var output = new StringWriter();
        using var tool = new ObservedTool(
            new StubTool("boom") { Throws = new InvalidOperationException("no") }, new RunEventWriter(output));

        await Assert.ThrowsAsync<InvalidOperationException>(() => tool.CallAsync(
            new ProtocolToolCallRequest("boom", []), TestContext.Current.CancellationToken));

        var returned = Events(output)[^1];
        Assert.Equal("tool.returned", returned.GetProperty("kind").GetString());
        Assert.False(returned.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task HumanInput_AsksOnTheStreamAndTakesTheAnswerFromStdin()
    {
        var output = new StringWriter();
        var context = new HumanInputContext { Prompt = "Publish the report?", AgentRole = "Writer" };
        var answers = new StringReader(
            "not json at all\n"
            + "{\"kind\":\"input.given\",\"correlationId\":\"someone-else\",\"value\":\"no\"}\n"
            + $"{{\"kind\":\"input.given\",\"correlationId\":\"{context.RequestId}\",\"value\":\"yes\"}}\n");
        using var provider = new JsonLinesHumanInputProvider(new RunEventWriter(output), answers);

        var approved = await provider.GetConfirmationAsync(context, TestContext.Current.CancellationToken);

        Assert.True(approved);
        var asked = Assert.Single(Events(output));
        Assert.Equal("input.needed", asked.GetProperty("kind").GetString());
        Assert.Equal("confirm", asked.GetProperty("inputKind").GetString());
        Assert.Equal("Publish the report?", asked.GetProperty("prompt").GetString());
        Assert.Equal(context.RequestId.ToString(), asked.GetProperty("correlationId").GetString());
    }

    [Fact]
    public async Task HumanInput_SilenceIsARefusalNeverAnApproval()
    {
        using var provider = new JsonLinesHumanInputProvider(new RunEventWriter(new StringWriter()), new StringReader(string.Empty));

        var approved = await provider.GetConfirmationAsync(
            new HumanInputContext { Prompt = "Delete everything?" }, TestContext.Current.CancellationToken);

        Assert.False(approved);
    }
}
