import { describe, expect, it } from 'vitest';

import { AjvSchemaValidator } from '../../src/infrastructure/ajv-schema-validator.js';

const SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['records'],
  additionalProperties: false,
  properties: {
    records: { type: 'array', items: { type: 'object', required: ['category'], properties: { category: { type: 'string', enum: ['spam', 'support'] }, when: { type: 'string', format: 'date-time' } } } },
  },
};

describe('AjvSchemaValidator', () => {
  const validator = new AjvSchemaValidator();

  it('accepts a document the schema allows', () => {
    expect(validator.validate(SCHEMA, { records: [{ category: 'spam', when: '2026-10-06T05:18:12Z' }] })).toEqual({ schemaError: null, violations: [] });
  });

  it('names every violation by its path, formats included', () => {
    const result = validator.validate(SCHEMA, { records: [{ category: 'other', when: 'yesterday' }, {}], extra: 1 });
    expect(result.schemaError).toBeNull();
    expect(result.violations).toEqual([
      '/ must NOT have additional properties (extra)',
      '/records/0/category must be equal to one of the allowed values',
      '/records/0/when must match format "date-time"',
      "/records/1 must have required property 'category'",
    ]);
  });

  it('says when the schema itself cannot be used', () => {
    expect(validator.validate('not a schema', {})).toEqual({ schemaError: 'the schema is not a JSON object', violations: [] });
    expect(validator.validate({ type: 'nothing' }, {}).schemaError).toMatch(/^the schema is not a valid JSON Schema: /);
  });
});
