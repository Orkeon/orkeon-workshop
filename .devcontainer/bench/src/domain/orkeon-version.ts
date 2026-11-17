/**
 * The Orkeon version the harness references were established on: the released Orkeon 1.2.0 (tag
 * `v1.2.0`, commit a9f3878), which the published CLI prints as `orkeon 1.2.0` (D110). Another version
 * gets a warning from `doctor`.
 */
export const REFERENCE_ORKEON_VERSION = '1.2.0';

/** The commit the reference version was released from, as a source build names it (`g<7 characters>`). */
export const REFERENCE_ORKEON_COMMIT = 'a9f3878';

/**
 * Extracts a semver-like version from `orkeon --version` output, or null. The build metadata
 * (`+<commit>`) is left out: `orkeon 1.2.0+a9f3878aca94` reads `1.2.0`.
 */
export function extractVersion(output: string): string | null {
  const match = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(output);
  return match === null ? null : match[0];
}

/**
 * True when a version read by `extractVersion` is the reference: the released version itself, or the
 * build of its sources at the reference commit, which `orkeon-update.sh --source` and the image name
 * `<version>-src.<commit date>.g<commit>` (`1.2.0-src.20261116.ga9f3878`). A source build of another
 * commit, a pre-release and any other version are not.
 */
export function isReferenceVersion(version: string): boolean {
  if (version === REFERENCE_ORKEON_VERSION) {
    return true;
  }
  const prefix = `${REFERENCE_ORKEON_VERSION}-src.`;
  return version.startsWith(prefix) && new RegExp(`^\\d{8}\\.g${REFERENCE_ORKEON_COMMIT}$`).test(version.slice(prefix.length));
}
