import type { Content, Editor, JSONContent } from '@tiptap/core';

export type ParsedLiveReference = {
  spaceId?: string;
  datasheetId: string;
  recordId: string;
  fieldId: string;
};

export type LiveReferenceParseOptions = {
  spaceId?: string;
};

type MarkdownStorage = {
  getMarkdown?: () => string;
  parse?: (value: string) => Content | null | undefined;
};

const LIVE_REFERENCE_TOKEN = /^\[Ref:([^:\]\s]+):([^:\]\s]+):([^:\]\s]+)\]$/;

function extractFormulaToken(text: string, from: number): { token: string; expression: string; end: number } | null {
  const prefix = '[Formula:';
  if (!text.startsWith(prefix, from)) {
    return null;
  }

  let depth = 1;
  let index = from + 1;

  while (index < text.length) {
    const char = text[index];
    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        const token = text.slice(from, index + 1);
        const expression = text.slice(from + prefix.length, index).trim();
        return {
          token,
          expression,
          end: index + 1,
        };
      }
    }
    index += 1;
  }

  return null;
}

function looksLikeMarkdown(text: string): boolean {
  const value = text.trim();
  if (!value) {
    return false;
  }

  return /(^#{1,6}\s)|(^[-*]\s)|(^\d+\.\s)|(```)|(`[^`]+`)|(\*\*[^*]+\*\*)|(^>\s)|(^(-{3,}|\*{3,}|_{3,})$)|(^\|.+\|\s*$)|(^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$)/m.test(value);
}

function extractParsedBlocks(content: Content | null | undefined): JSONContent[] {
  if (!content) {
    return [];
  }

  if (Array.isArray(content)) {
    return content as JSONContent[];
  }

  const asNode = content as JSONContent;
  if (asNode.type === 'doc' && Array.isArray(asNode.content)) {
    return asNode.content;
  }

  if (typeof asNode.type === 'string') {
    return [asNode];
  }

  return [];
}

function splitMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return null;
  }

  const normalized = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutTrailingPipe = normalized.endsWith('|') ? normalized.slice(0, -1) : normalized;
  const cells = withoutTrailingPipe.split('|').map((cell) => cell.trim());

  return cells.length > 1 ? cells : null;
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  if (!cells || cells.length === 0) {
    return false;
  }

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function createTableCellNode(text: string, options: LiveReferenceParseOptions, isHeader: boolean): JSONContent {
  const content = parseInlineContentWithLiveReferences(text, options);

  return {
    type: isHeader ? 'tableHeader' : 'tableCell',
    content: content.length > 0 ? [{ type: 'paragraph', content }] : [{ type: 'paragraph' }],
  };
}

function parseMarkdownTableBlock(
  lines: string[],
  startIndex: number,
  options: LiveReferenceParseOptions,
): { node: JSONContent; nextIndex: number } | null {
  const headerCells = splitMarkdownTableRow(lines[startIndex]);
  const separatorLine = lines[startIndex + 1];

  if (!headerCells || !separatorLine || !isMarkdownTableSeparator(separatorLine)) {
    return null;
  }

  const rows: JSONContent[] = [
    {
      type: 'tableRow',
      content: headerCells.map((cell) => createTableCellNode(cell, options, true)),
    },
  ];

  let index = startIndex + 2;
  while (index < lines.length) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      break;
    }

    const rowCells = splitMarkdownTableRow(rawLine);
    if (!rowCells || isMarkdownTableSeparator(rawLine)) {
      break;
    }

    rows.push({
      type: 'tableRow',
      content: rowCells.map((cell) => createTableCellNode(cell, options, false)),
    });
    index += 1;
  }

  return {
    node: {
      type: 'table',
      content: rows,
    },
    nextIndex: index,
  };
}

function mapNodeWithLiveReferences(node: JSONContent, options: LiveReferenceParseOptions): JSONContent[] {
  if (node.type === 'text' && typeof node.text === 'string' && hasLiveReferenceToken(node.text)) {
    return parseInlineContentWithLiveReferences(node.text, options);
  }

  if (!Array.isArray(node.content)) {
    return [node];
  }

  const mappedContent: JSONContent[] = [];
  for (const child of node.content) {
    mappedContent.push(...mapNodeWithLiveReferences(child, options));
  }

  return [
    {
      ...node,
      content: mappedContent,
    },
  ];
}

