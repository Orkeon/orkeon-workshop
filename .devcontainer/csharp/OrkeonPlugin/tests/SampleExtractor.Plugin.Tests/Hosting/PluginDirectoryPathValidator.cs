using Orkeon.Domain.Tools.Security;

namespace SampleExtractor.Plugin.Tests.Hosting;

/// <summary>
/// The path validator a HOST must give to the file system it hands to
/// <c>AddOrkeonPlugins</c>. Orkeon's stock <c>PathValidator</c> refuses a fixed list of
/// extensions (<c>.dll</c>, <c>.exe</c>, <c>.sh</c>...), so plugin discovery through the
/// regular VFS denies every candidate and loads nothing, without any error (rc.4). This
/// validator admits whatever lies inside the plugin directory, and nothing outside it.
/// The same class ships in OrkeonRunner, the harness host that loads plugins.
/// </summary>
internal sealed class PluginDirectoryPathValidator : IPathValidator
{
    private readonly string _root;

    public PluginDirectoryPathValidator(string pluginDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pluginDirectory);
        _root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(pluginDirectory));
    }

    public PathValidationResult ValidatePath(string requestedPath, string? workspaceRoot = null)
    {
        if (string.IsNullOrWhiteSpace(requestedPath))
            return PathValidationResult.Denied("Path cannot be null or empty");

        var full = Path.GetFullPath(requestedPath);
        var inside = string.Equals(full, _root, StringComparison.Ordinal)
            || full.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal);
        if (!inside)
            return PathValidationResult.Denied("Path is outside the plugin directory");

        // Orkeon v1 does not follow symbolic links in a plugin directory.
        if (new FileInfo(full).LinkTarget is not null)
            return PathValidationResult.Denied("Symbolic links are not followed in a plugin directory");

        return PathValidationResult.Allowed(full);
    }
}
