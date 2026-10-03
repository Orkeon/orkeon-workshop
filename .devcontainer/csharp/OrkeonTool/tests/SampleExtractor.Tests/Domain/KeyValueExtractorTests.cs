using SampleExtractor.Domain;

namespace SampleExtractor.Tests.Domain;

/// <summary>Domain tests: pure logic, no Orkeon type involved.</summary>
public class KeyValueExtractorTests
{
    private const string Notes = """
        # Weekly notes
        owner: Ada Lovelace
        status : in progress
        This line has no key.
        due-date: 2026-10-15
        owner: Grace Hopper
        """;

    [Fact]
    public void Extract_ReturnsEveryMatchingLineInOrder()
    {
        var entries = KeyValueExtractor.Extract(Notes);

        Assert.Equal(4, entries.Count);
        Assert.Equal(new ExtractedEntry("owner", "Ada Lovelace", 2), entries[0]);
        Assert.Equal(new ExtractedEntry("status", "in progress", 3), entries[1]);
        Assert.Equal(new ExtractedEntry("due-date", "2026-10-15", 5), entries[2]);
        Assert.Equal(new ExtractedEntry("owner", "Grace Hopper", 6), entries[3]);
    }

    [Fact]
    public void Extract_FiltersKeysCaseInsensitively()
    {
        var entries = KeyValueExtractor.Extract(Notes, ["STATUS"]);

        var single = Assert.Single(entries);
        Assert.Equal("status", single.Key);
    }

    [Fact]
    public void Extract_IgnoresTextWithoutEntries()
    {
        Assert.Empty(KeyValueExtractor.Extract("just prose\nand a second line without a pair"));
    }

    [Fact]
    public void ToMap_LastOccurrenceWins()
    {
        var map = KeyValueExtractor.ToMap(KeyValueExtractor.Extract(Notes));

        Assert.Equal(3, map.Count);
        Assert.Equal("Grace Hopper", map["owner"]);
    }

    [Fact]
    public void Extract_RejectsNullText()
    {
        Assert.Throws<ArgumentNullException>(() => KeyValueExtractor.Extract(null!));
    }
}
