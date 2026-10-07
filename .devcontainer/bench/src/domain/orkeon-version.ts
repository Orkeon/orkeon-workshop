/**
 * The Orkeon version the harness references were established on: Orkeon `main` at 80fdefe, as the
 * image builds it from the sources (D32). Another version gets a warning from `doctor`.
 */
export const REFERENCE_ORKEON_VERSION = '1.0.0-rc.4.src.20261007.g80fdefe';

/** Extracts a semver-like version from `orkeon --version` output, or null. */
export function extractVersion(output: string): string | null {
  const match = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(output);
  return match === null ? null : match[0];
}