export function parseMarkdownWithLiveReferences(
  editor: Editor,
  text: string,
  options: LiveReferenceParseOptions = {},
): JSONContent[] {
  const markdownStorage = (editor.storage as { markdown?: MarkdownStorage }).markdown;
  const parsed = markdownStorage?.parse?.(text);
  const blocks = extractParsedBlocks(parsed);

  if (blocks.length === 0) {
    return [];
  }

  return blocks.flatMap((node) => mapNodeWithLiveReferences(node, options));
}

export function hasLiveReferenceToken(text: string): boolean {
  return text.includes('[Ref:') || text.includes('[Formula:');
}

export function parseInlineContentWithLiveReferences(text: string, options: LiveReferenceParseOptions = {}): JSONContent[] {
  const value = String(text ?? '');
  const parts: JSONContent[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const nextRef = value.indexOf('[Ref:', cursor);
    const nextFormula = value.indexOf('[Formula:', cursor);
    const candidates = [nextRef, nextFormula].filter((index) => index >= 0);
    const nextTokenStart = candidates.length > 0 ? Math.min(...candidates) : -1;

    if (nextTokenStart < 0) {
      parts.push({
        type: 'text',
        text: value.slice(cursor),
      });
      break;
    }

    if (nextTokenStart > cursor) {
      parts.push({
        type: 'text',
        text: value.slice(cursor, nextTokenStart),
      });
    }

    if (value.startsWith('[Ref:', nextTokenStart)) {
      const end = value.indexOf(']', nextTokenStart);
      if (end > nextTokenStart) {
        const token = value.slice(nextTokenStart, end + 1);
        const match = token.match(LIVE_REFERENCE_TOKEN);

        if (match) {
          const [, datasheetId, recordId, fieldId] = match;
          parts.push({
            type: 'liveReference',
            attrs: {
              spaceId: options.spaceId ?? '',
              datasheetId,
              recordId,
              fieldId,
              label: `${recordId} / ${fieldId}`,
            },
          });
          cursor = end + 1;
          continue;
        }
      }
    }

    const formulaToken = extractFormulaToken(value, nextTokenStart);
    if (formulaToken) {
      parts.push({
        type: 'liveFormula',
        attrs: {
          spaceId: options.spaceId ?? '',
          expression: formulaToken.expression,
        },
      });
      cursor = formulaToken.end;
      continue;
    }

    parts.push({
      type: 'text',
      text: value.slice(nextTokenStart, nextTokenStart + 1),
    });
    cursor = nextTokenStart + 1;
  }

  if (parts.length === 0) {
    return [{ type: 'text', text: value }];
  }

  return parts;
}

export function parseMarkdownReportWithLiveReferences(text: string, options: LiveReferenceParseOptions = {}): JSONContent[] {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: JSONContent[] = [];
  const paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    const paragraphText = paragraphBuffer.join(' ').trim();
    paragraphBuffer.length = 0;

    if (!paragraphText) {
      return;
    }

    blocks.push({
      type: 'paragraph',
      content: parseInlineContentWithLiveReferences(paragraphText, options),
    });
  };

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    const tableBlock = parseMarkdownTableBlock(lines, index, options);
    if (tableBlock) {
      flushParagraph();
      blocks.push(tableBlock.node);
      index = tableBlock.nextIndex;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        attrs: {
          level: headingMatch[1].length,
        },
        content: parseInlineContentWithLiveReferences(headingMatch[2].trim(), options),
      });
      index += 1;
      continue;
    }

    paragraphBuffer.push(trimmed);
    index += 1;
  }

  flushParagraph();

  if (blocks.length === 0) {
    return [{ type: 'paragraph', content: parseInlineContentWithLiveReferences(normalized.trim() || normalized, options) }];
  }

  return blocks;
}

export function insertAiTextWithLiveReferences(editor: Editor, text: string, options: LiveReferenceParseOptions = {}): boolean {
  const hasLiveRef = hasLiveReferenceToken(text);
  const hasMarkdown = looksLikeMarkdown(text);

  if (!hasLiveRef && !hasMarkdown) {
    return editor.commands.insertContent(text);
  }

  if (hasMarkdown) {
    const parsedBlocks = parseMarkdownWithLiveReferences(editor, text, options);
    const from = editor.state.selection.from;
    const to = editor.state.selection.to;

    if (parsedBlocks.length > 0) {
      return editor.chain().focus().insertContentAt({ from, to }, parsedBlocks).run();
    }

    return editor.chain().focus().insertContentAt({ from, to }, text).run();
  }

  return editor
    .chain()
    .focus()
    .insertContent(parseInlineContentWithLiveReferences(text, options))
    .run();
}
