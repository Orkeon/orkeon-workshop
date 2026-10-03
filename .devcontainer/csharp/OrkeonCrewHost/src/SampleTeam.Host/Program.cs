using SampleTeam.Host.Composition;
using SampleTeam.Host.Mounts;

namespace SampleTeam.Host;

/// <summary>Entry point of the team host.</summary>
internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        HostOptions options;
        try
        {
            options = HostOptions.Parse(args, Environment.GetEnvironmentVariable(HostOptions.EnvironmentVariable));
        }
        catch (FormatException ex)
        {
            await Console.Error.WriteLineAsync($"ERROR: {ex.Message}").ConfigureAwait(false);
            await Console.Error.WriteLineAsync(HostOptions.Usage).ConfigureAwait(false);
            return TeamRun.ConfigurationError;
        }

        var host = await BuildOrReportAsync(options).ConfigureAwait(false);
        if (host is null)
            return TeamRun.ConfigurationError;

        // Disposing the host disposes the container, which flushes and closes events.jsonl.
        await using (host.ConfigureAwait(false))
        {
            using var cancellation = new CancellationTokenSource();
            Console.CancelKeyPress += (_, e) =>
            {
                e.Cancel = true; // let the crew wind down instead of killing the process
                cancellation.Cancel();
            };

            return await TeamRun.ExecuteAsync(host, options, Console.Out, Console.Error, cancellation.Token).ConfigureAwait(false);
        }
    }

    /// <summary>Builds the host, or prints why the team directory cannot be hosted.</summary>
    private static async Task<TeamHost?> BuildOrReportAsync(HostOptions options)
    {
        try
        {
            return TeamHost.Build(options, Console.Out);
        }
        catch (Exception ex) when (ex is MountsFileException or FormatException or DirectoryNotFoundException or InvalidOperationException)
        {
            await Console.Error.WriteLineAsync($"ERROR: {ex.Message}").ConfigureAwait(false);
            return null;
        }
    }
}
