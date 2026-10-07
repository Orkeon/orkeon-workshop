using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Orkeon.Application.Interfaces.LLM;
using Orkeon.Application.Interfaces.Ports;
using Orkeon.Domain.SharedKernel;
using Orkeon.Domain.SharedKernel.ValueObjects;
using Orkeon.Infrastructure.DependencyInjection;
using Orkeon.Infrastructure.LLMs;
using Orkeon.Infrastructure.LLMs.Adapters;
using Orkeon.Infrastructure.LLMs.Profiles;

namespace SampleTeam.Host.Composition;

/// <summary>
/// Registers the LLM providers of the team from the <c>Llm</c> configuration section: the
/// default one and every named profile under <c>Llm:Profiles:&lt;name&gt;</c>.
/// </summary>
/// <remarks>
/// <para>
/// Mirrors the private <c>RegisterLlmProvider</c> of <c>Orkeon.Hosting.RunnerHost</c> on Orkeon
/// <c>main</c> (77ac8a9), so that a C# team reads the SAME settings as <c>orkeon run</c>
/// (<c>appsettings.json</c>, or <c>ORKEON_Llm__BaseUrl</c>, <c>ORKEON_Llm__Model</c>,
/// <c>ORKEON_Llm__ApiKeyEnvVar</c>... in the environment). The reading itself is Orkeon's public
/// <see cref="LlmSettings"/>: a default provider exists when a key of the section other than
/// <c>Profiles</c> holds a value; a key left out sets nothing (no <c>Temperature</c> sends
/// none); a number or a switch that cannot be read is refused, in the default section as in a
/// profile; <c>ApiKeyEnvVar</c> names the variable holding the key. The provider is inferred from
/// <c>Llm:BaseUrl</c> by <see cref="ILlmProviderFactory"/> (localhost / port 11434 means
/// Ollama), then from the model name, then from the key shape.
/// </para>
/// <para>
/// A provider the factory builds, the default one and each profile's, is limited by the host's
/// <c>RateLimiting</c> section where it enters the runtime: every model call takes one lease
/// there. The echo provider, registered by hand below, is not.
/// </para>
/// <para>
/// The infrastructure registers no model of its own: it serves <c>ILlmProvider</c> from the
/// <see cref="IBasicLlmProvider"/> registered here, and a container without one says so at its
/// first LLM resolution. At rc.4 it fell back, with TryAdd, on an OpenAI provider without a
/// key, which is why this registration comes before <c>AddOrkeonInfrastructure</c>, as in
/// <c>RunnerHost</c>.
/// </para>
/// </remarks>
internal static class LlmProviderRegistration
{
    /// <summary>
    /// Adds the named profiles, then <see cref="IBasicLlmProvider"/> and <see cref="IChatClient"/>
    /// for the default model, or the echo provider when the settings configure no default.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">Host configuration.</param>
    /// <returns><paramref name="services"/>.</returns>
    /// <exception cref="InvalidOperationException">The default section or a profile is invalid (a
    /// reserved profile name, an invalid <c>BaseUrl</c>, a value that is not a number or a switch
    /// where one is expected).</exception>
    public static IServiceCollection AddTeamLlmProvider(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        // Llm:Profiles:<name>: the providers an agent or a task may name. Read and validated
        // now, so a bad profile fails the host build with the key to fix.
        services.AddOrkeonLlmProfiles(configuration);

        if (!LlmSettings.HasDefault(configuration))
            return services.AddEchoLlmProvider();

        var llmConfig = LlmSettings.ReadDefault(configuration);
        services.AddSingleton<IBasicLlmProvider>(sp => sp.GetRequiredService<ILlmProviderFactory>().Create(llmConfig));
        services.AddSingleton<IChatClient>(sp =>
        {
            var basic = sp.GetRequiredService<IBasicLlmProvider>();
            if (basic is LlmProviderAdapter adapter)
                return new LlmProviderToChatClientAdapter(adapter.UnderlyingProvider, llmConfig, sp.GetService<IToolCallParser>());
            throw new InvalidOperationException($"LLM provider for model '{llmConfig.Model}' does not expose ILlmProvider.");
        });
        return services;
    }

    /// <summary>
    /// Registers a provider that replays the prompt instead of answering it: a run then
    /// needs no model and no network, which is what the startup tests rely on.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns><paramref name="services"/>.</returns>
    public static IServiceCollection AddEchoLlmProvider(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddSingleton<EchoLlmProvider>();
        services.AddSingleton<IBasicLlmProvider>(sp => new LlmProviderAdapter(sp.GetRequiredService<EchoLlmProvider>()));
        services.AddSingleton<IChatClient>(sp => new LlmProviderToChatClientAdapter(
            sp.GetRequiredService<EchoLlmProvider>(), textFallbackParser: sp.GetService<IToolCallParser>()));
        return services;
    }
}

/// <summary>
/// Fallback <see cref="ILlmProvider"/> used when the settings configure no default provider: it
/// returns the last user message as the answer (same behaviour as the runner's echo
/// provider, which lives in <c>Orkeon.Scripting</c>). It counts its calls so a test can
/// prove that loading a crew never reaches the model.
/// </summary>
internal sealed class EchoLlmProvider : ILlmProvider
{
    private int _calls;

    /// <summary>Number of generation or chat calls received.</summary>
    public int Calls => Volatile.Read(ref _calls);

    /// <inheritdoc />
    public string Name => "echo";

    /// <inheritdoc />
    public Task<LlmResponse> GenerateAsync(string prompt, LlmConfig? config = null, CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref _calls);
        return Task.FromResult(new LlmResponse { Content = prompt, TokensUsed = 0 });
    }

    /// <inheritdoc />
    public Task<LlmResponse> ChatAsync(LlmMessage[] messages, LlmConfig? config = null, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(messages);
        Interlocked.Increment(ref _calls);
        var lastUser = messages.LastOrDefault(m => string.Equals(m.Role, "user", StringComparison.OrdinalIgnoreCase));
        return Task.FromResult(new LlmResponse { Content = lastUser?.Content ?? string.Empty, TokensUsed = 0 });
    }
}
