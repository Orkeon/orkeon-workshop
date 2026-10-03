using System.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Console;
using Orkeon.Application.Crew;
using Orkeon.Application.Interfaces.Ports;
using Orkeon.Constants.Protocol;
using Orkeon.Domain.Tools;

namespace OrkeonHarnessRun.Events;

/// <summary>
/// One observed run: opens the stream with <c>run.started</c>, registers the observed
/// seams on the host's service collection, and closes the stream with <c>run.finished</c>
/// mirroring the exit code.
/// </summary>
internal sealed class RunObservation : IDisposable
{
    private readonly RunEventWriter _events;
    private readonly JsonLinesHumanInputProvider _humanInput;
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private RunEventObserver? _observer;
    private bool _finished;

    /// <summary>Builds the observation over the protocol stream and the answer channel.</summary>
    /// <param name="output">Where the protocol is written (stdout).</param>
    /// <param name="answers">Where answers to <c>input.needed</c> are read (stdin).</param>
    public RunObservation(TextWriter output, TextReader answers)
    {
        ArgumentNullException.ThrowIfNull(output);
        ArgumentNullException.ThrowIfNull(answers);
        _events = new RunEventWriter(output);
        _humanInput = new JsonLinesHumanInputProvider(_events, answers);
    }

    /// <summary>Emits the opening event.</summary>
    /// <param name="target">The crew definition being run, as the operator spelled it.</param>
    public void Started(string target) =>
        _events.Emit(RunEventKinds.RunStarted, ("target", target), ("stream", false));

    /// <summary>
    /// Registers the observed seams. Call it LAST in the host's service hook: it wraps every
    /// <see cref="IBaseTool"/> registered so far (plugin tools included) and takes over the
    /// execution hook already in place.
    /// </summary>
    /// <param name="services">The host's service collection.</param>
    public void Wire(IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        // Protocol purity: stdout carries the protocol, so every log line goes to stderr.
        services.Configure<ConsoleLoggerOptions>(o => o.LogToStandardErrorThreshold = LogLevel.Trace);

        // Every DI-registered tool becomes an observed tool.
        foreach (var descriptor in services.Where(d => d.ServiceType == typeof(IBaseTool) && !d.IsKeyedService).ToList())
        {
            services.Remove(descriptor);
            services.Add(new ServiceDescriptor(
                typeof(IBaseTool),
                sp => new ObservedTool((IBaseTool)Materialize(sp, descriptor)!, _events),
                descriptor.Lifetime));
        }

        services.AddSingleton<IToolDecorator>(new ObservedToolDecorator(_events));

        // ICrewExecutionHook is a single service: take the existing registration over rather
        // than past it. One observer instance stands behind both interfaces.
        var existingHook = services.LastOrDefault(d => d.ServiceType == typeof(ICrewExecutionHook));
        if (existingHook is not null)
            services.Remove(existingHook);

        services.AddSingleton(sp =>
        {
            var inner = existingHook is null ? null : (ICrewExecutionHook?)Materialize(sp, existingHook);
            _observer = new RunEventObserver(_events, inner);
            return _observer;
        });
        services.AddSingleton<ICrewExecutionHook>(sp => sp.GetRequiredService<RunEventObserver>());
        services.AddSingleton<ILlmUsageSink>(sp => sp.GetRequiredService<RunEventObserver>());

        // An observed run never approves on the user's behalf (the runner's AutoApprove
        // fallback is registered with TryAdd, so this explicit registration wins).
        services.AddSingleton<IHumanInputProvider>(_humanInput);
    }

    /// <summary>Emits the closing event, once.</summary>
    /// <param name="exitCode">The process exit code the event mirrors.</param>
    public void Finished(int exitCode)
    {
        if (_finished)
            return;
        _finished = true;

        _events.Emit(
            RunEventKinds.RunFinished,
            ("success", exitCode == 0),
            ("exitCode", exitCode),
            ("tokens", _observer?.TokensUsed ?? 0L),
            ("durationMs", _clock.ElapsedMilliseconds),
            ("promptTokens", _observer?.PromptTokens ?? 0L),
            ("completionTokens", _observer?.CompletionTokens ?? 0L));
    }

    /// <inheritdoc />
    public void Dispose() => _humanInput.Dispose();

    /// <summary>Builds the service a descriptor describes, whatever form it was registered in.</summary>
    private static object? Materialize(IServiceProvider sp, ServiceDescriptor descriptor)
    {
        if (descriptor.IsKeyedService)
            return null;
        if (descriptor.ImplementationInstance is { } instance)
            return instance;
        if (descriptor.ImplementationFactory is { } factory)
            return factory(sp);
        return descriptor.ImplementationType is { } type
            ? ActivatorUtilities.CreateInstance(sp, type)
            : null;
    }
}
