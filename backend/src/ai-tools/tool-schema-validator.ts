import { BadRequestException } from '@nestjs/common';

type JsonSchema = Record<string, any>;

export function validateToolArguments(schema: JsonSchema, value: unknown): void {
  const errors = validateSchema(schema, value, '$');
  if (errors.length > 0) {
    throw new BadRequestException({
      code: 'AI_TOOL_ARGUMENTS_INVALID',
      message: 'Tool arguments do not match schema',
      errors,
    });
  }
}

function validateSchema(schema: JsonSchema, value: unknown, path: string): string[] {
  const errors: string[] = [];

  if (value === null) {
    if (schema.nullable) {
      return errors;
    }
    errors.push(`${path}: value is null`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value must be one of ${schema.enum.join(', ')}`);
    return errors;
  }

  const expectedType = schema.type as string | undefined;
  if (expectedType) {
    const typeError = matchesType(expectedType, value);
    if (typeError) {
      errors.push(`${path}: ${typeError}`);
      return errors;
    }
  }

  if (expectedType === 'string') {
    if (typeof schema.minLength === 'number' && (value as string).length < schema.minLength) {
      errors.push(`${path}: string is shorter than ${schema.minLength}`);
    }
    if (typeof schema.maxLength === 'number' && (value as string).length > schema.maxLength) {
      errors.push(`${path}: string is longer than ${schema.maxLength}`);
    }
    return errors;
  }

  if (expectedType === 'integer' || expectedType === 'number') {
    if (typeof schema.minimum === 'number' && (value as number) < schema.minimum) {
      errors.push(`${path}: number is smaller than ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && (value as number) > schema.maximum) {
      errors.push(`${path}: number is larger than ${schema.maximum}`);
    }
    return errors;
  }

  if (expectedType === 'array') {
    const arrayValue = value as unknown[];
    if (typeof schema.minItems === 'number' && arrayValue.length < schema.minItems) {
      errors.push(`${path}: array has fewer than ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === 'number' && arrayValue.length > schema.maxItems) {
      errors.push(`${path}: array has more than ${schema.maxItems} items`);
    }
    if (schema.items) {
      arrayValue.forEach((item, index) => {
        errors.push(...validateSchema(schema.items, item, `${path}[${index}]`));
      });
    }
    return errors;
  }

  if (expectedType === 'object') {
    const objectValue = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    const required: string[] = schema.required ?? [];

    for (const key of required) {
      if (!(key in objectValue)) {
        errors.push(`${path}: missing required property ${key}`);
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in objectValue) {
        errors.push(...validateSchema(propertySchema as JsonSchema, objectValue[key], `${path}.${key}`));
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(objectValue)) {
        if (!(key in properties)) {
          errors.push(`${path}: unexpected property ${key}`);
        }
      }
    }

    return errors;
  }

  return errors;
}

function matchesType(expectedType: string, value: unknown): string | null {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string' ? null : 'expected string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'expected number';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value) ? null : 'expected integer';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'expected boolean';
    case 'array':
      return Array.isArray(value) ? null : 'expected array';
    case 'object':
      return isPlainObject(value) ? null : 'expected object';
    default:
      return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}