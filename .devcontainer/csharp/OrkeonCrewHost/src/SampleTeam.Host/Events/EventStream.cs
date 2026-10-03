using System.Text;
using Microsoft.Extensions.DependencyInjection;
using Orkeon.Application.Crew;
using Orkeon.Application.Interfaces.Ports;
using Orkeon.Domain.Tools;
using Orkeon.Infrastructure.FileSystem;

namespace SampleTeam.Host.Events;

/// <summary>Where the event stream of a run goes.</summary>
/// <param name="ToStdout">The protocol is written on standard output.</param>
/// <param name="VirtualPath">Virtual path of the event file under the host's internal root, or null.</param>
internal sealed record EventsTarget(bool ToStdout, string? VirtualPath)
{
    /// <summary>No event stream.</summary>
    public static EventsTarget None { get; } = new(false, null);

    /// <summary>Whether a stream is produced at all.</summary>
    public bool Enabled => ToStdout || VirtualPath is not null;
}

/// <summary>
/// Owns the text writer the protocol goes to. Registered in DI so the container disposes
/// it - and thereby flushes and closes <c>events.jsonl</c> - when the host shuts down.
/// </summary>
internal sealed class EventsOutput : IDisposable
{
    private readonly bool _owned;

    private EventsOutput(TextWriter writer, bool owned)
    {
        Writer = writer;
        _owned = owned;
    }

    /// <summary>The destination of the protocol lines.</summary>
    public TextWriter Writer { get; }

    /// <summary>
    /// Opens the destination. The event file is written THROUGH the VFS, on an internal
    /// mount the agents cannot address (<see cref="PrivilegedFileSystemAccess"/>), so the
    /// host itself stays free of direct System.IO.
    /// </summary>
    /// <param name="services">The built service provider.</param>
    /// <param name="target">Where the stream goes.</param>
    /// <param name="stdout">Standard output, used when the target says so.</param>
    /// <returns>The opened output.</returns>
    public static EventsOutput Open(IServiceProvider services, EventsTarget target, TextWriter stdout)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(target);
        ArgumentNullException.ThrowIfNull(stdout);

        if (target.VirtualPath is null)
            return new EventsOutput(stdout, owned: false);

        // Resolved once, at host startup, outside any synchronization context: blocking on
        // the VFS call here is the same bootstrap pattern Orkeon's own registrations use.
        var fileSystem = services.GetRequiredService<PrivilegedFileSystemAccess>().FileSystem;
        var stream = fileSystem.OpenWriteStreamAsync(target.VirtualPath, CancellationToken.None).GetAwaiter().GetResult();
        return new EventsOutput(new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false)) { AutoFlush = true }, owned: true);
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (_owned)
            Writer.Dispose();
    }
}

/// <summary>Registers the observed seams of a run on the host's service collection.</summary>
internal static class EventStream
{
    /// <summary>
    /// Wires the event stream. Call it LAST: it wraps every <see cref="IBaseTool"/>
    /// registered so far and takes over the execution hook already in place (so
    /// AUTO_SUMMARY.md keeps being written).
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="target">Where the stream goes.</param>
    /// <param name="stdout">Standard output.</param>
    public static void Wire(IServiceCollection services, EventsTarget target, TextWriter stdout)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(target);
        ArgumentNullException.ThrowIfNull(stdout);

        services.AddSingleton(sp => EventsOutput.Open(sp, target, stdout));
        services.AddSingleton(sp => new RunEventWriter(sp.GetRequiredService<EventsOutput>().Writer));

        foreach (var descriptor in services.Where(d => d.ServiceType == typeof(IBaseTool) && !d.IsKeyedService).ToList())
        {
            services.Remove(descriptor);
            services.Add(new ServiceDescriptor(
                typeof(IBaseTool),
                sp => new ObservedTool((IBaseTool)Materialize(sp, descriptor)!, sp.GetRequiredService<RunEventWriter>()),
                descriptor.Lifetime));
        }

        services.AddSingleton<IToolDecorator>(sp => new ObservedToolDecorator(sp.GetRequiredService<RunEventWriter>()));

        // ICrewExecutionHook is a single service: compose the existing one, do not drop it.
        var existingHook = services.LastOrDefault(d => d.ServiceType == typeof(ICrewExecutionHook));
        if (existingHook is not null)
            services.Remove(existingHook);

        services.AddSingleton(sp => new RunEventObserver(
            sp.GetRequiredService<RunEventWriter>(),
            existingHook is null ? null : (ICrewExecutionHook?)Materialize(sp, existingHook)));
        services.AddSingleton<ICrewExecutionHook>(sp => sp.GetRequiredService<RunEventObserver>());
        services.AddSingleton<ILlmUsageSink>(sp => sp.GetRequiredService<RunEventObserver>());
    }

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
