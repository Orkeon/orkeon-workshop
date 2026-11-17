import { z } from 'zod';

import { DomainError } from './errors.js';
import { decisionProvider, type DecisionProviderKey } from './llm-target.js';
import {
  MACHINE_PROFILE,
  MACHINE_PROFILE_NAME,
  STUB_PROFILE_NAME,
  machineProfileSchema,
  namedProfile,
  namedProfileSchema,
  stubProfile,
  variableNameSchema,
  type Profile,
} from './profile.js';
import { ownProperty } from './records.js';
import { parseWith } from './schema.js';

/** Test levels, in execution order (plan § 6.1); also the keys of `report.levels`. */
export const LEVELS = ['static', 'unit', 'component', 'e2e_local', 'e2e_remote'] as const;
export type Level = (typeof LEVELS)[number];

/** What a named profile costs, in USD per million tokens, read and written: what `estimate` and L4 price a run with. */
export const priceSchema = z.object({
  input_per_million: z.number().nonnegative(),
  output_per_million: z.number().nonnegative(),
});
export type Price = z.infer<typeof priceSchema>;

/** A named profile of the configuration: the settings of the profile, and its price when the team states it. */
export const pricedProfileSchema = namedProfileSchema.extend({ price: priceSchema.optional() });

/** D2: remote cap per attempt, adjustable per team. */
export const DEFAULT_BUDGET = { local_minutes_max: 60, remote_usd_max: 2.0 } as const;
export const DEFAULT_RETENTION = { runs_keep: 10 } as const;

/**
 * D96: the decision model the bench injects into the runs of a level — `ORKEON_Orkeon__Decision__Provider`
 * and the provider's `BaseUrl`, `Model`, `ApiKeyEnvVar` (`decisionVariables`). `key_env` names the
 * variable holding the key, never the key; `price_per_call` (USD) prices a decision call for `estimate`.
 */
export const decisionBlockSchema = z.strictObject({
  provider: z.enum(['typesafe', 'liquid', 'kev']),
  base_url: z.url().optional(),
  model: z.string().trim().min(1).optional(),
  key_env: variableNameSchema.optional(),
  price_per_call: z.number().nonnegative().optional(),
});
export type DecisionBlock = z.infer<typeof decisionBlockSchema>;

const levelSettingsSchema = z
  .object({
    profile: z.string().min(1),
    repeat: z.int().positive().default(1),
    pass_at: z.int().positive().optional(),
    /** Overrides the top-level block for this level; null: no decision block for it. */
    decision: decisionBlockSchema.nullable().optional(),
  })
  .refine((level) => level.pass_at === undefined || level.pass_at <= level.repeat, {
    message: 'pass_at cannot exceed repeat',
    path: ['pass_at'],
  });

/** `tests/<slug>/bench.config.json` (plan § 6.5). */
export const benchConfigSchema = z
  .object({
    profiles: z.record(z.string().min(1), z.union([machineProfileSchema, pricedProfileSchema])).default({}),
    levels: z.partialRecord(z.enum(LEVELS), levelSettingsSchema).default({}),
    /** D96: the decision block of every level but `static`, `unit` and `component`, unless a level overrides it. */
    decision: decisionBlockSchema.optional(),
    budget: z
      .object({
        local_minutes_max: z.number().positive().default(DEFAULT_BUDGET.local_minutes_max),
        remote_usd_max: z.number().nonnegative().default(DEFAULT_BUDGET.remote_usd_max),
      })
      .default(DEFAULT_BUDGET),
    retention: z.object({ runs_keep: z.int().positive().default(DEFAULT_RETENTION.runs_keep) }).default(DEFAULT_RETENTION),
  })
  .superRefine((config, context) => {
    for (const [name, profile] of Object.entries(config.profiles)) {
      if (name === STUB_PROFILE_NAME) {
        context.addIssue({ code: 'custom', path: ['profiles', name], message: 'the stub profile is implicit and cannot be declared' });
      }
      if (name === MACHINE_PROFILE_NAME && !('source' in profile)) {
        context.addIssue({ code: 'custom', path: ['profiles', name], message: 'the machine profile must be { "source": "orkeon-settings" }' });
      }
    }
    for (const [level, settings] of Object.entries(config.levels)) {
      if (!isProfileKnown(config.profiles, settings.profile)) {
        context.addIssue({ code: 'custom', path: ['levels', level, 'profile'], message: `unknown profile "${settings.profile}"` });
      }
    }
  });
export type BenchConfig = z.infer<typeof benchConfigSchema>;

