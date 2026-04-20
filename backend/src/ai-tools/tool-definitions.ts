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

const getRecordsSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['datasheetId'],
  properties: {
    datasheetId: { type: 'string', minLength: 1 },
    viewId: { type: 'string' },
    pageSize: { type: 'integer', minimum: 1, maximum: 1000 },
    pageNum: { type: 'integer', minimum: 1, maximum: 1000 },
    fields: {
      type: 'array',
      items: { type: 'string' },
    },
    filterByFormula: { type: 'string' },
    fieldKey: { type: 'string', enum: ['id'] },
    cellFormat: { type: 'string', enum: ['json', 'string'] },
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

const analyzeTableDataSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['datasheetId'],
  properties: {
    datasheetId: { type: 'string', minLength: 1 },
    viewId: { type: 'string' },
    pageSize: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
    pageNum: { type: 'integer', minimum: 1, maximum: 1000, default: 1 },
    fields: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: false,
};

const createWikiPageSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['title'],
  anyOf: [{ required: ['workspaceId'] }, { required: ['spaceId'] }],
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    spaceId: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1, maxLength: 255 },
    parentNodeId: { type: 'string' },
    icon: { type: 'string' },
    content: {
      oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
    },
  },
  additionalProperties: false,
};

const addTableColumnSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['spaceId', 'datasheetId', 'name', 'type'],
  properties: {
    spaceId: { type: 'string', minLength: 1 },
    datasheetId: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    type: { type: 'string', minLength: 1 },
    property: {
      type: 'object',
      additionalProperties: true,
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

const searchWorkspaceDocumentsSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['spaceId', 'query'],
  properties: {
    spaceId: { type: 'string', minLength: 1 },
    query: { type: 'string', minLength: 1 },
    pageIds: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    folderIds: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    topK: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
  },
  additionalProperties: false,
};

const getDocumentContextSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['pageId'],
  properties: {
    pageId: { type: 'string', minLength: 1 },
    maxLength: { type: 'integer', minimum: 500, maximum: 12000, default: 6000 },
  },
  additionalProperties: false,
};

const listWorkspaceNodesSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['spaceId'],
  properties: {
    spaceId: { type: 'string', minLength: 1 },
    parentNodeId: { type: ['string', 'null'] },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
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
      name: 'get_records',
      description: 'Read rows from MWS datasheet by datasheetId using canonical fld... field identifiers',
      parameters: getRecordsSchema,
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
      name: 'analyze_table_data',
      description: 'Read rows from MWS datasheet and return a compact Markdown analysis with trends and anomalies',
      parameters: analyzeTableDataSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_wiki_page',
      description: 'Create a new WikiLive page in the workspace with optional markdown or ProseMirror JSON content',
      parameters: createWikiPageSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_table_column',
      description: 'Add a new column to an MWS table (datasheet schema mutation)',
      parameters: addTableColumnSchema,
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
  {
    type: 'function',
    function: {
      name: 'search_workspace_documents',
      description: 'Search documents in a WikiLive space or folder scope and return relevant candidates',
      parameters: searchWorkspaceDocumentsSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_document_context',
      description: 'Open a WikiLive document by pageId and return its readable text content for analysis',
      parameters: getDocumentContextSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_workspace_nodes',
      description: 'List folders and documents inside a space or inside a конкретная папка by parentNodeId',
      parameters: listWorkspaceNodesSchema,
    },
  },
];

export const AI_TOOL_SCHEMA_BY_NAME: Record<string, JsonSchema> = {
  create_records: createRecordsSchema,
  patch_records: patchRecordsSchema,
  get_records: getRecordsSchema,
  delete_records: deleteRecordsSchema,
  analyze_table_data: analyzeTableDataSchema,
  create_wiki_page: createWikiPageSchema,
  add_table_column: addTableColumnSchema,
  smart_import: smartImportSchema,
  search_workspace_documents: searchWorkspaceDocumentsSchema,
  get_document_context: getDocumentContextSchema,
  list_workspace_nodes: listWorkspaceNodesSchema,
};
