using Microsoft.Extensions.Logging;
using Orkeon.Domain.Attributes;
using Orkeon.Domain.FileSystem;
using Orkeon.Domain.Tools;
using Orkeon.Tools.Abstractions.Base;
using SampleExtractor.Domain;

namespace SampleExtractor.Tool;

/// <summary>
/// The <c>sample_extractor</c> tool: reads a text file through the virtual file system and
/// returns its <c>key: value</c> lines. Follows the built-in tool pattern (HumanInputTool):
/// <see cref="ToolContractAttribute"/> for the agent-visible name, typed request/response
/// records, a <c>partial</c> class for source-generated logging, and every byte of I/O
/// going through <see cref="IFileSystemService"/> (ADR-008 - the VFS analyzer makes
/// System.IO a build error).
/// </summary>
[ToolContract("sample_extractor",
    Name = "sample_extractor",
    Description = "Extract the 'key: value' lines of a text file under a virtual root and return them as a map.",
    Category = "Sample")]
public sealed partial class SampleExtractorTool : ToolBase<SampleExtractorRequest, SampleExtractorResponse>
{
    private readonly IFileSystemService _fileSystem;

    /// <summary>Initializes the tool over the virtual file system it reads from.</summary>
    /// <param name="fileSystem">The VFS (required, non-nullable: ORKVFS007).</param>
    /// <param name="logger">Optional logger.</param>
    public SampleExtractorTool(IFileSystemService fileSystem, ILogger<SampleExtractorTool>? logger = null)
        : base(logger)
    {
        ArgumentNullException.ThrowIfNull(fileSystem);
        _fileSystem = fileSystem;
    }

    /// <inheritdoc />
    public override ToolAccess Access => ToolAccess.Read;

    /// <inheritdoc />
    protected override string? ValidateTypedRequest(SampleExtractorRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrWhiteSpace(request.Path))
            return "path cannot be empty";
        if (!request.Path.StartsWith('/'))
            return $"path must be a virtual path starting with '/', got '{request.Path}'";
        return null;
    }

    /// <inheritdoc />
    protected override Task<SampleExtractorResponse> ExecuteTypedAsync(
        SampleExtractorRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        return ExecuteCoreAsync();

        async Task<SampleExtractorResponse> ExecuteCoreAsync()
        {
            string? text;
            try
            {
                text = await _fileSystem.TryReadAllTextAsync(request.Path, cancellationToken).ConfigureAwait(false);
            }
            catch (FileAccessDeniedException ex)
            {
                LogAccessDenied(request.Path);
                return Failure($"Access denied: {ex.Message}");
            }

            if (text is null)
                return Failure($"File not found: {request.Path}");

            var entries = KeyValueExtractor.Extract(text, request.Keys);
            var map = KeyValueExtractor.ToMap(entries);
            LogScanned(request.Path, map.Count);

            return new SampleExtractorResponse
            {
                Success = true,
                Entries = map,
                Count = map.Count,
            };
        }
    }

    private static SampleExtractorResponse Failure(string error) => new() { Success = false, Error = error };

    [LoggerMessage(EventId = 1, Level = LogLevel.Information, Message = "sample_extractor scanned {Path}: {Count} entries")]
    private partial void LogScanned(string path, int count);

    [LoggerMessage(EventId = 2, Level = LogLevel.Warning, Message = "sample_extractor denied access to {Path}")]
    private partial void LogAccessDenied(string path);
}
