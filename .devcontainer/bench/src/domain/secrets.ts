/**
 * What the bench looks for in the archive of a run so that no key leaks into a workbook
 * (`INV-SECRETS`, plan § 2 bis): the values the run was given, and the shapes of the common API
 * keys. A finding names where and what kind, never the value.
 */
export const SECRET_SHAPES: readonly { readonly kind: string; readonly pattern: RegExp }[] = [
  { kind: 'an OpenAI-style key (sk-…)', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { kind: 'an Anthropic-style key (sk-ant-…)', pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/ },
  { kind: 'an AWS access key (AKIA…)', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'a GitHub token (gh?_…)', pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/ },
  { kind: 'a Slack token (xox?-…)', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: 'a bearer token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/ },
];

/** A value shorter than this is never looked for as a secret: it would match by chance. */
export const MIN_SECRET_LENGTH = 8;

/**
 * What `text` holds that looks like a key: each of `known` (the secret values the run was given)
 * found in it, and each shape matched. One line per kind, none repeated.
 */
export function findSecrets(text: string, known: readonly string[] = []): string[] {
  const found: string[] = [];
  if (known.some((value) => value.length >= MIN_SECRET_LENGTH && text.includes(value))) {
    found.push('a key the run was given');
  }
  for (const shape of SECRET_SHAPES) {
    if (shape.pattern.test(text)) {
      found.push(shape.kind);
    }
  }
  return found;
}
