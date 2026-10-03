using System.Text.RegularExpressions;

namespace SampleExtractor.Domain;

/// <summary>
/// Pure extraction logic: finds <c>key: value</c> lines in free text. No I/O and no Orkeon
/// type here, so this layer is tested without the framework (Clean Architecture split of a
/// tool: Domain/ holds the rule, Tool/ holds validation, mapping and VFS access).
/// </summary>
public static partial class KeyValueExtractor
{
    /// <summary>
    /// Extracts every <c>key: value</c> line of <paramref name="text"/>, in document order.
    /// A key is a run of letters, digits, <c>_</c>, <c>-</c> or <c>.</c>; the value is the
    /// trimmed remainder of the line. Lines that do not match are ignored.
    /// </summary>
    /// <param name="text">The text to scan.</param>
    /// <param name="keys">
    /// Optional allow-list of keys (compared ordinally, case-insensitive). Null or empty
    /// keeps every key.
    /// </param>
    /// <returns>The entries found, possibly empty, never null.</returns>
    public static IReadOnlyList<ExtractedEntry> Extract(string text, IReadOnlyCollection<string>? keys = null)
    {
        ArgumentNullException.ThrowIfNull(text);

        var filter = keys is { Count: > 0 }
            ? new HashSet<string>(keys, StringComparer.OrdinalIgnoreCase)
            : null;

        var entries = new List<ExtractedEntry>();
        var lineNumber = 0;
        foreach (var rawLine in text.Split('\n'))
        {
            lineNumber++;
            var match = EntryPattern().Match(rawLine);
            if (!match.Success)
                continue;

            var key = match.Groups["key"].Value;
            if (filter is not null && !filter.Contains(key))
                continue;

            entries.Add(new ExtractedEntry(key, match.Groups["value"].Value.TrimEnd('\r').Trim(), lineNumber));
        }

        return entries;
    }

    /// <summary>
    /// Folds <paramref name="entries"/> into a map; when a key appears several times the
    /// last occurrence wins, which is the usual "later lines override" reading of a notes file.
    /// </summary>
    /// <param name="entries">Entries returned by <see cref="Extract"/>.</param>
    /// <returns>A read-only map keyed by the entry key (ordinal, case preserved).</returns>
    public static IReadOnlyDictionary<string, string> ToMap(IEnumerable<ExtractedEntry> entries)
    {
        ArgumentNullException.ThrowIfNull(entries);

        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var entry in entries)
            map[entry.Key] = entry.Value;
        return map;
    }

    [GeneratedRegex(@"^\s*(?<key>[A-Za-z0-9_.-]+)\s*:\s*(?<value>\S.*)$", RegexOptions.CultureInvariant)]
    private static partial Regex EntryPattern();
}

/// <summary>One <c>key: value</c> line found by <see cref="KeyValueExtractor"/>.</summary>
/// <param name="Key">The key as written in the text.</param>
/// <param name="Value">The trimmed value.</param>
/// <param name="LineNumber">1-based line number of the entry.</param>
public sealed record ExtractedEntry(string Key, string Value, int LineNumber);
