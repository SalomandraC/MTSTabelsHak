import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { CustomHardBreak } from './custom-hard-break';
import { RootBlock } from './root-block';

const RootDocument = Document.extend({
  content: 'rootblock+',
});

function createEditor() {
  return new Editor({
    extensions: [
      RootDocument,
      RootBlock,
      CustomHardBreak,
      StarterKit.configure({
        document: false,
        hardBreak: false,
      }),
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'rootblock',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Привет' }],
            },
          ],
        },
      ],
    },
  });
}

describe('RootBlock shortcuts', () => {
  const editors: Editor[] = [];

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
  });

  it('uses Enter as a hard break inside a regular text block', () => {
    const editor = createEditor();
    editors.push(editor);

    editor.commands.setTextSelection(8);

    expect(editor.commands.keyboardShortcut('Enter')).toBe(true);
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'rootblock',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Привет' },
                { type: 'hardBreak' },
              ],
            },
          ],
        },
      ],
    });
  });

  it('uses Mod-Enter to create a new root block below', () => {
    const editor = createEditor();
    editors.push(editor);

    editor.commands.setTextSelection(8);

    expect(editor.commands.keyboardShortcut('Mod-Enter')).toBe(true);
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'rootblock',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Привет' }],
            },
          ],
        },
        {
          type: 'rootblock',
          content: [{ type: 'paragraph' }],
        },
      ],
    });
  });

  it('uses Mod-X to delete the current root block', () => {
    const editor = new Editor({
      extensions: [
        RootDocument,
        RootBlock,
        CustomHardBreak,
        StarterKit.configure({
          document: false,
          hardBreak: false,
        }),
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'rootblock',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Первый' }],
              },
            ],
          },
          {
            type: 'rootblock',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Второй' }],
              },
            ],
          },
        ],
      },
    });
    editors.push(editor);

    editor.commands.setTextSelection(4);

    expect(editor.commands.keyboardShortcut('Mod-x')).toBe(true);
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'rootblock',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Второй' }],
            },
          ],
        },
      ],
    });
  });

  it('keeps one empty root block when deleting the last remaining block', () => {
    const editor = createEditor();
    editors.push(editor);

    editor.commands.setTextSelection(4);

    expect(editor.commands.keyboardShortcut('Mod-x')).toBe(true);
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'rootblock',
          content: [{ type: 'paragraph' }],
        },
      ],
    });
  });
});
