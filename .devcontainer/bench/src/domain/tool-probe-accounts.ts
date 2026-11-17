/**
 * The throw-away mail and drive accounts of the tool-dump run. Since Orkeon 0ea39d9 a crew naming
 * an `email_*` or `drive_*` tool is refused before any model call when no *ready* account grants
 * that tool's right (`RefuseUngrantedAccountToolsAsync`, `EmailRightsCheck`, `DriveRightsCheck`):
 * the crew that lists every tool needs one account of each family granting every right.
 *
 * Neither account is ever reached — the recorder answers the only model call, no tool runs — and
 * nothing in them is a secret:
 * - the mail account signs in with a password (`Auth:Method Password`), read from a variable the
 *   bench sets for the run to a placeholder; its servers are `localhost` port 1;
 * - the drive account is a OneDrive one (no client secret), ready once a token file sits in the
 *   store: a placeholder token under `<credentials>/drive/<key>.json`, in the run's temporary
 *   folder, removed with it. `<key>` is Orkeon's `DriveCredentialProvider.TokenKey`: the account
 *   name, `-`, the first 12 hex digits of the SHA-256 of
 *   `Provider|ClientId|TokenEndpoint|Scopes` — fixed here, since every input is
 *   (`PROBE_DRIVE_TOKEN_IDENTITY`, checked by a test).
 */

export const PROBE_ACCOUNT = 'probe';
export const PROBE_PASSWORD_VARIABLE = 'ORKEON_BENCH_PROBE_PASSWORD';
const PLACEHOLDER = 'orkeon-bench-probe-placeholder';
const DRIVE_CLIENT_ID = 'orkeon-bench-probe';

/** What `TokenKey` hashes for the probe drive account: OneDrive, its client id, the `consumers` token endpoint, the read-write scopes. */
export const PROBE_DRIVE_TOKEN_IDENTITY = `OneDrive|${DRIVE_CLIENT_ID}|https://login.microsoftonline.com/consumers/oauth2/v2.0/token|https://graph.microsoft.com/Files.ReadWrite offline_access`;
export const PROBE_DRIVE_TOKEN_DIGEST = 'ba8875990393';

/** The credentials folder of the run, relative to its temporary folder. */
export const PROBE_CREDENTIALS_FOLDER = 'credentials';

export interface ProbeAccounts {
  readonly variables: Readonly<Record<string, string>>;
  /** Paths relative to the credentials folder. */
  readonly files: readonly { readonly path: string; readonly content: string }[];
}

/** The variables and the token file that make one mail and one drive account ready, over `credentialsDirectory`. */
export function probeAccounts(credentialsDirectory: string): ProbeAccounts {
  const email = `ORKEON_Orkeon__Tools__Email__Accounts__${PROBE_ACCOUNT}__`;
  const drive = `ORKEON_Orkeon__Tools__Drive__Accounts__${PROBE_ACCOUNT}__`;
  return {
    variables: {
      ORKEON_Orkeon__Tools__Email__CredentialsDirectory: credentialsDirectory,
      ORKEON_Orkeon__Tools__Email__DefaultAccount: PROBE_ACCOUNT,
      [`${email}Provider`]: 'Custom',
      [`${email}Address`]: 'probe@example.invalid',
      [`${email}Rights`]: 'Read, Organize, Draft, Send, Delete, Purge',
      [`${email}Incoming__Protocol`]: 'Imap',
      [`${email}Incoming__Host`]: 'localhost',
      [`${email}Incoming__Port`]: '1',
      [`${email}Incoming__Security`]: 'None',
      [`${email}Outgoing__Protocol`]: 'Smtp',
      [`${email}Outgoing__Host`]: 'localhost',
      [`${email}Outgoing__Port`]: '1',
      [`${email}Outgoing__Security`]: 'None',
      [`${email}Auth__Method`]: 'Password',
      [`${email}Auth__Username`]: PROBE_ACCOUNT,
      [`${email}Auth__PasswordEnvVar`]: PROBE_PASSWORD_VARIABLE,
      [`${email}Send__AllowedRecipients__0`]: 'probe@example.invalid',
      [PROBE_PASSWORD_VARIABLE]: PLACEHOLDER,
      ORKEON_Orkeon__Tools__Drive__CredentialsDirectory: credentialsDirectory,
      ORKEON_Orkeon__Tools__Drive__DefaultAccount: PROBE_ACCOUNT,
      [`${drive}Provider`]: 'OneDrive',
      [`${drive}Rights`]: 'Read, Write, Organize, Delete, Share',
      [`${drive}Auth__ClientId`]: DRIVE_CLIENT_ID,
      [`${drive}Share__AllowPublicLinks`]: 'true',
    },
    files: [
      {
        path: `drive/${PROBE_ACCOUNT}-${PROBE_DRIVE_TOKEN_DIGEST}.json`,
        content: `${JSON.stringify({ AccessToken: PLACEHOLDER, RefreshToken: PLACEHOLDER, ExpiresAt: '2000-01-01T00:00:00+00:00', Scopes: [] }, null, 2)}\n`,
      },
    ],
  };
}

/** True for a variable that declares mail or drive accounts: the caller's are left out of the probe run, which has its own. */
export function isAccountVariable(name: string): boolean {
  return /^(ORKEON_)?Orkeon__Tools__(Email|Drive)__/i.test(name);
}
