using System.Text.Json;
using OrkeonHarnessRun.Events;
using OrkeonHarnessRun.Tests.Doubles;

namespace OrkeonHarnessRun.Tests.Events;

/// <summary>The envelope of the run event protocol (version 2).</summary>
public class RunEventWriterTests
{
    private static readonly DateTimeOffset Instant = new(2026, 9, 30, 8, 15, 42, TimeSpan.Zero);

    private static (RunEventWriter Writer, StringWriter Output) NewWriter()
    {
        var output = new StringWriter();
        return (new RunEventWriter(output, new FixedTimeProvider(Instant)), output);
    }

    private static string[] Lines(StringWriter output) =>
        output.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    [Fact]
    public void Emit_WritesTheEnvelopeThenThePayloadFlat()
    {
        var (writer, output) = NewWriter();

        writer.Emit("task.completed", new RunEventScope { AgentId = "writer" },
            ("taskId", "report"), ("success", true), ("durationMs", 4200L), ("tokens", 1840));

        Assert.Equal(
            """{"v":2,"seq":1,"ts":"2026-09-30T08:15:42Z","agentId":"writer","kind":"task.completed","taskId":"report","success":true,"durationMs":4200,"tokens":1840}""",
            Assert.Single(Lines(output)));
    }

    [Fact]
    public void Emit_NumbersTheLinesFromOne()
    {
        var (writer, output) = NewWriter();

        writer.Emit("run.started", ("target", "crew"), ("stream", false));
        writer.Emit("run.finished", ("success", true), ("exitCode", 0));

        var sequences = Lines(output).Select(l => JsonDocument.Parse(l).RootElement.GetProperty("seq").GetInt64());
        Assert.Equal([1L, 2L], sequences);
    }

    [Fact]
    public void Emit_OmitsNullFieldsAndEmptyIdentity()
    {
        var (writer, output) = NewWriter();

        writer.Emit("cost.updated", new RunEventScope { CrewId = "", AgentId = null },
            ("tokens", 10L), ("model", null), ("provider", null));

        var line = Assert.Single(Lines(output));
        Assert.DoesNotContain("null", line);
        Assert.DoesNotContain("crewId", line);
        Assert.DoesNotContain("model", line);
    }

    [Fact]
    public void Emit_DropsAPayloadFieldThatImpersonatesTheEnvelope()
    {
        var (writer, output) = NewWriter();

        writer.Emit("input.needed", ("kind", "confirm"), ("seq", 99), ("inputKind", "confirm"));

        var root = JsonDocument.Parse(Assert.Single(Lines(output))).RootElement;
        Assert.Equal("input.needed", root.GetProperty("kind").GetString());
        Assert.Equal(1, root.GetProperty("seq").GetInt64());
        Assert.Equal("confirm", root.GetProperty("inputKind").GetString());
    }

    [Fact]
    public void Emit_WritesAListOfStringsAsAnArray()
    {
        var (writer, output) = NewWriter();

        writer.Emit("input.needed", ("choices", new List<string> { "yes", "no" }));

        var choices = JsonDocument.Parse(Assert.Single(Lines(output))).RootElement.GetProperty("choices");
        Assert.Equal(["yes", "no"], choices.EnumerateArray().Select(c => c.GetString()));
    }
}
