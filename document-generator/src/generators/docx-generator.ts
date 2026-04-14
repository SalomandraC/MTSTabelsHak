import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ExternalHyperlink,
} from 'docx';
import type { BlockNode } from '../types.js';

function makeRuns(content: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>): (TextRun | ExternalHyperlink)[] {
  if (!marks || marks.length === 0) {
    return [new TextRun(content)];
  }

  const opts: Record<string, unknown> = { text: content };
  let linkHref: string | null = null;

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': opts.bold = true; break;
      case 'italic': opts.italics = true; break;
      case 'strike': opts.strike = true; break;
      case 'code': opts.font = 'monospace'; opts.shading = { fill: 'F2F3F5' }; break;
      case 'link': linkHref = (mark.attrs?.href as string) ?? null; break;
    }
  }

  if (linkHref) {
    return [
      new ExternalHyperlink({
        link: linkHref,
        children: [new TextRun(opts)],
      }),
    ];
  }

  return [new TextRun(opts)];
}

function blockToDocxElements(block: BlockNode): (Paragraph | Table)[] {
  switch (block.type) {
    case 'heading': {
      const hLevel = Math.min(Math.max(block.level ?? 1, 1), 3) as 1 | 2 | 3;
      const headings = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
      return [
        new Paragraph({
          heading: headings[hLevel],
          children: [new TextRun(block.content ?? '')],
          spacing: { before: block.level === 1 ? 0 : 240, after: 120 },
        }),
      ];
    }

    case 'paragraph':
    case 'text':
      return [
        new Paragraph({
          children: makeRuns(block.content ?? '', block.marks),
          spacing: { after: 120 },
        }),
      ];

    case 'image':
      return [
        new Paragraph({
          children: [new TextRun({ text: `📷 ${block.alt ?? 'Изображение'}`, italics: true, color: '6B7898' })],
          spacing: { after: 120 },
        }),
      ];

    case 'iframe':
      return [
        new Paragraph({
          children: [new TextRun({ text: `🔗 Встроенный контент: ${block.src ?? ''}`, italics: true, color: '6B7898', size: 20 })],
          spacing: { after: 120 },
        }),
      ];

    case 'table':
      return [
        new Paragraph({
          children: [new TextRun({ text: `📊 ${block.content ?? 'Таблица MWS'}`, italics: true, color: '6B7898' })],
          spacing: { after: 120 },
        }),
      ];

    case 'code_block': {
      const langLine = block.language ? `${block.language}\n` : '';
      return [
        new Paragraph({
          children: [new TextRun({ text: `${langLine}${block.content ?? ''}`, font: 'monospace', size: 18 })],
          shading: { fill: 'F2F3F5' },
          spacing: { after: 160, before: 80 },
        }),
      ];
    }

    case 'bullet_list':
      return (block.children ?? []).map((child: BlockNode) =>
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun(renderChildren(child))],
          spacing: { after: 60 },
        }),
      );

    case 'ordered_list':
      return (block.children ?? []).map((child: BlockNode, _i: number) =>
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun(renderChildren(child))],
          spacing: { after: 60 },
        }),
      );

    case 'task_item': {
      const prefix = block.checked ? '☑ ' : '☐ ';
      const text = (block.children ?? []).map(renderChildren).join(' ');
      return [
        new Paragraph({
          children: [new TextRun(`${prefix}${text}`)],
          spacing: { after: 60 },
        }),
      ];
    }

    case 'blockquote': {
      const text = (block.children ?? []).map(renderChildren).join(' ');
      return [
        new Paragraph({
          children: [new TextRun({ text, italics: true, color: '5A6676' })],
          indent: { left: 480 },
          shading: { fill: 'F8F9FA' },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: 'D70032' },
          },
          spacing: { after: 120 },
        }),
      ];
    }

    case 'horizontal_rule':
      return [
        new Paragraph({
          children: [new TextRun({ text: '─'.repeat(50), color: 'D2D8E3' })],
          spacing: { after: 120 },
        }),
      ];

    default:
      return [];
  }
}

function renderChildren(block: BlockNode): string {
  if (block.content) return block.content;
  if (block.children) return block.children.map(renderChildren).join(' ');
  return '';
}

export async function generateDocx(title: string, blocks: BlockNode[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title, bold: true, size: 36 })],
      spacing: { after: 240 },
    }),
  );

  for (const block of blocks) {
    children.push(...blockToDocxElements(block));
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}
