import { Schema } from 'prosemirror-model';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
import * as Y from 'yjs';

type ProseMirrorMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

type ProseMirrorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: ProseMirrorMark[];
};

type ParsedMarkdownDocument = {
  title: string | null;
  document: {
    type: 'doc';
    content: ProseMirrorNode[];
  };
};

const obsidianImportSchema = new Schema({
  nodes: {
    doc: {
      content: 'rootblock+',
    },
    rootblock: {
      group: 'rootblock',
      content: 'block',
      toDOM: () => ['div', { 'data-type': 'rootblock' }, 0],
    },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: {
        level: { default: 1 },
      },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
      toDOM: () => ['ul', 0],
    },
    orderedList: {
      group: 'block',
      content: 'listItem+',
      toDOM: () => ['ol', 0],
    },
    listItem: {
      group: 'block',
      content: 'paragraph+',
      toDOM: () => ['li', 0],
    },
    blockquote: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['blockquote', 0],
    },
    codeBlock: {
      group: 'block',
      content: 'text*',
      marks: '',
      attrs: {
        language: { default: null },
      },
      code: true,
      defining: true,
      toDOM: (node) => ['pre', ['code', { 'data-language': node.attrs.language ?? '' }, 0]],
    },
    horizontalRule: {
      group: 'block',
      toDOM: () => ['hr'],
    },
    text: {
      group: 'inline',
    },
    hardBreak: {
      group: 'inline',
      inline: true,
      selectable: false,
      toDOM: () => ['br'],
    },
  },
  marks: {
    bold: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b', getAttrs: () => null }],
      toDOM: () => ['strong', 0],
    },
    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i', getAttrs: () => null }],
      toDOM: () => ['em', 0],
    },
    strike: {
      parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
      toDOM: () => ['s', 0],
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0],
    },
    link: {
      attrs: {
        href: {},
        target: { default: null },
        rel: { default: null },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => {
            const anchor = dom as {
              getAttribute: (name: string) => string | null;
            };
            return {
              href: anchor.getAttribute('href'),
              target: anchor.getAttribute('target'),
              rel: anchor.getAttribute('rel'),
            };
          },
        },
      ],
      toDOM: (node) => ['a', node.attrs, 0],
    },
  },
});

function extractFrontmatter(markdown: string): { title: string | null; body: string } {
  if (!markdown.startsWith('---\n') && !markdown.startsWith('---\r\n')) {
    return { title: null, body: markdown };
  }

  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== '---') {
    return { title: null, body: markdown };
  }

  const closingIndex = lines.slice(1).findIndex((line) => line === '---');
  if (closingIndex < 0) {
    return { title: null, body: markdown };
  }

  const yamlLines = lines.slice(1, closingIndex + 1);
  const yaml = yamlLines.join('\n');
  const bodyLines = lines.slice(closingIndex + 2);
  const body = bodyLines.join('\n');
  const titleMatch = /^title:\s*(.+)$/m.exec(yaml);
  const title = titleMatch ? titleMatch[1].trim().replace(/^["']|["']$/g, '') : null;

  return { title, body };
}

function parseInlineText(text: string): ProseMirrorNode[] {
  return [{ type: 'text', text }];
}

function parseInline(text: string): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  const preprocessed = text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1');

  let remaining = preprocessed;

  while (remaining.length > 0) {
    const linkMatch = /^\[([^\]]*)\]\(([^)]*)\)/.exec(remaining);
    if (linkMatch) {
      const linkNodes = parseInlineText(linkMatch[1]);
      const mark: ProseMirrorMark = {
        type: 'link',
        attrs: { href: linkMatch[2], target: null, rel: null },
      };
      for (const node of linkNodes) {
        nodes.push({ ...node, marks: [...(node.marks ?? []), mark] });
      }
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const boldMatch = /^(\*\*|__)(.+?)\1/.exec(remaining);
    if (boldMatch) {
      const inner = parseInlineText(boldMatch[2]);
      for (const node of inner) {
        nodes.push({ ...node, marks: [...(node.marks ?? []), { type: 'bold' }] });
      }
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = /^(\*|_)(.+?)\1/.exec(remaining);
    if (italicMatch) {
      const inner = parseInlineText(italicMatch[2]);
      for (const node of inner) {
        nodes.push({ ...node, marks: [...(node.marks ?? []), { type: 'italic' }] });
      }
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const strikeMatch = /^~~(.+?)~~/.exec(remaining);
    if (strikeMatch) {
      const inner = parseInlineText(strikeMatch[1]);
      for (const node of inner) {
        nodes.push({ ...node, marks: [...(node.marks ?? []), { type: 'strike' }] });
      }
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    const codeMatch = /^`([^`]+)`/.exec(remaining);
    if (codeMatch) {
      nodes.push({ type: 'text', text: codeMatch[1], marks: [{ type: 'code' }] });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const plainMatch = /^[^*_~`[\]]+/.exec(remaining);
    if (plainMatch) {
      nodes.push({ type: 'text', text: plainMatch[0] });
      remaining = remaining.slice(plainMatch[0].length);
      continue;
    }

    nodes.push({ type: 'text', text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return nodes.filter((node) => node.text !== '' || (node.content?.length ?? 0) > 0);
}

function parseBlockquote(lines: string[]): ProseMirrorNode {
  const calloutMatch = /^\[!(\w+)\]\s*(.*)$/.exec(lines[0] ?? '');
  if (calloutMatch) {
    const titleText = calloutMatch[2].trim();
    const bodyLines = lines.slice(1);
    const content: ProseMirrorNode[] = [];

    if (titleText) {
      content.push({ type: 'paragraph', content: [{ type: 'text', text: titleText }] });
    }

    const bodyNodes = parseBlocks(bodyLines);
    content.push(
      ...(bodyNodes.length > 0
        ? bodyNodes
        : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }]),
    );

    return { type: 'blockquote', content };
  }

  const inner = parseBlocks(lines);
  return {
    type: 'blockquote',
    content: inner.length > 0 ? inner : [{ type: 'paragraph', content: [] }],
  };
}