/** The configuration a team gets when `tests/<slug>/bench.config.json` does not exist yet. */
export const DEFAULT_BENCH_CONFIG: BenchConfig = benchConfigSchema.parse({});

function isProfileKnown(profiles: BenchConfig['profiles'], name: string): boolean {
  return name === MACHINE_PROFILE_NAME || name === STUB_PROFILE_NAME || ownProperty(profiles, name) !== undefined;
}

export function parseBenchConfig(input: unknown): BenchConfig {
  return parseWith(benchConfigSchema, input, 'bench.config.json');
}

/** The price of the profile `name`; null for `machine`, `stub`, an unknown profile or one without a price. */
export function priceOf(config: BenchConfig, name: string): Price | null {
  const settings = ownProperty(config.profiles, name);
  if (settings === undefined || 'source' in settings || settings.price === undefined) {
    return null;
  }
  return settings.price;
}

/** What `tokensIn` prompt tokens and `tokensOut` completion tokens cost at `price`, in USD. */
export function usdOf(tokensIn: number, tokensOut: number, price: Price): number {
  return (tokensIn * price.input_per_million + tokensOut * price.output_per_million) / 1_000_000;
}

/** A USD amount as the bench prints it: four decimals at most, two at least (`0.0123`, `2.00`). */
export function formatUsd(value: number): string {
  const four = value.toFixed(4);
  return four.endsWith('00') ? four.slice(0, -2) : four;
}

export function profileNames(config: BenchConfig): string[] {
  const names = new Set<string>([MACHINE_PROFILE_NAME, ...Object.keys(config.profiles), STUB_PROFILE_NAME]);
  return [...names];
}

/**
 * `machine` and `stub` always exist; any other name must be declared. `stubPort` is the port of
 * the running stub server, when there is one.
 */
export function profileNamed(config: BenchConfig, name: string, stubPort?: number): Profile {
  if (name === MACHINE_PROFILE_NAME) {
    return MACHINE_PROFILE;
  }
  if (name === STUB_PROFILE_NAME) {
    return stubProfile(stubPort);
  }
  const settings = ownProperty(config.profiles, name);
  if (settings === undefined || 'source' in settings) {
    throw new DomainError(`unknown profile "${name}" (known: ${profileNames(config).join(', ')})`);
  }
  const { price: _price, ...profile } = settings;
  return namedProfile(name, profile);
}

/** Levels whose runs never take a decision block: they run nothing, or run on the stub. */
const LEVELS_WITHOUT_DECISION: readonly Level[] = ['static', 'unit', 'component'];

/**
 * The decision block of `level` (D96): the level's own when it states one — null when it states
 * `null` —, else the top-level block. Without a level (`profile`, `estimate`'s generic view), the
 * top-level block. Never one for the levels run on the stub or not run at all.
 */
export function decisionOf(config: BenchConfig, level?: Level): DecisionBlock | null {
  if (level === undefined) {
    return config.decision ?? null;
  }
  if (LEVELS_WITHOUT_DECISION.includes(level)) {
    return null;
  }
  const own = ownProperty(config.levels, level);
  if (own !== undefined && own.decision !== undefined) {
    return own.decision;
  }
  return config.decision ?? null;
}

/** The section of a decision provider as an environment variable name below `ORKEON_`: `Orkeon__TypeSafe`. */
function decisionSectionVariable(provider: DecisionProviderKey): string {
  return `ORKEON_${decisionProvider(provider).section.replaceAll(':', '__')}`;
}

/** The variable that names the decision provider of a run (`Orkeon:Decision:Provider`). */
export const DECISION_PROVIDER_VARIABLE = 'ORKEON_Orkeon__Decision__Provider';

/**
 * The variables injected into a run for a decision block: the provider, and the keys of its section the
 * block states. Values only of the block — the key itself is never among them: Orkeon reads it from the
 * variable `key_env` names. Kept in memory, never written to disk.
 */
export function decisionVariables(block: DecisionBlock): Record<string, string> {
  const section = decisionSectionVariable(block.provider);
  const variables: Record<string, string> = { [DECISION_PROVIDER_VARIABLE]: block.provider };
  if (block.base_url !== undefined) {
    variables[`${section}__BaseUrl`] = block.base_url;
  }
  if (block.model !== undefined) {
    variables[`${section}__Model`] = block.model;
  }
  if (block.key_env !== undefined) {
    variables[`${section}__ApiKeyEnvVar`] = block.key_env;
  }
  return variables;
}
