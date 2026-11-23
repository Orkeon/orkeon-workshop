using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Orkeon.Application.Configuration;
using Orkeon.Infrastructure.Decision.SystemOne;
using Orkeon.Infrastructure.LLMs.Decision;

namespace SampleTeam.Host.Composition;

/// <summary>
/// Registers the decision model of the team (the model that answers a <c>decision:</c> task) and
/// the decision profiles of <c>Orkeon:Decision:Profiles</c>.
/// </summary>
/// <remarks>
/// <para>
/// Mirrors <c>RegisterDecisionModels</c> and <c>LogDecisionProvider</c> of
/// <c>Orkeon.Hosting.RunnerHost</c> at Orkeon 1.2.0 (both unchanged at 1.4.0), so that a C# team chooses its
/// decision model as <c>orkeon run</c> does. Only the active provider is registered: TypeSafe,
/// Liquid or Kev, named by <c>Orkeon:Decision:Provider</c>, else deduced from a hosted provider's
/// section (<c>Orkeon:TypeSafe</c>, <c>Orkeon:Liquid</c>, an empty one included) or its key variable
/// (<c>TYPESAFE_API_KEY</c>, <c>LIQUID_API_KEY</c>); Kev is never deduced. Without one no decision
/// model exists and the decision circuit is off (cause <c>no-provider</c>).
/// </para>
/// <para>
/// The circuit itself is <c>AddOrkeonInfrastructure</c>'s, not this class's: since Orkeon 1.4.0 it is also
/// off when the active provider is a hosted one (TypeSafe, Liquid) whose key is found neither in its
/// <c>ApiKey</c> nor in the variable its <c>ApiKeyEnvVar</c> names, else its default variable (cause
/// <c>no-key</c>, #451; Kev never), and <c>--no-decision</c> registers <c>DecisionCircuit.Off</c> over it.
/// With the circuit off no consumer asks the decision model (#433): a decision task answers from its
/// <c>fallback</c> (its <c>without:</c> relay in a <c>decision.mode: optional</c> crew), <c>system_one_decide</c>
/// is withheld, a decision profile goes to its route's fallback or its target, a fail-closed LLM judge
/// (<c>Orkeon:Guardian:Llm</c>) refuses to build and a fail-open one is left out, and a <c>required</c> crew
/// is refused before its first task (<c>TeamRun.DecisionUnavailable</c>, exit 69).
/// </para>
/// <para>
/// A refused choice refuses the start, with Orkeon's own message: a provider name that is none of
/// <c>typesafe</c>, <c>liquid</c>, <c>kev</c>; TypeSafe and Liquid both configured and none named;
/// a Kev address that is not absolute, or that carries a key in clear to another machine. The
/// exception is an <see cref="InvalidOperationException"/>, which <c>Program</c> reports as a
/// configuration error (exit code 1), as <c>orkeon run</c> reports its <c>RunnerSettingsException</c>.
/// The key is read from the variable the section's <c>ApiKeyEnvVar</c> names, or the provider's
/// default variable: never write it in a settings file.
/// </para>
/// </remarks>
internal static partial class DecisionModelRegistration
{
    /// <summary>
    /// Resolves the active decision provider, registers its model when there is one, declares the
    /// sections of the others, and registers the decision profiles either way.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">Host configuration.</param>
    /// <param name="environment">The environment reader; null reads the process environment.</param>
    /// <returns><paramref name="services"/>.</returns>
    /// <exception cref="InvalidOperationException">The choice of the provider, or a decision profile, is refused.</exception>
    public static IServiceCollection AddTeamDecisionModels(
        this IServiceCollection services,
        IConfiguration configuration,
        Func<string, string?>? environment = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        var choice = DecisionProviderChoice.Resolve(configuration, environment ?? Environment.GetEnvironmentVariable);
        services.AddSingleton(choice);
        if (choice.Provider is { } provider)
            services.AddOrkeonDecisionProvider(configuration, provider);

        // Every provider section is read: the active one to bind it, the others to ignore them
        // with a warning (LogDecisionProvider).
        foreach (var other in DecisionProviderDescriptor.All.Where(d => d != choice.Provider))
            services.DeclareSettingsShape(other.Section, typeof(SystemOneProviderOptions));

        services.AddOrkeonDecisionProfiles(configuration);
        return services;
    }

    /// <summary>
    /// Logs the active decision provider (its model, its address, named or deduced) and one warning
    /// per provider section the choice ignores. Says nothing when no choice is registered.
    /// </summary>
    /// <param name="services">The built container.</param>
    public static void LogDecisionProvider(IServiceProvider services)
    {
        ArgumentNullException.ThrowIfNull(services);

        var choice = services.GetService<DecisionProviderChoice>();
        if (choice is null)
            return;

        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(DecisionModelRegistration));
        var named = choice.HasProvider && choice.How == DecisionProviderSelection.Named;
        if (choice.Provider is { } provider)
        {
            var options = services.GetRequiredService<IOptions<SystemOneProviderOptions>>().Value;
            if (logger.IsEnabled(LogLevel.Information))
                LogDecisionProviderActive(logger, provider.Key, options.Model, options.BaseUrl, named ? "named" : "deduced");
        }

        var active = choice.Provider?.Key ?? "none";
        foreach (var section in choice.IgnoredSections)
        {
            var hint = section == DecisionProviderDescriptor.Kev.Section && !named
                ? " Kev is never deduced: name it with Orkeon:Decision:Provider."
                : string.Empty;
            LogDecisionSectionIgnored(logger, section, active, hint);
        }
    }

    [LoggerMessage(EventId = 61, Level = LogLevel.Information, Message = "Decision provider {Provider}: model {Model}, address {Address}, {How}")]
    private static partial void LogDecisionProviderActive(ILogger logger, string provider, string model, Uri address, string how);

    [LoggerMessage(EventId = 62, Level = LogLevel.Warning, Message = "{Section} is ignored: the active decision provider is {Provider}.{Hint}")]
    private static partial void LogDecisionSectionIgnored(ILogger logger, string section, string provider, string hint);
}
