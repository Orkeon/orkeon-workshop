using Orkeon.Compliance.Vfs;
using Orkeon.Domain.Tools.Security;

namespace OrkeonHarnessRun.Plugins;

/// <summary>
/// Path validator of the ONE file system instance handed to <c>AddOrkeonPlugins</c>.
/// </summary>
/// <remarks>
/// Orkeon's stock <c>PathValidator</c> refuses a fixed, non-configurable list of extensions
/// (<c>.dll</c>, <c>.exe</c>, <c>.sh</c>...). That is the right default for the file tools an
/// agent drives, but plugin discovery asks the VFS to resolve each candidate
/// <c>.dll</c>: through the regular file system every candidate is denied and silently
/// dropped, so nothing ever loads (rc.4; Orkeon's own plugin tests use a test-only file
/// system that has no validator). This validator admits whatever lies inside the plugin
/// directory and nothing outside it. It never reaches the agents: the runner builds a
/// private read-only mount for discovery and disposes it once the assemblies are loaded.
/// </remarks>
[SuppressVfsCompliance("EXCEPTION-BOOTSTRAP: canonicalizes the plugin directory and its candidates before the DI container exists; a path validator is by nature the component that looks at physical paths.")]
internal sealed class PluginDirectoryPathValidator : IPathValidator
{
    private readonly string _root;

    /// <summary>Initializes the validator over a physical plugin directory.</summary>
    /// <param name="pluginDirectory">Physical path of the plugin directory.</param>
    public PluginDirectoryPathValidator(string pluginDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pluginDirectory);
        _root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(pluginDirectory));
    }

    /// <inheritdoc />
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