function parseBlocks(lines: string[]): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      nodes.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2].trim()),
      });
      index += 1;
      continue;
    }

    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      nodes.push({ type: 'horizontalRule' });
      index += 1;
      continue;
    }

    const fenceMatch = /^```(\w*)/.exec(line);
    if (fenceMatch) {
      const language = fenceMatch[1] || null;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      nodes.push({
        type: 'codeBlock',
        attrs: { language },
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].startsWith('> ')) {
        quoteLines.push(lines[index].slice(2));
        index += 1;
      }
      nodes.push(parseBlockquote(quoteLines));
      continue;
    }

    if (/^[-*+]\s/.test(line)) {
      const items: ProseMirrorNode[] = [];
      while (index < lines.length && /^[-*+]\s/.test(lines[index])) {
        const itemText = lines[index].replace(/^[-*+]\s/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(itemText) }],
        });
        index += 1;
      }
      nodes.push({ type: 'bulletList', content: items });
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: ProseMirrorNode[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index])) {
        const itemText = lines[index].replace(/^\d+\.\s/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(itemText) }],
        });
        index += 1;
      }
      nodes.push({ type: 'orderedList', content: items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !/^#{1,6}\s/.test(lines[index]) &&
      !/^[-*+]\s/.test(lines[index]) &&
      !/^\d+\.\s/.test(lines[index]) &&
      !lines[index].startsWith('> ') &&
      !lines[index].startsWith('```') &&
      !/^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      const content = parseInline(paragraphLines.join(' '));
      if (content.length > 0) {
        nodes.push({ type: 'paragraph', content });
      }
    }
  }

  return nodes;
}

function wrapInRootBlocks(document: { type: 'doc'; content: ProseMirrorNode[] }) {
  const wrapped = document.content
    .filter((node) => node && typeof node === 'object')
    .map((node) => {
      if (node.type === 'rootblock') {
        return node;
      }

      return {
        type: 'rootblock',
        content: [node],
      };
    });

  return {
    type: 'doc',
    content:
      wrapped.length > 0
        ? wrapped
        : [{ type: 'rootblock', content: [{ type: 'paragraph', content: [] }] }],
  };
}

export function parseMarkdownForObsidianImport(markdown: string): ParsedMarkdownDocument {
  const { title, body } = extractFrontmatter(markdown);
  const lines = body.split(/\r?\n/);
  const blocks = parseBlocks(lines);
  const content = blocks.length > 0 ? blocks : [{ type: 'paragraph', content: [] }];

  return {
    title,
    document: {
      type: 'doc',
      content,
    },
  };
}

export function encodeMarkdownToYDoc(markdown: string): {
  title: string | null;
  value: string;
} {
  const parsed = parseMarkdownForObsidianImport(markdown);
  const wrapped = wrapInRootBlocks(parsed.document);
  const ydoc = prosemirrorJSONToYDoc(obsidianImportSchema, wrapped, 'default');
  const encoded = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
  ydoc.destroy();

  return {
    title: parsed.title,
    value: encoded,
  };
}
