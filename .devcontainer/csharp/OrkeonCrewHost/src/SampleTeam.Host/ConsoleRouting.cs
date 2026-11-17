using Orkeon.Compliance.Vfs;

namespace SampleTeam.Host;

/// <summary>
/// With <c>--events -</c>, stdout carries the event stream alone: for the run, <see cref="Console.Out"/>
/// - what a tool's <c>Console.WriteLine</c> writes to - goes to stderr, so no line of a tool can break
/// the stream. The event writer keeps the stdout the host was built with.
/// </summary>
[SuppressConsoleCompliance("CONSOLE-SINK: keeps the process stdout for the event stream by sending the console output of the run to stderr.")]
internal static class ConsoleRouting
{
    /// <summary>Sends <see cref="Console.Out"/> to <paramref name="stderr"/> while stdout carries the events; disposing the result restores it.</summary>
    /// <param name="protocolOnStdout">Whether stdout carries the event stream.</param>
    /// <param name="stderr">Where the console output goes meanwhile.</param>
    /// <returns>What restores the console output.</returns>
    public static IDisposable AwayFromProtocol(bool protocolOnStdout, TextWriter stderr)
    {
        ArgumentNullException.ThrowIfNull(stderr);
        if (!protocolOnStdout)
            return new Restore(null);
        var previous = Console.Out;
        Console.SetOut(stderr);
        return new Restore(previous);
    }

    private sealed class Restore(TextWriter? previous) : IDisposable
    {
        public void Dispose()
        {
            if (previous is not null)
                Console.SetOut(previous);
        }
    }
}
