import type { SchemaValidation, SchemaValidator } from '../../src/application/ports/schema-validator.js';

/**
 * A validator that knows `type: "object"` and `required` at the root of a schema: enough for the
 * tests of the application, where what Ajv says is the business of its own test.
 */
export class FakeSchemaValidator implements SchemaValidator {
  readonly calls: { schema: unknown; document: unknown }[] = [];

  validate(schema: unknown, document: unknown): SchemaValidation {
    this.calls.push({ schema, document });
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
      return { schemaError: 'the schema is not a JSON object', violations: [] };
    }
    const rules = schema as { type?: unknown; required?: unknown };
    const violations: string[] = [];
    const isObject = typeof document === 'object' && document !== null && !Array.isArray(document);
    if (rules.type === 'object' && !isObject) {
      violations.push('/ must be object');
    }
    if (Array.isArray(rules.required) && isObject) {
      for (const key of rules.required.filter((name): name is string => typeof name === 'string')) {
        if (!Object.hasOwn(document as object, key)) {
          violations.push(`/ must have required property '${key}'`);
        }
      }
    }
    return { schemaError: null, violations };
  }
}
