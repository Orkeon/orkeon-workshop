import Ajv2020Module, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

import type { SchemaValidation, SchemaValidator } from '../application/ports/schema-validator.js';

/** JSON Schema 2020-12 through Ajv, every violation reported, the formats of `ajv-formats` known. */
// Both packages are CommonJS: what Node hands an ES module as the default import is the class itself, whatever the typings say.
const Ajv2020 = Ajv2020Module as unknown as typeof Ajv2020Module.default;
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

export class AjvSchemaValidator implements SchemaValidator {
  private readonly ajv = addFormats(new Ajv2020({ allErrors: true, strict: false, validateFormats: true }));

  validate(schema: unknown, document: unknown): SchemaValidation {
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
      return { schemaError: 'the schema is not a JSON object', violations: [] };
    }
    let validate: ValidateFunction;
    try {
      validate = this.ajv.compile(schema);
    } catch (error) {
      return { schemaError: `the schema is not a valid JSON Schema: ${(error as Error).message}`, violations: [] };
    }
    if (validate(document)) {
      return { schemaError: null, violations: [] };
    }
    return { schemaError: null, violations: (validate.errors ?? []).map(describe) };
  }
}

function describe(error: ErrorObject): string {
  const path = error.instancePath === '' ? '/' : error.instancePath;
  const message = error.message ?? error.keyword;
  const extra = error.keyword === 'additionalProperties' && typeof error.params.additionalProperty === 'string' ? ` (${error.params.additionalProperty})` : '';
  return `${path} ${message}${extra}`;
}
