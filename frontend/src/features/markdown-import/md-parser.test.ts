import { describe, expect, it } from 'vitest';

import { parseMarkdown, validateFile } from './md-parser';
import type { ProseMirrorNode } from './types';

function getTextContent(node: ProseMirrorNode): string {
  if (node.type === 'text') {
    return node.text ?? '';
  }

  return (node.content ?? []).map(getTextContent).join('');
}

describe('validateFile', () => {
  it('rejects files with a non-markdown extension', () => {
    expect(validateFile({ name: 'notes.txt', size: 128 })).toEqual({
      ok: false,
      error: 'Поддерживаются только файлы .md',
    });
  });

  it('rejects markdown files larger than 5 MB', () => {
    expect(validateFile({ name: 'notes.md', size: 5 * 1024 * 1024 + 1 })).toEqual({
      ok: false,
      error: 'Файл слишком большой (максимум 5 МБ)',
    });
  });

  it('accepts valid markdown files', () => {
    expect(validateFile({ name: 'notes.MD', size: 1024 })).toEqual({ ok: true });
  });
});

describe('parseMarkdown', () => {
  it.each([
    [1, '# Heading 1'],
    [2, '## Heading 2'],
    [3, '### Heading 3'],
    [4, '#### Heading 4'],
    [5, '##### Heading 5'],
    [6, '###### Heading 6'],
  ])('parses heading level %i', (level, markdown) => {
    const doc = parseMarkdown(markdown).prosemirrorDoc;
    expect(doc.content[0]).toEqual({
      type: 'heading',
      attrs: { level },
      content: [{ type: 'text', text: `Heading ${level}` }],
    });
  });

  it('parses paragraphs, bullet lists, and ordered lists', () => {
    const doc = parseMarkdown('Paragraph\n\n- Item A\n- Item B\n\n1. First\n2. Second').prosemirrorDoc;

    expect(doc.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Paragraph' }],
    });
    expect(doc.content[1]).toEqual({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item A' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item B' }] }],
        },
      ],
    });
    expect(doc.content[2]).toEqual({
      type: 'orderedList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }],
        },
      ],
    });
  });

  it('parses fenced code blocks with and without language', () => {
    const withLanguage = parseMarkdown('```ts\nconst x = 1;\n```').prosemirrorDoc;
    const withoutLanguage = parseMarkdown('```\nplain text\n```').prosemirrorDoc;

    expect(withLanguage.content[0]).toEqual({
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'const x = 1;' }],
    });
    expect(withoutLanguage.content[0]).toEqual({
      type: 'codeBlock',
      attrs: { language: '' },
      content: [{ type: 'text', text: 'plain text' }],
    });
  });

  it('parses regular blockquotes and obsidian callouts as blockquote nodes', () => {
    const quote = parseMarkdown('> Regular quote').prosemirrorDoc;
    const callout = parseMarkdown('> [!note] Important\n> Body line').prosemirrorDoc;

    expect(quote.content[0]).toEqual({
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Regular quote' }],
        },
      ],
    });

    expect(callout.content[0]).toEqual({
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Important' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Body line' }],
        },
      ],
    });
  });

  it('parses inline formatting marks', () => {
    const doc = parseMarkdown('**bold** *italic* `code` ~~strike~~').prosemirrorDoc;
    const paragraph = doc.content[0];

    expect(paragraph).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'code', marks: [{ type: 'code' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'strike', marks: [{ type: 'strike' }] },
      ],
    });
  });

  it('parses links with href metadata', () => {
    const doc = parseMarkdown('[WikiLive](https://example.com)').prosemirrorDoc;
    const paragraph = doc.content[0];

    expect(paragraph).toEqual({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'WikiLive',
          marks: [
            {
              type: 'link',
              attrs: {
                href: 'https://example.com',
                target: null,
                rel: null,
              },
            },
          ],
        },
      ],
    });
  });

  it('parses horizontal rules', () => {
    const dashedRule = parseMarkdown('---').prosemirrorDoc;
    const starredRule = parseMarkdown('***').prosemirrorDoc;

    expect(dashedRule.content[0]).toEqual({ type: 'horizontalRule' });
    expect(starredRule.content[0]).toEqual({ type: 'horizontalRule' });
  });

  it('extracts frontmatter title and removes frontmatter from body', () => {
    const result = parseMarkdown('---\ntitle: Imported page\nowner: team\n---\n\nBody');

    expect(result.title).toBe('Imported page');
    expect(result.prosemirrorDoc.content).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Body' }],
      },
    ]);
  });

  it('handles frontmatter without title and empty frontmatter', () => {
    const withoutTitle = parseMarkdown('---\nowner: team\n---\n\nBody');
    const emptyFrontmatter = parseMarkdown('---\n---\n\nBody');

    expect(withoutTitle.title).toBeNull();
    expect(getTextContent(withoutTitle.prosemirrorDoc.content[0]!)).toBe('Body');
    expect(emptyFrontmatter.title).toBeNull();
    expect(getTextContent(emptyFrontmatter.prosemirrorDoc.content[0]!)).toBe('Body');
  });

  it('converts wikilinks to plain text fallback, including aliases', () => {
    const simple = parseMarkdown('[[Page Name]]').prosemirrorDoc;
    const alias = parseMarkdown('[[Page Name|Alias]]').prosemirrorDoc;

    expect(simple.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Page Name' }],
    });
    expect(alias.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Alias' }],
    });
  });

  it('normalizes ChatGPT citation and entity markers to readable text', () => {
    const markdown = [
      'По данным \uE200entity\uE202["organization","McKinsey & Company","consulting firm"]\uE201 вывод подтвержден.',
      'Первый факт \uE200cite\uE202turn17view5\uE202turn17view6\uE201 и повтор \uE200cite\uE202turn17view5\uE201.',
    ].join('\n\n');

    const doc = parseMarkdown(markdown).prosemirrorDoc;

    expect(getTextContent(doc.content[0]!)).toBe('По данным McKinsey & Company вывод подтвержден.');
    expect(getTextContent(doc.content[1]!)).toBe('Первый факт [1] [2] и повтор [1].');
  });

  it('keeps inline tags as plain text', () => {
    const doc = parseMarkdown('Text with #tag inside').prosemirrorDoc;
    expect(doc.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Text with #tag inside' }],
    });
  });

  it('returns an empty paragraph for blank input', () => {
    const doc = parseMarkdown('').prosemirrorDoc;
    expect(doc).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    });
  });
});
