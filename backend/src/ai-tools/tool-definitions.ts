export type JsonSchema = Record<string, unknown>;

export interface FunctionToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

const createRecordsSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['datasheetId', 'fieldKey', 'records'],
  properties: {
    datasheetId: { type: 'string', minLength: 1 },
    fieldKey: { type: 'string', enum: ['id'] },
    records: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['fields'],
        properties: {
          fields: {
            type: 'object',
            additionalProperties: true,
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

const patchRecordsSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['datasheetId', 'fieldKey', 'records'],
  properties: {
    datasheetId: { type: 'string', minLength: 1 },
    fieldKey: { type: 'string', enum: ['id'] },
    records: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['recordId', 'fields'],
        properties: {
          recordId: { type: 'string', minLength: 1 },
          fields: {
            type: 'object',
            additionalProperties: true,
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

const deleteRecordsSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['datasheetId', 'recordIds'],
  properties: {
    datasheetId: { type: 'string', minLength: 1 },
    recordIds: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
  },
  additionalProperties: false,
};

const smartImportSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['workspaceId', 'pageId', 'contextText'],
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    pageId: { type: 'string', minLength: 1 },
    contextText: { type: 'string', minLength: 20 },
    hints: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        preferredViewType: { type: 'string' },
        maxCandidates: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

export const AI_TOOL_DEFINITIONS: FunctionToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_records',
      description: 'Create new rows in MWS datasheet using canonical fld... field identifiers',
      parameters: createRecordsSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'patch_records',
      description: 'Update existing rows in MWS datasheet by recordId using canonical fld... field identifiers',
      parameters: patchRecordsSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_records',
      description: 'Delete rows in MWS datasheet by recordIds',
      parameters: deleteRecordsSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'smart_import',
      description: 'Analyze page context and suggest the best MWS table embed candidate',
      parameters: smartImportSchema,
    },
  },
];

export const AI_TOOL_SCHEMA_BY_NAME: Record<string, JsonSchema> = {
  create_records: createRecordsSchema,
  patch_records: patchRecordsSchema,
  delete_records: deleteRecordsSchema,
  smart_import: smartImportSchema,
};