import type { Content, Editor } from '@tiptap/core';

export type ParsedLiveReference = {
  datasheetId: string;
  recordId: string;
  fieldId: string;
};

const LIVE_REFERENCE_TOKEN = /\[Ref:([^:\]\s]+):([^:\]\s]+):([^:\]\s]+)\]/g;

export function hasLiveReferenceToken(text: string): boolean {
  LIVE_REFERENCE_TOKEN.lastIndex = 0;
  return LIVE_REFERENCE_TOKEN.test(text);
}

export function parseInlineContentWithLiveReferences(text: string): Content[] {
  const value = String(text ?? '');
  const parts: Content[] = [];

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

export function insertAiTextWithLiveReferences(editor: Editor, text: string): boolean {
  if (!hasLiveReferenceToken(text)) {
    return editor.commands.insertContent(text);
  }

  return editor
    .chain()
    .focus()
    .insertContent(parseInlineContentWithLiveReferences(text))
    .run();
}
