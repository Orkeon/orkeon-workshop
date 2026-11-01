using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Orkeon.Application.Interfaces.Ports;
using Orkeon.Infrastructure.Decision.SystemOne;
using SampleTeam.Host.Composition;

namespace SampleTeam.Host.Tests;

/// <summary>
/// The team chooses its decision model as <c>orkeon run</c> does: none by default (every decision
/// task answers its fallback), the provider named or deduced otherwise, a refused choice refusing
/// the start. The environment is a stub: no test reads a real key variable.
/// </summary>
public class DecisionModelRegistrationTests
{
    private static IServiceCollection Register(Func<string, string?>? environment, params (string Key, string? Value)[] settings)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(settings.Select(s => KeyValuePair.Create(s.Key, s.Value)))
            .Build();
        return new ServiceCollection().AddTeamDecisionModels(configuration, environment ?? (_ => null));
    }

    private static bool Has<T>(IServiceCollection services) => services.Any(d => d.ServiceType == typeof(T));

    [Fact]
    public void NoDecisionSettings_RegisterNoDecisionModel()
    {
        var services = Register(null);

        Assert.False(Has<IDecisionModel>(services));
        var choice = services.BuildServiceProvider().GetRequiredService<DecisionProviderChoice>();
        Assert.False(choice.HasProvider);
    }

    [Fact]
    public void KevNamed_RegistersTheDecisionModel()
    {
        var services = Register(null, ("Orkeon:Decision:Provider", "kev"));

        Assert.True(Has<IDecisionModel>(services));
    }

    [Fact]
    public void KevSectionAlone_IsNeverDeduced()
    {
        var services = Register(null, ("Orkeon:Kev:Model", "kev-latest"));

        Assert.False(Has<IDecisionModel>(services));
    }

    [Fact]
    public void AHostedProviderKey_DeducesItsProvider()
    {
        var services = Register(name => name == "LIQUID_API_KEY" ? "stub" : null);

        Assert.True(Has<IDecisionModel>(services));
    }

    [Fact]
    public void AnUnknownProviderName_IsRefused()
    {
        Assert.Throws<InvalidOperationException>(() => Register(null, ("Orkeon:Decision:Provider", "oracle")));
    }

    [Fact]
    public void TypeSafeAndLiquidBothConfigured_AreRefused()
    {
        Assert.Throws<InvalidOperationException>(() =>
            Register(name => name is "TYPESAFE_API_KEY" or "LIQUID_API_KEY" ? "stub" : null));
    }
}
