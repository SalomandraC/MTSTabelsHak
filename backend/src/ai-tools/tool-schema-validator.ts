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
  const expectedTypes = normalizeExpectedTypes(schema.type);

  if (value === null) {
    if (schema.nullable || expectedTypes.includes('null')) {
      return errors;
    }
    errors.push(`${path}: value is null`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value must be one of ${schema.enum.join(', ')}`);
    return errors;
  }

  const actualType = detectType(value);

  if (expectedTypes.length > 0 && !isTypeAllowed(expectedTypes, actualType)) {
    errors.push(`${path}: expected ${formatExpectedTypes(expectedTypes)}`);
    return errors;
  }

  if (actualType === 'string') {
    if (typeof schema.minLength === 'number' && (value as string).length < schema.minLength) {
      errors.push(`${path}: string is shorter than ${schema.minLength}`);
    }
    if (typeof schema.maxLength === 'number' && (value as string).length > schema.maxLength) {
      errors.push(`${path}: string is longer than ${schema.maxLength}`);
    }
    return errors;
  }

  if (actualType === 'integer' || actualType === 'number') {
    if (typeof schema.minimum === 'number' && (value as number) < schema.minimum) {
      errors.push(`${path}: number is smaller than ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && (value as number) > schema.maximum) {
      errors.push(`${path}: number is larger than ${schema.maximum}`);
    }
    return errors;
  }

  if (actualType === 'array') {
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

  if (actualType === 'object') {
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

function normalizeExpectedTypes(type: unknown): string[] {
  if (Array.isArray(type)) {
    return type.filter((item): item is string => typeof item === 'string');
  }

  if (typeof type === 'string') {
    return [type];
  }

  return [];
}

function detectType(value: unknown): 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'string') {
    return 'string';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }

  return 'object';
}

function isTypeAllowed(expectedTypes: string[], actualType: string): boolean {
  return expectedTypes.some((expectedType) => {
    if (expectedType === actualType) {
      return true;
    }

    if (expectedType === 'number' && actualType === 'integer') {
      return true;
    }

    return false;
  });
}

function formatExpectedTypes(expectedTypes: string[]): string {
  if (expectedTypes.length === 1) {
    return expectedTypes[0];
  }

  return `one of ${expectedTypes.join(', ')}`;
}