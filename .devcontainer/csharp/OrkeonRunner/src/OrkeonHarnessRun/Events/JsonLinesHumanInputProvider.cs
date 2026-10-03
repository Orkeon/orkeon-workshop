using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Orkeon.Application.Interfaces.Ports;
using Orkeon.Constants.Protocol;
using Orkeon.Domain.HumanInput;

namespace OrkeonHarnessRun.Events;

/// <summary>
/// Human input over the event protocol: the question goes out as <c>input.needed</c> and
/// the run waits for an <c>input.given</c> line on stdin.
/// </summary>
/// <remarks>
/// Silence is not consent. Without <c>--events</c> a task declared <c>humanInput: true</c>
/// is auto-approved (the runner's unattended fallback); an observed run replaces that
/// provider, and when no answer comes - stdin closed, run cancelled - a confirmation is
/// REFUSED, never granted. Unlike the CLI, there is no background command pump: stdin is
/// read only while a question is pending, and the hub verbs (post, send, publish, reply,
/// subscribe) are not implemented by this runner.
/// </remarks>
internal sealed class JsonLinesHumanInputProvider : IHumanInputProvider, IDisposable
{
    private readonly RunEventWriter _events;

    [SuppressMessage("Usage", "CA2213:Disposable fields should be disposed", Justification = "The answer channel is the process's standard input: this provider reads from it and does not own it.")]
    private readonly TextReader _answers;
    private readonly SemaphoreSlim _oneQuestionAtATime = new(1, 1);

    /// <summary>Builds the provider over the event stream and the answer channel.</summary>
    /// <param name="events">The event stream (stdout).</param>
    /// <param name="answers">Where answers are read from (stdin).</param>
    public JsonLinesHumanInputProvider(RunEventWriter events, TextReader answers)
    {
        ArgumentNullException.ThrowIfNull(events);
        ArgumentNullException.ThrowIfNull(answers);
        _events = events;
        _answers = answers;
    }

    /// <inheritdoc />
    public async Task<string> GetInputAsync(HumanInputContext context, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        return await AskAsync(context, "text", cancellationToken).ConfigureAwait(false)
            ?? context.DefaultValue
            ?? string.Empty;
    }

    /// <inheritdoc />
    public async Task<bool> GetConfirmationAsync(HumanInputContext context, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        var answer = await AskAsync(context, "confirm", cancellationToken).ConfigureAwait(false);
        return answer is not null && IsAffirmative(answer);
    }

    /// <inheritdoc />
    public async Task<string> GetChoiceAsync(HumanInputContext context, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        var answer = await AskAsync(context, "choice", cancellationToken).ConfigureAwait(false);
        if (answer is not null && (context.Options.Count == 0 || context.Options.Contains(answer, StringComparer.Ordinal)))
            return answer;

        return context.DefaultValue ?? (context.Options.Count > 0 ? context.Options[0] : string.Empty);
    }

    /// <inheritdoc />
    public Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default) => Task.FromResult(true);

    /// <inheritdoc />
    public void Dispose() => _oneQuestionAtATime.Dispose();

    private async Task<string?> AskAsync(HumanInputContext context, string inputKind, CancellationToken cancellationToken)
    {
        var correlationId = context.RequestId.ToString();
        await _oneQuestionAtATime.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            // The payload field is `inputKind`, not `kind`: that name belongs to the envelope.
            _events.Emit(
                RunEventKinds.InputNeeded,
                new RunEventScope
                {
                    AgentId = string.IsNullOrEmpty(context.AgentRole) ? null : context.AgentRole,
                    CorrelationId = correlationId,
                },
                ("inputKind", inputKind),
                ("prompt", context.Prompt),
                ("choices", context.Options.Count > 0 ? context.Options : null),
                ("defaultValue", context.DefaultValue),
                ("taskDescription", string.IsNullOrEmpty(context.TaskDescription) ? null : context.TaskDescription));

            return await ReadAnswerAsync(correlationId, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _oneQuestionAtATime.Release();
        }
    }

    /// <summary>
    /// Reads stdin until an <c>input.given</c> line answers this question (matching
    /// correlation id, or none at all: a human typing has no identifier to quote). A line
    /// that is not protocol, or another verb, is ignored. End of stream means no answer.
    /// </summary>
    private async Task<string?> ReadAnswerAsync(string correlationId, CancellationToken cancellationToken)
    {
        while (true)
        {
            var line = await _answers.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null)
                return null;
            if (TryReadAnswer(line, correlationId, out var value))
                return value;
        }
    }

    private static bool TryReadAnswer(string line, string correlationId, out string? value)
    {
        value = null;
        if (string.IsNullOrWhiteSpace(line))
            return false;

        try
        {
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("kind", out var kind)
                || !string.Equals(kind.GetString(), RunEventKinds.InputGiven, StringComparison.Ordinal))
            {
                return false;
            }

            if (root.TryGetProperty("correlationId", out var id)
                && id.ValueKind == JsonValueKind.String
                && !string.Equals(id.GetString(), correlationId, StringComparison.Ordinal))
            {
                return false;
            }

            value = root.TryGetProperty("value", out var answer)
                ? answer.ValueKind == JsonValueKind.String ? answer.GetString() : answer.GetRawText()
                : null;
            return true;
        }
        catch (JsonException)
        {
            // The inbound stream is deliberately tolerant: a malformed line is ignored.
            return false;
        }
    }

    private static bool IsAffirmative(string answer) =>
        answer.Trim() is "y" or "yes" or "true" or "1" or "o" or "oui";
}
