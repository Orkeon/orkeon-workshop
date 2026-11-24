/**
 * The Orkeon the harness references were established on (D110, D115): the released Orkeon 1.4.0 (tag
 * `v1.4.0`, commit 0389fd2), which the published CLI prints as `orkeon 1.4.0`. They were written on 1.2.0
 * (a9f3878); the workshop then followed Orkeon's `main` (4709278, then 1b480bd, the commit that cut
 * 1.3.0), built from its sources, while fixes it needed were in no release — the exception D115, which
 * the release 1.3.0 ended for Orkeon. Another version gets a warning from `doctor`. When the pin is a
 * commit of `main` again, `REFERENCE_ORKEON_IS_RELEASE` is false and the source build is the reference.
 */
export const REFERENCE_ORKEON_RELEASE = '1.4.0';

/** The commit the references were checked on, as a source build names it (`g<7 characters>`). */
export const REFERENCE_ORKEON_COMMIT = '0389fd2';

/**
 * The version the sources of the reference commit carry (`VersionPrefix` of `src/Directory.Build.props`),
 * which a source build starts with: the next release, not `REFERENCE_ORKEON_RELEASE`, once main has cut it.
 */
export const REFERENCE_ORKEON_SOURCE_VERSION = '1.4.0';

/** True when the reference commit is the commit of the tag `v<REFERENCE_ORKEON_RELEASE>`. */
export const REFERENCE_ORKEON_IS_RELEASE = true;

/** The version `orkeon --version` prints for the reference: the build of the image. */
export const REFERENCE_ORKEON_VERSION = REFERENCE_ORKEON_IS_RELEASE
  ? REFERENCE_ORKEON_RELEASE
  : `${REFERENCE_ORKEON_SOURCE_VERSION}-src.20261123.g${REFERENCE_ORKEON_COMMIT}`;

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
 * `<version of the sources>-src.<commit date>.g<commit>` (`1.4.0-src.20261123.g0389fd2`), or, when the
 * reference is a release, the released version itself. A source build of another commit, a pre-release
 * and any other version are not.
 */
export function isReferenceVersion(version: string): boolean {
  if (REFERENCE_ORKEON_IS_RELEASE && version === REFERENCE_ORKEON_RELEASE) {
    return true;
  }
  const prefix = `${REFERENCE_ORKEON_SOURCE_VERSION}-src.`;
  return version.startsWith(prefix) && new RegExp(`^\\d{8}\\.g${REFERENCE_ORKEON_COMMIT}$`).test(version.slice(prefix.length));
}
