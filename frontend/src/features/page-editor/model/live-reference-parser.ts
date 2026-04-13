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

const LIVE_REFERENCE_TOKEN = /\[Ref:([^:\]\s]+):([^:\]\s]+):([^:\]\s]+)\]/g;

function looksLikeMarkdown(text: string): boolean {
  const value = text.trim();
  if (!value) {
    return false;
  }

  return /(^#{1,6}\s)|(^[-*]\s)|(^\d+\.\s)|(```)|(`[^`]+`)|(\*\*[^*]+\*\*)|(^>\s)|(^(-{3,}|\*{3,}|_{3,})$)/m.test(value);
}

export function hasLiveReferenceToken(text: string): boolean {
  LIVE_REFERENCE_TOKEN.lastIndex = 0;
  return LIVE_REFERENCE_TOKEN.test(text);
}

export function parseInlineContentWithLiveReferences(text: string, options: LiveReferenceParseOptions = {}): JSONContent[] {
  const value = String(text ?? '');
  const parts: JSONContent[] = [];

  LIVE_REFERENCE_TOKEN.lastIndex = 0;
  let cursor = 0;
  let match = LIVE_REFERENCE_TOKEN.exec(value);

  while (match) {
    const [token, datasheetId, recordId, fieldId] = match;
    const start = match.index;

    if (start > cursor) {
      parts.push({
        type: 'text',
        text: value.slice(cursor, start),
      });
    }

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

    cursor = start + token.length;
    match = LIVE_REFERENCE_TOKEN.exec(value);
  }

  if (cursor < value.length) {
    parts.push({
      type: 'text',
      text: value.slice(cursor),
    });
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

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
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
      continue;
    }

    paragraphBuffer.push(trimmed);
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

  if (!hasLiveRef && hasMarkdown) {
    const from = editor.state.selection.from;
    const to = editor.state.selection.to;
    return editor.chain().focus().insertContentAt({ from, to }, text).run();
  }

  return editor
    .chain()
    .focus()
    .insertContent(parseInlineContentWithLiveReferences(text, options))
    .run();
}
