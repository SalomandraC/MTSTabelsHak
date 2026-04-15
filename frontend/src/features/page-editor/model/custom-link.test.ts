import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { describe, expect, it } from 'vitest';

import { CustomLink } from './custom-link';

function createEditor() {
  return new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      CustomLink.configure({
        openOnClick: false,
        autolink: true,
      }),
    ],
    content: '<p>hello link world</p>',
  });
}

describe('CustomLink', () => {
  it('does not keep the link mark after autolinking a typed url followed by a space', () => {
    const editor = new Editor({
      extensions: [
        Document,
        Paragraph,
        Text,
        CustomLink.configure({
          openOnClick: false,
          autolink: true,
        }),
      ],
      content: '<p></p>',
    });

    editor.commands.insertContent('https://example.com');
    editor.commands.insertContent(' ');
    editor.commands.insertContent('после');

    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'https://example.com',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://example.com',
                    target: '_blank',
                    rel: 'noopener noreferrer nofollow',
                    class: null,
                    title: null,
                  },
                },
              ],
            },
            { type: 'text', text: ' после' },
          ],
        },
      ],
    });
  });

  it('does not extend the link when typing after it', () => {
    const editor = createEditor();

    editor.commands.setTextSelection({ from: 7, to: 11 });
    editor.commands.setLink({ href: 'https://example.com' });
    editor.commands.setTextSelection(11);
    editor.commands.insertContent('!');

    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'hello ' },
            {
              type: 'text',
              text: 'link',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title: null } }],
            },
            { type: 'text', text: '! world' },
          ],
        },
      ],
    });
  });

  it('does not extend the link when typing before it', () => {
    const editor = createEditor();

    editor.commands.setTextSelection({ from: 7, to: 11 });
    editor.commands.setLink({ href: 'https://example.com' });
    editor.commands.setTextSelection(7);
    editor.commands.insertContent('?');

    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'hello ?' },
            {
              type: 'text',
              text: 'link',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title: null } }],
            },
            { type: 'text', text: ' world' },
          ],
        },
      ],
    });
  });
});
