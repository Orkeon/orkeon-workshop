/**
 * The Orkeon the harness references were established on (D110, D115). Orkeon 1.2.0 (tag `v1.2.0`,
 * commit a9f3878) is the release they were written on; the workshop then moved to Orkeon's `main` at
 * 4709278, which carries the fix of #402 (MCP arguments) no release has yet: the image builds that
 * commit from its sources, and `orkeon --version` prints `orkeon 1.2.0-src.20261117.g4709278`.
 * Another version gets a warning from `doctor`. When the pin is a release again,
 * `REFERENCE_ORKEON_IS_RELEASE` is true and the released version is the reference too.
 */
export const REFERENCE_ORKEON_RELEASE = '1.2.0';

/** The commit the references were checked on, as a source build names it (`g<7 characters>`). */
export const REFERENCE_ORKEON_COMMIT = '4709278';

/** True when the reference commit is the commit of the tag `v<REFERENCE_ORKEON_RELEASE>`. */
export const REFERENCE_ORKEON_IS_RELEASE = false;

/** The version `orkeon --version` prints for the reference: the build of the image. */
export const REFERENCE_ORKEON_VERSION = REFERENCE_ORKEON_IS_RELEASE
  ? REFERENCE_ORKEON_RELEASE
  : `${REFERENCE_ORKEON_RELEASE}-src.20261117.g${REFERENCE_ORKEON_COMMIT}`;

/**
 * Extracts a semver-like version from `orkeon --version` output, or null. The build metadata
 * (`+<commit>`) is left out: `orkeon 1.2.0+a9f3878aca94` reads `1.2.0`.
 */
export function extractVersion(output: string): string | null {
  const match = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(output);
  return match === null ? null : match[0];
}

/**
 * True when a version read by `extractVersion` is the reference: the build of the sources at the
 * reference commit, which `orkeon-update.sh --source` and the image name
 * `<version>-src.<commit date>.g<commit>` (`1.2.0-src.20261117.g4709278`), or, when the reference
 * is a release, the released version itself. A source build of another commit, a pre-release and any
 * other version are not.
 */
export function isReferenceVersion(version: string): boolean {
  if (REFERENCE_ORKEON_IS_RELEASE && version === REFERENCE_ORKEON_RELEASE) {
    return true;
  }
  const prefix = `${REFERENCE_ORKEON_RELEASE}-src.`;
  return version.startsWith(prefix) && new RegExp(`^\\d{8}\\.g${REFERENCE_ORKEON_COMMIT}$`).test(version.slice(prefix.length));
}
