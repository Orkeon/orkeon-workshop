using System.Globalization;
using System.Text;
using System.Text.Json;

namespace OrkeonHarnessRun.Events;

/// <summary>
/// Identity fields of the event envelope. An absent value is omitted from the line, never
/// written as <c>null</c>.
/// </summary>
internal sealed record RunEventScope
{
    /// <summary>The empty scope.</summary>
    public static RunEventScope None { get; } = new();

    /// <summary>Crew the event concerns, when the run knows it.</summary>
    public string? CrewId { get; init; }

    /// <summary>Agent the event concerns (its role, as the CLI does).</summary>
    public string? AgentId { get; init; }

    /// <summary>Ties a question to its answer, a tool call to its return.</summary>
    public string? CorrelationId { get; init; }

    /// <summary>The event that caused this one.</summary>
    public string? CausationId { get; init; }
}

/// <summary>
/// Writes the run event stream of <c>orkeon run --events jsonl</c> (protocol version 2,
/// <c>docs/architecture/run-event-bus.md</c>): one JSON document per line, the envelope
/// <c>v, seq, ts, [crewId, agentId, correlationId, causationId], kind</c> followed by the
/// payload fields, flat. A payload field that is null is omitted; one that collides with a
/// reserved envelope name is dropped rather than allowed to impersonate the envelope.
/// </summary>
internal sealed class RunEventWriter
{
    /// <summary>Protocol version written in every line.</summary>
    public const int ProtocolVersion = 2;

    private static readonly HashSet<string> ReservedNames = new(StringComparer.Ordinal)
    {
        "v", "seq", "ts", "kind", "crewId", "agentId", "correlationId", "causationId",
    };

    private static readonly JsonWriterOptions WriterOptions = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly TextWriter _output;
    private readonly TimeProvider _time;
    private readonly Lock _gate = new();
    private long _sequence;

    /// <summary>Initializes the writer over the stream that carries the protocol.</summary>
    /// <param name="output">Destination (stdout, or a file opened through the VFS).</param>
    /// <param name="time">Clock; the system clock when omitted.</param>
    public RunEventWriter(TextWriter output, TimeProvider? time = null)
    {
        ArgumentNullException.ThrowIfNull(output);
        _output = output;
        _time = time ?? TimeProvider.System;
    }

    /// <summary>Emits one event without identity fields.</summary>
    /// <param name="kind">Event kind (see <c>Orkeon.Constants.Protocol.RunEventKinds</c>).</param>
    /// <param name="fields">Payload fields, written flat beside the envelope.</param>
    public void Emit(string kind, params ReadOnlySpan<(string Name, object? Value)> fields) =>
        Emit(kind, RunEventScope.None, fields);

    /// <summary>Emits one event.</summary>
    /// <param name="kind">Event kind.</param>
    /// <param name="scope">Identity fields of the envelope.</param>
    /// <param name="fields">Payload fields, written flat beside the envelope.</param>
    public void Emit(string kind, RunEventScope scope, params ReadOnlySpan<(string Name, object? Value)> fields)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(kind);
        ArgumentNullException.ThrowIfNull(scope);

        lock (_gate)
        {
            using var buffer = new MemoryStream();
            using (var json = new Utf8JsonWriter(buffer, WriterOptions))
            {
                json.WriteStartObject();
                json.WriteNumber("v", ProtocolVersion);
                json.WriteNumber("seq", ++_sequence);
                json.WriteString("ts", _time.GetUtcNow().UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture));
                WriteIdentity(json, "crewId", scope.CrewId);
                WriteIdentity(json, "agentId", scope.AgentId);
                WriteIdentity(json, "correlationId", scope.CorrelationId);
                WriteIdentity(json, "causationId", scope.CausationId);
                json.WriteString("kind", kind);

                foreach (var (name, value) in fields)
                {
                    if (value is null || ReservedNames.Contains(name))
                        continue;
                    json.WritePropertyName(name);
                    WriteValue(json, value);
                }

                json.WriteEndObject();
            }

            _output.WriteLine(Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length));
            _output.Flush();
        }
    }

    private static void WriteIdentity(Utf8JsonWriter json, string name, string? value)
    {
        if (!string.IsNullOrEmpty(value))
            json.WriteString(name, value);
    }

    private static void WriteValue(Utf8JsonWriter json, object value)
    {
        switch (value)
        {
            case string text:
                json.WriteStringValue(text);
                break;
            case bool flag:
                json.WriteBooleanValue(flag);
                break;
            case int number:
                json.WriteNumberValue(number);
                break;
            case long number:
                json.WriteNumberValue(number);
                break;
            case double number:
                json.WriteNumberValue(number);
                break;
            case IEnumerable<string> items:
                json.WriteStartArray();
                foreach (var item in items)
                    json.WriteStringValue(item);
                json.WriteEndArray();
                break;
            default:
                json.WriteStringValue(Convert.ToString(value, CultureInfo.InvariantCulture));
                break;
        }
    }
}
