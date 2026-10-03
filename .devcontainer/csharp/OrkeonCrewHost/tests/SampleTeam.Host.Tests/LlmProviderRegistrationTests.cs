using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Orkeon.Application.Interfaces.Ports;
using SampleTeam.Host.Composition;

namespace SampleTeam.Host.Tests;

/// <summary>
/// The team reads its models as <c>orkeon run</c> does: a default provider only when a key of
/// <c>Llm</c> other than <c>Profiles</c> holds a value, and every named profile registered.
/// </summary>
public class LlmProviderRegistrationTests
{
    private static IServiceCollection Register(params (string Key, string? Value)[] settings)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(settings.Select(s => KeyValuePair.Create(s.Key, s.Value)))
            .Build();
        return new ServiceCollection().AddTeamLlmProvider(configuration);
    }

    private static bool Has<T>(IServiceCollection services) => services.Any(d => d.ServiceType == typeof(T));

    [Fact]
    public void NoLlmSection_RegistersTheEchoProvider()
    {
        var services = Register();

        Assert.True(Has<EchoLlmProvider>(services));
    }

    [Fact]
    public void ProfilesAlone_LeaveTheDefaultOnTheEchoProvider_AndRegisterTheProfiles()
    {
        var services = Register(
            ("Llm:Profiles:writer:BaseUrl", "http://localhost:11434"),
            ("Llm:Profiles:writer:Model", "qwen3:8b"));

        Assert.True(Has<EchoLlmProvider>(services));
        Assert.True(Has<ILlmProfileRegistry>(services));
    }

    [Fact]
    public void BlankDefaultValues_LeaveTheDefaultOnTheEchoProvider()
    {
        var services = Register(("Llm:BaseUrl", ""), ("Llm:Model", " "));

        Assert.True(Has<EchoLlmProvider>(services));
    }

    [Fact]
    public void ADefaultValue_RegistersTheConfiguredProvider()
    {
        var services = Register(("Llm:BaseUrl", "http://localhost:11434"), ("Llm:Model", "qwen3:8b"));

        Assert.False(Has<EchoLlmProvider>(services));
        Assert.True(Has<IBasicLlmProvider>(services));
    }

    [Fact]
    public void AnInvalidProfile_FailsAtRegistration()
    {
        Assert.Throws<InvalidOperationException>(() => Register(("Llm:Profiles:writer:BaseUrl", "not a url")));
    }
}
