import {
  Document,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  ExternalHyperlink,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from 'docx';
import puppeteer from 'puppeteer';
import type { BlockNode } from '../types.js';
import { createInlineNodeResolver, type ExportAuthContext } from '../live-inline.js';
import {
  buildLiveChartExportData,
  renderLiveChartSvg,
  renderMermaidCodeSvg,
  type LiveChartExportData,
} from '../chart-export.js';


const API_BASE = process.env.API_BASE_URL ?? 'http://api:8080';

type MwsField = { id: string; name: string };
type MwsRecord = { recordId: string; fields: Record<string, unknown> };

type AuthContext = ExportAuthContext;

type LinkContext = {
  appBaseUrl: string;
  spaceId: string;
};

function pageUrl(ctx: LinkContext, pageId: string): string {
  const base = ctx.appBaseUrl.replace(/\/$/, '');
  return `${base}/spaces/${encodeURIComponent(ctx.spaceId)}/pages/${encodeURIComponent(pageId)}`;
}

function buildAuthHeaders(auth?: AuthContext): Record<string, string> {
  if (auth?.accessToken) return { Authorization: `Bearer ${auth.accessToken}` };
  if (auth?.userId) return { 'x-user-id': auth.userId, 'x-user-name': auth.displayName ?? auth.userId };
  return { 'x-user-id': 'docgen', 'x-user-name': 'Document Generator' };
}

// ─── MWS table fetcher ────────────────────────────────────────────────────────

async function fetchTableData(
  datasheetId: string,
  viewId?: string | null,
  auth?: AuthContext,
): Promise<{ fields: MwsField[]; records: MwsRecord[] } | null> {
  const headers = buildAuthHeaders(auth);
  try {
    const fieldsRes = await fetch(
      `${API_BASE}/api/v1/mws/datasheets/${datasheetId}/fields${viewId ? `?viewId=${viewId}` : ''}`,
      { headers },
    );
    if (!fieldsRes.ok) return null;
    const { items: fields } = await fieldsRes.json() as { items: MwsField[] };

    const recordsRes = await fetch(
      `${API_BASE}/api/v1/mws/datasheets/${datasheetId}/records?pageSize=100&fieldKey=id&cellFormat=json${viewId ? `&viewId=${viewId}` : ''}`,
      { headers },
    );
    if (!recordsRes.ok) return null;
    const { items: records } = await recordsRes.json() as { items: MwsRecord[] };

    return { fields, records };
  } catch {
    return null;
  }
}

function buildDocxTable(title: string, fields: MwsField[], records: MwsRecord[]): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];

  if (title) {
    result.push(new Paragraph({
      children: [new TextRun({ text: title, bold: true })],
      spacing: { after: 80 },
    }));
  }

  // A4 page width minus margins ≈ 9026 twips, distribute evenly
  const colCount = fields.length || 1;
  const colWidth = Math.floor(9026 / colCount);

  const headerRow = new TableRow({
    tableHeader: true,
    children: fields.map((f) => new TableCell({
      width: { size: colWidth, type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, fill: 'F2F3F5' },
      children: [new Paragraph({ children: [new TextRun({ text: f.name, bold: true, size: 20 })] })],
    })),
  });

  const dataRows = records.map((r) => new TableRow({
    children: fields.map((f) => {
      const val = r.fields[f.id];
      const text = val == null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
      return new TableCell({
        width: { size: colWidth, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text, size: 20 })] })],
      });
    }),
  }));

  result.push(new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: Array(colCount).fill(colWidth),
    layout: 'autofit' as any,
    rows: [headerRow, ...dataRows],
  }));

  result.push(new Paragraph({ children: [], spacing: { after: 160 } }));

  return result;
}

function buildChartDataTable(data: LiveChartExportData): (Paragraph | Table)[] {
  const fields = [
    { id: '__x', name: data.xFieldName },
    ...data.ySeries.map((series) => ({ id: series.fieldId, name: series.fieldName })),
  ];
  const records = data.points.map((point, index) => ({
    recordId: String(index),
    fields: {
      __x: point.xLabel,
      ...Object.fromEntries(data.ySeries.map((series) => [series.fieldId, point.values[series.fieldId] ?? 0])),
    },
  }));

  return buildDocxTable('Данные графика', fields, records);
}

async function renderSvgToPng(svg: string, width: number, height: number): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:white"><div id="snapshot">${svg}</div></body></html>`,
      { waitUntil: 'networkidle0' },
    );

    const element = await page.$('#snapshot');
    const screenshot = element
      ? await element.screenshot({ type: 'png' })
      : await page.screenshot({ type: 'png' });

    return Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
}

