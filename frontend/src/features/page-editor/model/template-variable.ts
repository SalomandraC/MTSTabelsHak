import { Node, mergeAttributes } from '@tiptap/core';

export type TemplateVariableAttrs = {
  key: string;
  label: string;
  description?: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    templateVariable: {
      insertTemplateVariable: (attrs: TemplateVariableAttrs) => ReturnType;
    };
  }
}

export const TemplateVariable = Node.create({
  name: 'templateVariable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-template-key'),
        renderHTML: (attributes) => ({ 'data-template-key': attributes.key }),
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-template-label') ?? element.textContent ?? '',
        renderHTML: (attributes) => ({ 'data-template-label': attributes.label }),
      },
      description: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-template-description') ?? '',
        renderHTML: (attributes) => ({ 'data-template-description': attributes.description }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="template-variable"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const label = node.attrs.label || node.attrs.key || 'Параметр';

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'template-variable',
        class: 'template-variable-chip',
        title: node.attrs.description || `Параметр шаблона: ${label}`,
      }),
      `{{${label}}}`,
    ];
  },

  addCommands() {
    return {
      insertTemplateVariable:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent([
            {
              type: this.name,
              attrs,
            },
            {
              type: 'text',
              text: ' ',
            },
          ]);
        },
    };
  },
});
