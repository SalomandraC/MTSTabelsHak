import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { ListExitOnDoubleEnter } from './list-exit-on-double-enter';
import { RootBlock } from './root-block';

const RootDocument = Document.extend({
  content: 'rootblock+',
});

function createEditor(content: Record<string, unknown>) {
  return new Editor({
    extensions: [
      RootDocument,
      RootBlock,
      ListExitOnDoubleEnter,
      StarterKit.configure({
        document: false,
      }),
    ],
    content,
  });
}

function setCursorInsideEmptyListParagraph(editor: Editor) {
  let selectionPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph' || node.content.size > 0) {
      return true;
    }

    const resolvedPos = editor.state.doc.resolve(pos + 1);
    let isInsideList = false;

    for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
      const ancestorType = resolvedPos.node(depth).type.name;

      if (ancestorType === 'bulletList' || ancestorType === 'orderedList' || ancestorType === 'taskList') {
        isInsideList = true;
        break;
      }
    }

    if (isInsideList) {
      selectionPos = pos + 1;
      return false;
    }

    return true;
  });

  if (selectionPos == null) {
    throw new Error('Unable to locate an empty list paragraph in test document.');
  }

  editor.commands.setTextSelection(selectionPos);
}

describe('ListExitOnDoubleEnter', () => {
  const editors: Editor[] = [];

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
  });

  it('exits a bullet list after a second Enter in an empty item', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'rootblock',
          content: [
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Первый пункт' }] }],
                },
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph' }],
                },
              ],
            },
          ],
        },
      ],
    });
    editors.push(editor);

    setCursorInsideEmptyListParagraph(editor);

    expect(editor.commands.keyboardShortcut('Enter')).toBe(true);
    expect(editor.getJSON()).toMatchObject({
      type: 'doc',
      content: [
        {
          type: 'rootblock',
          content: [
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Первый пункт' }] }],
                },
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph' }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(editor.commands.keyboardShortcut('Enter')).toBe(true);
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'rootblock',
          content: [
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Первый пункт' }] }],
                },
              ],
            },
          ],
        },
        {
          type: 'rootblock',
          content: [{ type: 'paragraph' }],
        },
      ],
    });
    expect(editor.isActive('bulletList')).toBe(false);
  });

  it('exits an ordered list after a second Enter in an empty item', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'rootblock',
          content: [
            {
              type: 'orderedList',
              attrs: { start: 3, type: null },
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Третий пункт' }] }],
                },
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph' }],
                },
              ],
            },
          ],
        },
      ],
    });
    editors.push(editor);

    setCursorInsideEmptyListParagraph(editor);

    editor.commands.keyboardShortcut('Enter');
    editor.commands.keyboardShortcut('Enter');

    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'rootblock',
          content: [
            {
              type: 'orderedList',
              attrs: { start: 3, type: null },
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Третий пункт' }] }],
                },
              ],
            },
          ],
        },
        {
          type: 'rootblock',
          content: [{ type: 'paragraph' }],
        },
      ],
    });
    expect(editor.isActive('orderedList')).toBe(false);
  });
});
