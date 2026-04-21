import type { FileValidationResult, ParsedDocument, ProseMirrorDoc, ProseMirrorMark, ProseMirrorNode } from './types';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const CHATGPT_MARKER_START = '\uE200';
const CHATGPT_MARKER_SEPARATOR = '\uE202';
const CHATGPT_MARKER_END = '\uE201';

export function validateFile(file: Pick<File, 'name' | 'size'>): FileValidationResult {
  if (!file.name.toLowerCase().endsWith('.md')) {
    return { ok: false, error: 'Поддерживаются только файлы .md' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: 'Файл слишком большой (максимум 5 МБ)' };
  }
  return { ok: true };
}

// ─── Frontmatter ─────────────────────────────────────────────────────────────

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

function normalizeChatGptMarkers(markdown: string): string {
  const citationIndexes = new Map<string, number>();

  return markdown.replace(
    new RegExp(`${CHATGPT_MARKER_START}(cite|entity)${CHATGPT_MARKER_SEPARATOR}([\\s\\S]*?)${CHATGPT_MARKER_END}`, 'g'),
    (_match, markerType: string, payload: string) => {
      if (markerType === 'entity') {
        return extractChatGptEntityLabel(payload);
      }

      const refs = payload
        .split(CHATGPT_MARKER_SEPARATOR)
        .map((ref) => ref.trim())
        .filter(Boolean);

      return refs
        .map((ref) => {
          const existingIndex = citationIndexes.get(ref);
          if (existingIndex) {
            return `[${existingIndex}]`;
          }

          const nextIndex = citationIndexes.size + 1;
          citationIndexes.set(ref, nextIndex);
          return `[${nextIndex}]`;
        })
        .join(' ');
    },
  );
}

function extractChatGptEntityLabel(payload: string): string {
  const [rawEntity] = payload.split(CHATGPT_MARKER_SEPARATOR);

  try {
    const parsed = JSON.parse(rawEntity);
    if (Array.isArray(parsed)) {
      const label = parsed.find((value, index) => index > 0 && typeof value === 'string' && value.trim());
      if (typeof label === 'string') {
        return label;
      }
    }
  } catch {
    // If OpenAI changes marker payload shape, fall back to readable text below.
  }

  return rawEntity.replace(/^\[|\]$/g, '').replace(/^["']|["']$/g, '').trim();
}

// ─── Inline parser ────────────────────────────────────────────────────────────

function parseInline(text: string): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];

  // Pre-process: replace wikilinks before other parsing
  const preprocessed = text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1');

  let remaining = preprocessed;

  while (remaining.length > 0) {
    // Link [text](url)
    const linkMatch = /^\[([^\]]*)\]\(([^)]*)\)/.exec(remaining);
    if (linkMatch) {
      const linkNodes = parseInlineText(linkMatch[1]);
      const mark: ProseMirrorMark = { type: 'link', attrs: { href: linkMatch[2], target: null, rel: null } };
      for (const n of linkNodes) {
        nodes.push({ ...n, marks: [...(n.marks ?? []), mark] });
      }
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Bold **text** or __text__
    const boldMatch = /^(\*\*|__)(.+?)\1/.exec(remaining);
    if (boldMatch) {
      const inner = parseInlineText(boldMatch[2]);
      const mark: ProseMirrorMark = { type: 'bold' };
      for (const n of inner) {
        nodes.push({ ...n, marks: [...(n.marks ?? []), mark] });
      }
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic *text* or _text_
    const italicMatch = /^(\*|_)(.+?)\1/.exec(remaining);
    if (italicMatch) {
      const inner = parseInlineText(italicMatch[2]);
      const mark: ProseMirrorMark = { type: 'italic' };
      for (const n of inner) {
        nodes.push({ ...n, marks: [...(n.marks ?? []), mark] });
      }
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Strikethrough ~~text~~
    const strikeMatch = /^~~(.+?)~~/.exec(remaining);
    if (strikeMatch) {
      const inner = parseInlineText(strikeMatch[1]);
      const mark: ProseMirrorMark = { type: 'strike' };
      for (const n of inner) {
        nodes.push({ ...n, marks: [...(n.marks ?? []), mark] });
      }
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Inline code `text`
    const codeMatch = /^`([^`]+)`/.exec(remaining);
    if (codeMatch) {
      nodes.push({ type: 'text', text: codeMatch[1], marks: [{ type: 'code' }] });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Plain text — consume until next special char
    const plainMatch = /^[^*_~`[\]]+/.exec(remaining);
    if (plainMatch) {
      nodes.push({ type: 'text', text: plainMatch[0] });
      remaining = remaining.slice(plainMatch[0].length);
      continue;
    }

    // Consume one char to avoid infinite loop
    nodes.push({ type: 'text', text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return nodes.filter(n => n.text !== '' || (n.content?.length ?? 0) > 0);
}

function parseInlineText(text: string): ProseMirrorNode[] {
  return [{ type: 'text', text }];
}

// ─── Block parser ─────────────────────────────────────────────────────────────

function parseBlocks(lines: string[]): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      nodes.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2].trim()),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      nodes.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // Fenced code block
    const fenceMatch = /^```(\w*)/.exec(line);
    if (fenceMatch) {
      const language = fenceMatch[1] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // closing ```
      nodes.push({
        type: 'codeBlock',
        attrs: { language },
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    // Blockquote / Callout
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      nodes.push(parseBlockquote(quoteLines));
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: ProseMirrorNode[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[-*+]\s/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(itemText) }],
        });
        i++;
      }
      nodes.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: ProseMirrorNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+\.\s/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(itemText) }],
        });
        i++;
      }
      nodes.push({ type: 'orderedList', content: items });
      continue;
    }

    // Paragraph — collect consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !lines[i].startsWith('> ') &&
      !lines[i].startsWith('```') &&
      !/^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      const content = parseInline(paraLines.join(' '));
      if (content.length > 0) {
        nodes.push({ type: 'paragraph', content });
      }
    }
  }

  return nodes;
}

function parseBlockquote(lines: string[]): ProseMirrorNode {
  // Callout: > [!type] Title
  const calloutMatch = /^\[!(\w+)\]\s*(.*)$/.exec(lines[0] ?? '');
  if (calloutMatch) {
    const titleText = calloutMatch[2].trim();
    const bodyLines = lines.slice(1);
    const content: ProseMirrorNode[] = [];

    if (titleText) {
      content.push({ type: 'paragraph', content: [{ type: 'text', text: titleText }] });
    }

    const bodyNodes = parseBlocks(bodyLines);
    content.push(...(bodyNodes.length > 0 ? bodyNodes : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }]));

    return { type: 'blockquote', content };
  }

  // Regular blockquote
  const inner = parseBlocks(lines);
  return {
    type: 'blockquote',
    content: inner.length > 0 ? inner : [{ type: 'paragraph', content: [] }],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseMarkdown(markdown: string): ParsedDocument {
  const { title, body } = extractFrontmatter(markdown);
  const normalizedBody = normalizeChatGptMarkers(body);
  const lines = normalizedBody.split(/\r?\n/);
  const blocks = parseBlocks(lines);

  const content: ProseMirrorNode[] = blocks.length > 0
    ? blocks
    : [{ type: 'paragraph', content: [] }];

  const prosemirrorDoc: ProseMirrorDoc = { type: 'doc', content };

  return { title, prosemirrorDoc };
}
