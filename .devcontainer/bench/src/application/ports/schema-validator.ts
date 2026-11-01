/** What a JSON Schema says of a document. */
export interface SchemaValidation {
  /** Why the schema itself cannot be used — not an object, not a valid schema — or null when it can. */
  readonly schemaError: string | null;
  /** What the schema refuses in the document, each as `<path> <message>`; empty when the document conforms. */
  readonly violations: readonly string[];
}

/** Validates a JSON document against a JSON Schema (draft 2020-12, the formats of `ajv-formats`). */
export interface SchemaValidator {
  validate(schema: unknown, document: unknown): SchemaValidation;
}
