import type { Editor } from '@tiptap/core';

import { wikiliveApi } from '../../../../shared/api/wikilive';

export type StructureInstruction = {
  anchor: string;
  title: string;
  level: 1 | 2 | 3;
};

function stripMarkdownFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json|markdown)?\s*([\s\S]*?)\s*```$/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return trimmed;
}

function stripLeadingHeadingNumbers(markdown: string): string {
  return markdown
    .replace(/^(#{1,6}\s+)(?:\d+(?:\.\d+)*[.)]?\s+)(.+)$/gm, '$1$2')
    .replace(/^(#{1,6}\s+)(?:\d+[.)]?\s+)(.+)$/gm, '$1$2');
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[“”"'«»,.!?;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectStructureSourceBlocks(editor: Editor | null, limit = 40): Array<{ pos: number; text: string }> {
  if (!editor) {
    return [];
  }

  const { from, to, empty } = editor.state.selection;

  if (!empty) {
    const text = editor.state.doc.textBetween(from, to, '\n', '\n').trim();
    return text ? [{ pos: from, text }] : [];
  }

  const blocks: Array<{ pos: number; text: string }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (blocks.length >= limit) {
      return false;
    }

    if (!node.isTextblock || node.type.name === 'heading') {
      return true;
    }

    const text = node.textContent.trim();
    if (!text) {
      return true;
    }

    blocks.push({ pos, text });
    return true;
  });

  return blocks;
}

function parseStructureInstructions(answer: string): StructureInstruction[] {
  const candidate = stripMarkdownFence(answer);

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        const anchor = typeof record.anchor === 'string' ? record.anchor.trim() : '';
        const title = typeof record.title === 'string' ? record.title.trim() : '';
        const level = Number(record.level);

        if (!anchor || !title || ![1, 2, 3].includes(level)) {
          return null;
        }

        return {
          anchor,
          title,
          level: level as 1 | 2 | 3,
        } satisfies StructureInstruction;
      })
      .filter((item): item is StructureInstruction => Boolean(item));
  } catch {
    return [];
  }
}

function findAnchorPosition(editor: Editor, anchor: string): number | null {
  const normalizedAnchor = normalizeSearchText(anchor);
  if (!normalizedAnchor) {
    return null;
  }

  const anchorPrefix = normalizedAnchor.split(' ').slice(0, 7).join(' ');
  let foundPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock || node.type.name === 'heading') {
      return true;
    }

    const normalizedText = normalizeSearchText(node.textContent);
    if (!normalizedText) {
      return true;
    }

    if (normalizedText.startsWith(anchorPrefix) || normalizedText.includes(normalizedAnchor)) {
      foundPos = pos;
      return false;
    }

    return true;
  });

  return foundPos;
}

export async function runAutomaticMarkup(editor: Editor): Promise<number> {
  const sourceBlocks = collectStructureSourceBlocks(editor);
  const sourceText = sourceBlocks.map((block) => block.text).join('\n\n');

  if (!sourceText.trim()) {
    return 0;
  }

  const response = await wikiliveApi.aiChat({
    question: [
      'Ты — аналитик структуры документа. Твоя задача — изучить текст и составить список мест, где нужно вставить заголовки.',
      'НЕ ВОЗВРАЩАЙ ВЕСЬ ТЕКСТ ДОКУМЕНТА.',
      'Верни ответ ТОЛЬКО в формате JSON-массива объектов:',
      '[{"anchor": "фраза из начала абзаца", "title": "Текст заголовка", "level": 1|2|3}]',
      'Правила:',
      'anchor — это первые 5-7 слов абзаца, перед которым нужно поставить заголовок.',
      'title — это текст заголовка, который ты придумал. НЕ добавляй в него цифры (1., 1.1.), система сделает это сама.',
      'По умолчанию используй заголовки без цифр. Нумерация, если она нужна, будет добавлена системой автоматически.',
      'Если в тексте уже есть заголовки, возвращай только новые места для вставки.',
      `Абзацы для анализа:\n${sourceBlocks
        .map((block, index) => `${index + 1}. ${block.text.slice(0, 220)}`)
        .join('\n\n')}`,
    ].join('\n'),
    pageSnapshot: { markdown: sourceText },
  });

  const structurePlan = parseStructureInstructions(response.answer);
  const insertions = structurePlan
    .map((instruction, index) => ({
      instruction,
      index,
      pos: findAnchorPosition(editor, instruction.anchor),
    }))
    .filter((item): item is { instruction: StructureInstruction; index: number; pos: number } => typeof item.pos === 'number')
    .sort((left, right) => right.pos - left.pos || left.index - right.index);

  for (const item of insertions) {
    editor.commands.insertContentAt(item.pos, {
      type: 'heading',
      attrs: { level: item.instruction.level },
      content: [{ type: 'text', text: stripLeadingHeadingNumbers(item.instruction.title) }],
    });
  }

  return insertions.length;
}