async function buildPngImageParagraph(svg: string, alt: string, width = 600, height = 300): Promise<Paragraph> {
  const png = await renderSvgToPng(svg, width, height);

  return new Paragraph({
    children: [
      new ImageRun({
        type: 'png',
        data: png,
        transformation: { width, height },
        altText: {
          title: alt,
          description: alt,
          name: alt,
        },
      }),
    ],
    spacing: { after: 120 },
  });
}

// ─── Image helpers ────────────────────────────────────────────────────────────

function getImageDimensions(buf: Buffer, type: string): { width: number; height: number } {
  try {
    // WebP: RIFF????WEBPVP8 ...
    if (buf.length > 30 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
      // VP8 lossy: bytes 26-27 width, 28-29 height (14-bit, little-endian)
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x20) {
        const w = (buf.readUInt16LE(26) & 0x3fff) + 1;
        const h = (buf.readUInt16LE(28) & 0x3fff) + 1;
        if (w > 0 && w < 32768 && h > 0 && h < 32768) return { width: w, height: h };
      }
      // VP8L lossless: byte 21 onwards
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x4c) {
        const bits = buf.readUInt32LE(21);
        const w = (bits & 0x3fff) + 1;
        const h = ((bits >> 14) & 0x3fff) + 1;
        if (w > 0 && w < 32768 && h > 0 && h < 32768) return { width: w, height: h };
      }
    }
    if (type === 'png' && buf.length > 24) {
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        const w = buf.readUInt32BE(16);
        const h = buf.readUInt32BE(20);
        if (w > 0 && w < 32768 && h > 0 && h < 32768) return { width: w, height: h };
      }
    }
    if (type === 'jpg' && buf.length > 4) {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] === 0xff) {
          const marker = buf[i + 1];
          if (marker === 0xc0 || marker === 0xc2) {
            const h = buf.readUInt16BE(i + 5);
            const w = buf.readUInt16BE(i + 7);
            if (w > 0 && w < 32768 && h > 0 && h < 32768) return { width: w, height: h };
          }
          if (i + 3 < buf.length) {
            const segLen = buf.readUInt16BE(i + 2);
            i += 2 + segLen;
          } else break;
        } else {
          i++;
        }
      }
    }
  } catch {
  }
  return { width: 400, height: 400 };
}

const MAX_WIDTH = 500;

function scaleDimensions(w: number, h: number): { width: number; height: number } {
  if (w <= MAX_WIDTH) return { width: w, height: h };
  return { width: MAX_WIDTH, height: Math.round((h / w) * MAX_WIDTH) };
}

