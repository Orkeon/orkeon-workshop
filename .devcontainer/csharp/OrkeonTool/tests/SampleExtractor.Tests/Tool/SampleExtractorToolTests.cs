using System.Globalization;
using Orkeon.Domain.Common;
using Orkeon.Domain.FileSystem;
using Orkeon.Domain.Tools;
using Orkeon.Infrastructure.Serialization;
using SampleExtractor.Tests.Doubles;
using SampleExtractor.Tool;
// Orkeon.Domain.Tools also declares a legacy ToolCallRequest/Response pair; the tool
// pipeline speaks the Protocol one (same aliases as ToolBase itself).
using ProtocolToolCallRequest = Orkeon.Domain.Tools.Protocol.ToolCallRequest;
using ProtocolToolCallResponse = Orkeon.Domain.Tools.Protocol.ToolCallResponse;

namespace SampleExtractor.Tests.Tool;

/// <summary>
/// Tool tests: the Orkeon pipeline (deserialize, validate, execute, serialize, filter)
/// exercised end to end over a hand-rolled in-memory <c>IFileSystemService</c>.
/// </summary>
public class SampleExtractorToolTests
{
    static SampleExtractorToolTests()
    {
        // The typed pipeline needs the component serializer Orkeon.Infrastructure registers;
        // TrySet is idempotent, so parallel test classes can all call it.
        ComponentBase.TrySetDefaultSerializer(JsonComponentSerializer.Instance);
    }

    private static FakeFileSystemService Workspace() =>
        new FakeFileSystemService()
            .AddMount("/workspace", FileAccessRights.ReadOnly)
            .AddFile("/workspace/notes.txt", "owner: Ada\nstatus: done\nno entry here\n");

    private static ProtocolToolCallRequest Request(string path, params string[] keys)
    {
        var parameters = new Dictionary<string, object?> { ["path"] = path };
        if (keys.Length > 0)
            parameters["keys"] = keys.ToList();
        return new ProtocolToolCallRequest("sample_extractor", parameters);
    }

    private static int CountOf(ProtocolToolCallResponse response)
    {
        var result = Assert.IsType<IDictionary<string, object?>>(response.Result, exactMatch: false);
        return Convert.ToInt32(result["count"], CultureInfo.InvariantCulture);
    }

    [Fact]
    public void Tool_DeclaresItsContract()
    {
        using var tool = new SampleExtractorTool(Workspace());

        Assert.Equal("sample_extractor", tool.Name);
        Assert.Equal(ToolAccess.Read, tool.Access);
        Assert.False(string.IsNullOrWhiteSpace(tool.Description));
    }

    [Fact]
    public async Task Call_ReadsTheFileThroughTheVirtualFileSystem()
    {
        using var tool = new SampleExtractorTool(Workspace());

        var response = await tool.CallAsync(Request("/workspace/notes.txt"), TestContext.Current.CancellationToken);

        Assert.True(response.Success, response.Error);
        Assert.Equal(2, CountOf(response));
    }

    [Fact]
    public async Task Call_FiltersOnTheRequestedKeys()
    {
        using var tool = new SampleExtractorTool(Workspace());

        var response = await tool.CallAsync(Request("/workspace/notes.txt", "status"), TestContext.Current.CancellationToken);

        Assert.True(response.Success, response.Error);
        Assert.Equal(1, CountOf(response));
    }

    [Fact]
    public async Task Call_ReportsAMissingFileAsAnError()
    {
        using var tool = new SampleExtractorTool(Workspace());

        var response = await tool.CallAsync(Request("/workspace/missing.txt"), TestContext.Current.CancellationToken);

        Assert.False(response.Success);
        Assert.Contains("File not found", response.Error);
    }

    [Fact]
    public async Task Call_RefusesAPathOutsideEveryMount()
    {
        using var tool = new SampleExtractorTool(Workspace());

        var response = await tool.CallAsync(Request("/elsewhere/notes.txt"), TestContext.Current.CancellationToken);

        Assert.False(response.Success);
        Assert.Contains("Access denied", response.Error);
    }

    [Fact]
    public async Task Call_RejectsAPathThatIsNotVirtual()
    {
        using var tool = new SampleExtractorTool(Workspace());

        var response = await tool.CallAsync(Request("notes.txt"), TestContext.Current.CancellationToken);

        Assert.False(response.Success);
        Assert.Contains("virtual path", response.Error);
    }
}
