using System.Globalization;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Orkeon.Application.Interfaces.LLM;
using Orkeon.Application.Interfaces.Ports;
using Orkeon.Domain.Constants.Llm;
using Orkeon.Domain.SharedKernel;
using Orkeon.Domain.SharedKernel.ValueObjects;
using Orkeon.Infrastructure.LLMs;
using Orkeon.Infrastructure.LLMs.Adapters;

namespace SampleTeam.Host.Composition;

/// <summary>
/// Registers the LLM provider of the team from the <c>Llm</c> configuration section.
/// </summary>
/// <remarks>
/// <para>
/// Orkeon rc.4 has no public <c>AddOrkeonLlmProvider</c>: the runner does this in a private
/// method of <c>Orkeon.Hosting.RunnerHost</c> (<c>RegisterLlmProvider</c>), which this class
/// reproduces so that a C# team reads the SAME settings as <c>orkeon run</c>
/// (<c>appsettings.json</c>, or <c>ORKEON_Llm__BaseUrl</c>, <c>ORKEON_Llm__Model</c>,
/// <c>ORKEON_Llm__ApiKey</c>... in the environment). The provider is inferred from
/// <c>Llm:BaseUrl</c> by <see cref="ILlmProviderFactory"/> (localhost / port 11434 means
/// Ollama), then from the model name, then from the key shape.
/// </para>
/// <para>
/// On Orkeon <c>main</c> (24ab0d0) <c>AddOrkeonLlmProvider</c> exists in Orkeon.Infrastructure,
/// for a provider the caller builds; reading the <c>Llm</c> section is still private to
/// <c>RunnerHost</c>, hence this class.
/// </para>
/// <para>
/// It must run BEFORE <c>AddOrkeonInfrastructure</c>: the infrastructure default is an
/// OpenAI provider without a key, registered with TryAdd.
/// </para>
/// </remarks>
internal static class LlmProviderRegistration
{
    /// <summary>Configuration section, at the root (not under <c>Orkeon:</c>).</summary>
    public const string Section = "Llm";

    /// <summary>
    /// Adds <see cref="IBasicLlmProvider"/> and <see cref="IChatClient"/> for the configured
    /// model, or the echo provider when no <c>Llm</c> section exists.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">Host configuration.</param>
    /// <returns><paramref name="services"/>.</returns>
    public static IServiceCollection AddTeamLlmProvider(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        var section = configuration.GetSection(Section);
        if (!section.Exists())
            return services.AddEchoLlmProvider();

        var llmConfig = ReadConfig(section);
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

    /// <summary>Reads the <c>Llm</c> section the way the runner does.</summary>
    internal static LlmConfig ReadConfig(IConfigurationSection section)
    {
        var config = LlmConfig.Create(section["Model"] ?? LlmDefaults.DefaultModelName) with
        {
            BaseUrl = section["BaseUrl"] is { } baseUrl ? new Uri(baseUrl) : null,
#pragma warning disable CS0618 // ApiKey is obsolete in favour of secret names; the runner still reads Llm:ApiKey and a team must behave the same.
            ApiKey = section["ApiKey"],
#pragma warning restore CS0618
            // Invariant parse: "0.7" must not become 7 on a comma-decimal locale.
            Temperature = double.TryParse(section["Temperature"], NumberStyles.Float, CultureInfo.InvariantCulture, out var temperature) ? temperature : 0.7,
            // Absent = not pinned: the provider sends the model's documented maximum.
            MaxTokens = int.TryParse(section["MaxTokens"], NumberStyles.Integer, CultureInfo.InvariantCulture, out var maxTokens) ? maxTokens : null,
            TimeoutSeconds = int.TryParse(section["TimeoutSeconds"], NumberStyles.Integer, CultureInfo.InvariantCulture, out var timeout) ? timeout : 30,
            Thinking = ReadThinking(section.GetSection("Thinking")),
        };

        return int.TryParse(section["MaxRetries"], NumberStyles.Integer, CultureInfo.InvariantCulture, out var maxRetries)
            ? config with { MaxRetries = Math.Max(0, maxRetries) }
            : config;
    }

    private static LlmThinkingConfig? ReadThinking(IConfigurationSection thinking) =>
        thinking.Exists()
            ? new LlmThinkingConfig
            {
                Enabled = bool.TryParse(thinking["Enabled"], out var enabled) ? enabled : null,
                Effort = thinking["Effort"],
            }
            : null;
}

/// <summary>
/// Fallback <see cref="ILlmProvider"/> used when no <c>Llm</c> section is configured: it
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
