using Orkeon.Domain.Attributes;

namespace SampleExtractor.Tool;

/// <summary>
/// Request of the <c>sample_extractor</c> tool. Property names reach the model in
/// snake_case (<c>path</c>, <c>keys</c>) through Orkeon's component serializer; the
/// <see cref="FieldSchemaAttribute"/> metadata becomes the JSON schema the LLM sees.
/// </summary>
public sealed record SampleExtractorRequest
{
    /// <summary>Virtual path of the UTF-8 text file to scan (must start with <c>/</c>).</summary>
    [FieldSchema(Description = "Virtual path of the UTF-8 text file to scan, e.g. /workspace/notes.txt", IsRequired = true, Example = "/workspace/notes.txt")]
    public string Path { get; init; } = "";

    /// <summary>Optional allow-list of keys to keep; empty keeps every key.</summary>
    [FieldSchema(Description = "Optional list of keys to keep (case-insensitive). Empty or omitted keeps every key.", IsRequired = false, ItemsType = "string")]
    public IReadOnlyList<string> Keys { get; init; } = [];
}

/// <summary>Response of the <c>sample_extractor</c> tool.</summary>
public sealed record SampleExtractorResponse
{
    /// <summary>Whether the file was read and scanned.</summary>
    [ReturnSchema(Description = "True when the file was read and scanned", Example = true)]
    public bool Success { get; init; }

    /// <summary>The extracted entries as a key to value map (last occurrence wins).</summary>
    [ReturnSchema(Description = "Extracted entries as a key -> value map", Type = "object")]
    public IReadOnlyDictionary<string, string> Entries { get; init; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Number of distinct keys extracted.</summary>
    [ReturnSchema(Description = "Number of distinct keys extracted", Example = 2)]
    public int Count { get; init; }

    /// <summary>Error message when <see cref="Success"/> is false.</summary>
    [ReturnSchema(Description = "Error message when success is false", Example = "File not found: /workspace/missing.txt")]
    public string? Error { get; init; }
}
