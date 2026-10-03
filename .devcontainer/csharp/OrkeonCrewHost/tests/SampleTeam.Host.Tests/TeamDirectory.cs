namespace SampleTeam.Host.Tests;

/// <summary>
/// A throw-away copy of the template's team directory (mounts.json, crew/, input/), so a
/// test can run the host for real without touching the build output of another test.
/// </summary>
internal sealed class TeamDirectory : IDisposable
{
    public TeamDirectory(bool withCrewDefinition = true)
    {
        Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "sample-team-tests-" + Guid.NewGuid().ToString("N"));
        Copy(System.IO.Path.Combine(AppContext.BaseDirectory, "team"), Path);
        if (!withCrewDefinition)
            Directory.Delete(System.IO.Path.Combine(Path, "crew"), recursive: true);
    }

    /// <summary>Physical path of the temporary team directory.</summary>
    public string Path { get; }

    /// <summary>Physical path of a file under the team directory.</summary>
    public string File(params string[] segments) => System.IO.Path.Combine([Path, .. segments]);

    public void Dispose()
    {
        if (Directory.Exists(Path))
            Directory.Delete(Path, recursive: true);
    }

    private static void Copy(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (var directory in Directory.EnumerateDirectories(source, "*", SearchOption.AllDirectories))
            Directory.CreateDirectory(directory.Replace(source, destination, StringComparison.Ordinal));
        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
            System.IO.File.Copy(file, file.Replace(source, destination, StringComparison.Ordinal));
    }
}
