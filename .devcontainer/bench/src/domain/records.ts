/**
 * `record[key]` for the record's own keys only. A plain lookup would find inherited members, so
 * a name such as `constructor` or `toString` would pass for a declared environment or profile.
 */
export function ownProperty<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