async function fetchImageBuffer(src: string): Promise<{ data: Buffer; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null> {
  try {
    if (src.startsWith('data:')) {
      const commaIdx = src.indexOf(',');
      if (commaIdx === -1) return null;
      const header = src.slice(0, commaIdx);
      const b64 = src.slice(commaIdx + 1);
      const data = Buffer.from(b64, 'base64');
      let type: 'png' | 'jpg' | 'gif' | 'bmp';
      if (data[0] === 0x89 && data[1] === 0x50) type = 'png';
      else if (data[0] === 0xff && data[1] === 0xd8) type = 'jpg';
      else if (data[0] === 0x47 && data[1] === 0x49) type = 'gif';
      else if (data[0] === 0x42 && data[1] === 0x4d) type = 'bmp';
      else if (data[0] === 0x52 && data[1] === 0x49) type = 'png';
      else type = header.includes('png') ? 'png' : header.includes('gif') ? 'gif' : 'jpg';
      return { data, type };
    }

    if (src.startsWith('http://') || src.startsWith('https://')) {
      const res = await fetch(src);
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') ?? '';
      const type = ct.includes('png') ? 'png'
        : ct.includes('gif') ? 'gif'
        : ct.includes('bmp') ? 'bmp'
        : 'jpg';
      const buf = await res.arrayBuffer();
      return { data: Buffer.from(buf), type };
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Inline runs ──────────────────────────────────────────────────────────────

function buildInlineRuns(
  inlineNodes: BlockNode['inlineNodes'],
  link?: LinkContext,
): (TextRun | ExternalHyperlink)[] {
  if (!inlineNodes || inlineNodes.length === 0) return [new TextRun('')];

  return inlineNodes.map((n) => {
    if (n.type === 'hard_break') {
      return new TextRun({ break: 1 });
    }
    if (n.type === 'page_link' && n.pageId && link?.appBaseUrl && link?.spaceId) {
      const url = pageUrl(link, n.pageId);
      return new ExternalHyperlink({
        link: url,
        children: [new TextRun({ text: n.text ?? n.pageTitle ?? 'Страница', style: 'Hyperlink' })],
      });
    }
    if (n.type === 'link' && n.href) {
      return new ExternalHyperlink({
        link: n.href,
        children: [new TextRun({ text: n.text ?? n.href, style: 'Hyperlink' })],
      });
    }
    return new TextRun({
      text: n.text ?? '',
      bold: n.bold,
      italics: n.italic,
      strike: n.strike,
      font: n.code ? 'Courier New' : undefined,
    });
  });
}

function makeRuns(content: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>): (TextRun | ExternalHyperlink)[] {
  if (!marks || marks.length === 0) return [new TextRun(content)];

  const opts: Record<string, unknown> = { text: content };
  let linkHref: string | null = null;

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': opts.bold = true; break;
      case 'italic': opts.italics = true; break;
      case 'strike': opts.strike = true; break;
      case 'underline': opts.underline = {}; break;
      case 'code': opts.font = 'Courier New'; opts.shading = { fill: 'F2F3F5' }; break;
      case 'link': linkHref = (mark.attrs?.href as string) ?? null; break;
    }
  }

  if (linkHref) {
    return [new ExternalHyperlink({ link: linkHref, children: [new TextRun(opts)] })];
  }
  return [new TextRun(opts)];
}

function buildParagraphTextRuns(content: string): (TextRun | ExternalHyperlink)[] {
  return [new TextRun(content)];
}

// ─── Block → docx elements ────────────────────────────────────────────────────

async function buildResolvedInlineRuns(
  block: BlockNode,
  resolveInlineNodes: ReturnType<typeof createInlineNodeResolver>['resolveInlineNodes'],
  link?: LinkContext,
): Promise<(TextRun | ExternalHyperlink)[]> {
  if (block.inlineNodes && block.inlineNodes.length > 0) {
    const resolvedNodes = await resolveInlineNodes(block.inlineNodes);
    return buildInlineRuns(resolvedNodes, link);
  }

  return buildParagraphTextRuns(block.content ?? '');
}

async function renderBlockText(
  block: BlockNode,
  resolveInlineNodes: ReturnType<typeof createInlineNodeResolver>['resolveInlineNodes'],
): Promise<string> {
  if (block.inlineNodes && block.inlineNodes.length > 0) {
    const resolvedNodes = await resolveInlineNodes(block.inlineNodes);
    return resolvedNodes.map((node) => {
      if (node.type === 'hard_break') {
        return '\n';
      }
      return node.text ?? node.pageTitle ?? '';
    }).join('');
  }

  if (block.content) {
    return block.content;
  }

  if (block.children) {
    const parts = await Promise.all(block.children.map((child) => renderBlockText(child, resolveInlineNodes)));
    return parts.join(' ');
  }

  return '';
}

async function blockToDocxElements(
  block: BlockNode,
  resolveInlineNodes: ReturnType<typeof createInlineNodeResolver>['resolveInlineNodes'],
  auth?: AuthContext,
  link?: LinkContext,
): Promise<(Paragraph | Table)[]> {
  switch (block.type) {
    case 'heading': {
      const hLevel = Math.min(Math.max(block.level ?? 1, 1), 3) as 1 | 2 | 3;
      const headings = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
      return [new Paragraph({
        heading: headings[hLevel],
        children: await buildResolvedInlineRuns(block, resolveInlineNodes, link),
        spacing: { before: block.level === 1 ? 0 : 240, after: 120 },
      })];
    }

    case 'paragraph':
    case 'text': {
      const runs = await buildResolvedInlineRuns(block, resolveInlineNodes, link);
      return [new Paragraph({
        children: runs,
        spacing: { after: 120 },
      })];
    }

    case 'image': {
      const src = block.src ?? '';
      const img = await fetchImageBuffer(src);
      if (img) {
        const natural = getImageDimensions(img.data, img.type);
        const { width, height } = scaleDimensions(natural.width, natural.height);
        try {          return [new Paragraph({
            children: [new ImageRun({
              data: img.data,
              transformation: { width, height },
              type: img.type,
            })],
            spacing: { after: 120 },
          })];
        } catch (err) {
          console.error('[docx] ImageRun error:', err);
        }
      }
      // Fallback если не удалось загрузить
      return [new Paragraph({
        children: [new TextRun({ text: `📷 ${block.alt || 'Изображение'}`, italics: true, color: '6B7898' })],
        spacing: { after: 120 },
      })];
    }

    case 'iframe':
      return [new Paragraph({
        children: [new TextRun({ text: `🔗 ${block.src ?? ''}`, italics: true, color: '6B7898', size: 20 })],
        spacing: { after: 120 },
      })];

    case 'table': {
      if (block.datasheetId) {
        const data = await fetchTableData(block.datasheetId, block.viewId, auth);
        if (data && data.fields.length > 0) {
          return buildDocxTable(block.content ?? '', data.fields, data.records);
        }
      }
      return [new Paragraph({
        children: [new TextRun({ text: block.content ?? 'Таблица MWS', italics: true, color: '6B7898' })],
        spacing: { after: 120 },
      })];
    }

    case 'live_chart': {
      const chartData = await buildLiveChartExportData(block, auth);
      if (!chartData) {
        return [new Paragraph({
          children: [new TextRun({ text: '📈 График недоступен', italics: true, color: '6B7898' })],
          spacing: { after: 120 },
        })];
      }

      return [
        await buildPngImageParagraph(renderLiveChartSvg(chartData), 'Live chart'),
        ...buildChartDataTable(chartData),
      ];
    }

    case 'mermaid_diagram': {
      return [
        await buildPngImageParagraph(renderMermaidCodeSvg(block.mermaidCode ?? ''), 'Mermaid diagram'),
        new Paragraph({
          children: [new TextRun({ text: block.mermaidCode ?? '', font: 'Courier New', size: 18 })],
          shading: { fill: 'F2F3F5' },
          spacing: { after: 160 },
        }),
      ];
    }

    case 'page_link': {
      const label = block.pageTitle ?? block.content ?? 'Страница';
      if (link?.appBaseUrl && link?.spaceId && block.pageId) {
        const url = pageUrl(link, block.pageId);
        return [new Paragraph({
          children: [new ExternalHyperlink({
            link: url,
            children: [new TextRun({ text: label, style: 'Hyperlink' })],
          })],
          spacing: { after: 80 },
        })];
      }
      return [new Paragraph({
        children: [new TextRun(label)],
        spacing: { after: 80 },
      })];
    }

    case 'code_block': {
      const langLine = block.language ? `${block.language}\n` : '';
      return [new Paragraph({
        children: [new TextRun({ text: `${langLine}${block.content ?? ''}`, font: 'Courier New', size: 18 })],
        shading: { fill: 'F2F3F5' },
        spacing: { after: 160, before: 80 },
      })];
    }

    case 'bullet_list': {
      const items = await Promise.all((block.children ?? []).map(async (child) => {
        return new Paragraph({
          bullet: { level: 0 },
          children: await buildResolvedInlineRuns(child, resolveInlineNodes, link),
          spacing: { after: 60 },
          indent: { left: 360, hanging: 360 },
        });
      }));
      return items;
    }

    case 'ordered_list': {
      const items = await Promise.all((block.children ?? []).map(async (child) => {
        return new Paragraph({
          numbering: { reference: 'default-numbering', level: 0 },
          children: await buildResolvedInlineRuns(child, resolveInlineNodes, link),
          spacing: { after: 60 },
          indent: { left: 360, hanging: 360 },
        });
      }));
      return items;
    }

    case 'task_item': {
      const prefix = block.checked ? '☑ ' : '☐ ';
      const text = await renderBlockText(block, resolveInlineNodes);
      return [new Paragraph({
        children: [new TextRun(`${prefix}${text}`)],
        spacing: { after: 60 },
      })];
    }

    case 'blockquote': {
      const text = await renderBlockText(block, resolveInlineNodes);
      return [new Paragraph({
        children: [new TextRun({ text, italics: true, color: '5A6676' })],
        indent: { left: 480 },
        shading: { fill: 'F8F9FA' },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'D70032' } },
        spacing: { after: 120 },
      })];
    }

    case 'horizontal_rule':
      return [new Paragraph({
        children: [new TextRun({ text: '─'.repeat(50), color: 'D2D8E3' })],
        spacing: { after: 120 },
      })];

    default:
      return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateDocx(title: string, blocks: BlockNode[], auth?: AuthContext, link?: LinkContext): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  const inlineNodeResolver = createInlineNodeResolver(auth);

  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: title, bold: true, size: 36 })],
    spacing: { after: 240 },
  }));

  for (const block of blocks) {
    const elements = await blockToDocxElements(block, inlineNodeResolver.resolveInlineNodes, auth, link);
    children.push(...elements);
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'left' }],
      }],
    },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}
