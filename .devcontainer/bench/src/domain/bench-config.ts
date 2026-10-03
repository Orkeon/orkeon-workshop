import { z } from 'zod';

import { DomainError } from './errors.js';
import {
  MACHINE_PROFILE,
  MACHINE_PROFILE_NAME,
  STUB_PROFILE_NAME,
  machineProfileSchema,
  namedProfile,
  namedProfileSchema,
  stubProfile,
  type Profile,
} from './profile.js';
import { ownProperty } from './records.js';
import { parseWith } from './schema.js';

/** Test levels, in execution order (plan § 6.1); also the keys of `report.levels`. */
export const LEVELS = ['static', 'unit', 'component', 'e2e_local', 'e2e_remote'] as const;
export type Level = (typeof LEVELS)[number];

/** D2: remote cap per attempt, adjustable per team. */
export const DEFAULT_BUDGET = { local_minutes_max: 60, remote_usd_max: 2.0 } as const;
export const DEFAULT_RETENTION = { runs_keep: 10 } as const;

const levelSettingsSchema = z
  .object({
    profile: z.string().min(1),
    repeat: z.int().positive().default(1),
    pass_at: z.int().positive().optional(),
  })
  .refine((level) => level.pass_at === undefined || level.pass_at <= level.repeat, {
    message: 'pass_at cannot exceed repeat',
    path: ['pass_at'],
  });

/** `tests/<slug>/bench.config.json` (plan § 6.5). */
export const benchConfigSchema = z
  .object({
    profiles: z.record(z.string().min(1), z.union([machineProfileSchema, namedProfileSchema])).default({}),
    levels: z.partialRecord(z.enum(LEVELS), levelSettingsSchema).default({}),
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
  return namedProfile(name, settings);
}
