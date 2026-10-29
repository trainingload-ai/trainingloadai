import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

/** One compiler for model schemas and direct tool invocations. Never coerce,
 * default, or strip model input: those changes can alter the user's intent. */
const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new WeakMap<object, ValidateFunction>();

export type ToolInputIssue = { path: string; message: string };

export class ToolInputValidationError extends Error {
  readonly code = 'INVALID_INPUT';
  constructor(readonly issues: ToolInputIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
    this.name = 'ToolInputValidationError';
  }
}

function issue(error: ErrorObject): ToolInputIssue {
  const property =
    error.params.missingProperty ?? error.params.additionalProperty;
  const path = `${error.instancePath}${property ? `/${property}` : ''}` || '/';
  const expected =
    error.keyword === 'enum'
      ? `; allowed: ${error.params.allowedValues.join(', ')}`
      : '';
  return { path, message: `${error.message ?? 'invalid value'}${expected}` };
}

export function toolSchemaValidator<T = unknown>(schema: object) {
  let validate = validators.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    validators.set(schema, validate);
  }
  const compiled = validate;
  return (value: unknown) => {
    if (compiled(value)) return { success: true as const, value: value as T };
    const issues = (compiled.errors ?? [])
      .filter((error) => error.keyword !== 'if')
      .slice(0, 12)
      .map(issue);
    return {
      success: false as const,
      error: new ToolInputValidationError(issues),
    };
  };
}
