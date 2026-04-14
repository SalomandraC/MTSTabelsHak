import { validateToolArguments } from '../src/ai-tools/tool-schema-validator';

describe('tool-schema-validator', () => {
  it('accepts null when schema type includes null', () => {
    const schema = {
      type: 'object',
      required: ['parentNodeId'],
      properties: {
        parentNodeId: { type: ['string', 'null'] },
      },
      additionalProperties: false,
    };

    expect(() =>
      validateToolArguments(schema, {
        parentNodeId: null,
      }),
    ).not.toThrow();
  });

  it('rejects value with wrong type for union schema', () => {
    const schema = {
      type: 'object',
      required: ['parentNodeId'],
      properties: {
        parentNodeId: { type: ['string', 'null'] },
      },
      additionalProperties: false,
    };

    expect(() =>
      validateToolArguments(schema, {
        parentNodeId: 123,
      }),
    ).toThrow();
  });

  it('applies object child validation for union object/null', () => {
    const schema = {
      type: 'object',
      required: ['meta'],
      properties: {
        meta: {
          type: ['object', 'null'],
          required: ['spaceId'],
          properties: {
            spaceId: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    };

    expect(() =>
      validateToolArguments(schema, {
        meta: {
          spaceId: 'space-1',
        },
      }),
    ).not.toThrow();

    expect(() =>
      validateToolArguments(schema, {
        meta: {
          spaceId: '',
        },
      }),
    ).toThrow();
  });
});
