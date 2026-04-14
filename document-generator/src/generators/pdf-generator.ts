import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import type { BlockNode, PdfOptions } from '../types.js';
import { DEFAULT_PDF_OPTIONS } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTemplate(): HandlebarsTemplateDelegate {
  try {
    const tplPath = join(__dirname, '..', 'templates', 'pdf', 'document.hbs');
    const src = readFileSync(tplPath, 'utf-8');
    return Handlebars.compile(src);
  } catch {
    return Handlebars.compile(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page{size:A4;margin:20mm 15mm}
  body{font-family:sans-serif;font-size:12pt;line-height:1.6;color:#1f1f1f}
  h1{font-size:22pt;border-bottom:2px solid #d70032;padding-bottom:6pt}
  h2{font-size:17pt}h3{font-size:14pt}
  p{margin:0 0 8pt}
  code{background:#f2f3f5;padding:1px 4px;border-radius:3px;font-size:10pt}
  pre{background:#f2f3f5;padding:12px;border-radius:6px;font-size:10pt;white-space:pre-wrap}
  table{width:100%;border-collapse:collapse;margin:12pt 0}
  th,td{border:1px solid #d2d8e3;padding:6px 10px}
  th{background:#f2f3f5;font-weight:600}
  blockquote{border-left:3px solid #d70032;margin:12pt 0;padding:8pt 16pt;background:#f8f9fa}
  ul,ol{margin:8pt 0;padding-left:24pt}
  hr{border:none;border-top:1px solid #d2d8e3;margin:16pt 0}
  mark{background:#fef08a;padding:0 2px}
  .table-placeholder{background:#f8f9fa;border:2px dashed #d2d8e3;border-radius:8px;padding:16px;text-align:center;color:#6b7898}
</style></head><body>{{#if title}}<h1>{{title}}</h1>{{/if}}{{{body}}}</body></html>`);
  }
}

// ─── HTML escaping ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── MWS table data fetcher ───────────────────────────────────────────────────

const API_BASE = process.env.API_BASE_URL ?? 'http://api:8080';

type MwsField = { id: string; name: string };
type MwsRecord = { recordId: string; fields: Record<string, unknown> };

type AuthContext = {
  accessToken?: string;
  userId?: string;
  displayName?: string;
};

type LinkContext = {
  appBaseUrl: string;
  spaceId: string;
};

function pageUrl(ctx: LinkContext, pageId: string): string {
  const base = ctx.appBaseUrl.replace(/\/$/, '');
  return `${base}/spaces/${encodeURIComponent(ctx.spaceId)}/pages/${encodeURIComponent(pageId)}`;
}

function buildAuthHeaders(auth?: AuthContext): Record<string, string> {
  if (auth?.accessToken) {
    return { Authorization: `Bearer ${auth.accessToken}` };
  }
  if (auth?.userId) {
    return {
      'x-user-id': auth.userId,
      'x-user-name': auth.displayName ?? auth.userId,
    };
  }
  return { 'x-user-id': 'docgen', 'x-user-name': 'Document Generator' };
}

async function fetchTableData(
  datasheetId: string,
  viewId?: string | null,
  auth?: AuthContext,
): Promise<{ fields: MwsField[]; records: MwsRecord[] } | null> {
  const headers = buildAuthHeaders(auth);
  try {
    const fieldsUrl = `${API_BASE}/api/v1/mws/datasheets/${datasheetId}/fields${viewId ? `?viewId=${viewId}` : ''}`;
    const fieldsRes = await fetch(fieldsUrl, { headers });
    if (!fieldsRes.ok) return null;
    const { items: fields } = await fieldsRes.json() as { items: MwsField[] };

    const recordsUrl = `${API_BASE}/api/v1/mws/datasheets/${datasheetId}/records?pageSize=100&fieldKey=id&cellFormat=json${viewId ? `&viewId=${viewId}` : ''}`;
    const recordsRes = await fetch(recordsUrl, { headers });
    if (!recordsRes.ok) return null;
    const { items: records } = await recordsRes.json() as { items: MwsRecord[] };

    return { fields, records };
  } catch {
    return null;
  }
}

function renderTableHtml(title: string, fields: MwsField[], records: MwsRecord[]): string {
  const headers = fields.map((f) => `<th>${esc(f.name)}</th>`).join('');
  const rows = records.map((r) => {
    const cells = fields.map((f) => {
      const val = r.fields[f.id];
      const text = val == null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `<td>${esc(text)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <div style="margin:12pt 0">
      ${title ? `<p style="font-weight:600;margin-bottom:6px">${esc(title)}</p>` : ''}
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── Block compiler ───────────────────────────────────────────────────────────

async function compileBlock(block: BlockNode, auth?: AuthContext, link?: LinkContext): Promise<string> {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(Math.max(block.level ?? 1, 1), 6);
      return `<h${level}>${block.content ?? ''}</h${level}>`;
    }

    case 'paragraph':
    case 'text':
      return `<p>${block.content ?? ''}</p>`;

    case 'image': {
      const src = block.src ?? '';
      const alt = esc(block.alt ?? '');
      if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
        return `<img src="${escAttr(src)}" alt="${alt}">`;
      }
      return `<p><em>📷 ${alt || 'Изображение'}</em></p>`;
    }

    case 'iframe': {
      const src = block.src ?? '';
      return `<div class="iframe-placeholder">🔗 Встроенный контент: <a href="${escAttr(src)}">${esc(src)}</a></div>`;
    }

    case 'table': {
      if (block.datasheetId) {
        const data = await fetchTableData(block.datasheetId, block.viewId, auth);
        if (data && data.fields.length > 0) {
          return renderTableHtml(block.content ?? '', data.fields, data.records);
        }
      }
      return `<div class="table-placeholder">📊 ${esc(block.content ?? 'Таблица MWS')}</div>`;
    }

    case 'page_link': {
      const label = esc(block.pageTitle ?? block.content ?? 'Страница');
      console.log(`[pdf] page_link: pageId=${block.pageId} label=${label} appBaseUrl=${link?.appBaseUrl} spaceId=${link?.spaceId}`);
      if (link?.appBaseUrl && link?.spaceId && block.pageId) {
        const url = pageUrl(link, block.pageId);
        return `<a href="${escAttr(url)}">${label}</a>`;
      }
      return `<span>${label}</span>`;
    }

    case 'code_block': {
      const lang = block.language ? `<div class="lang-label">${esc(block.language)}</div>` : '';
      return `<pre>${lang}<code>${esc(block.content ?? '')}</code></pre>`;
    }

    case 'bullet_list': {
      const items = await Promise.all((block.children ?? []).map(async (c) => `<li>${await compileChildContent(c, auth, link)}</li>`));
      return `<ul>${items.join('')}</ul>`;
    }

    case 'ordered_list': {
      const items = await Promise.all((block.children ?? []).map(async (c) => `<li>${await compileChildContent(c, auth, link)}</li>`));
      return `<ol>${items.join('')}</ol>`;
    }

    case 'task_list': {
      const items = await Promise.all((block.children ?? []).map(async (c) => {
        if (c.type === 'task_item') {
          const icon = c.checked ? '☑' : '☐';
          const text = (c.children ?? []).map((ch) => ch.content ?? '').join(' ');
          return `<li class="task-item"><span>${icon}</span><span>${esc(text)}</span></li>`;
        }
        return `<li>${await compileChildContent(c, auth, link)}</li>`;
      }));
      return `<ul style="list-style:none;padding-left:0">${items.join('')}</ul>`;
    }

    case 'task_item': {
      const icon = block.checked ? '☑' : '☐';
      const text = (block.children ?? []).map((ch) => ch.content ?? '').join(' ');
      return `<div class="task-item"><span>${icon}</span><span>${esc(text)}</span></div>`;
    }

    case 'blockquote': {
      const inner = await Promise.all((block.children ?? []).map((c) => compileBlock(c, auth, link)));
      return `<blockquote>${inner.join('')}</blockquote>`;
    }

    case 'horizontal_rule':
      return '<hr>';

    default:
      return block.content ? `<p>${esc(block.content)}</p>` : '';
  }
}

async function compileChildContent(block: BlockNode, auth?: AuthContext, link?: LinkContext): Promise<string> {
  if (block.content) return esc(block.content);
  if (block.children) {
    const parts = await Promise.all(block.children.map((c) => compileBlock(c, auth, link)));
    return parts.join('');
  }
  return '';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generatePdf(
  title: string,
  blocks: BlockNode[],
  opts: PdfOptions = {},
  auth?: AuthContext,
  link?: LinkContext,
): Promise<Buffer> {
  const options = { ...DEFAULT_PDF_OPTIONS, ...opts };
  const parts = await Promise.all(blocks.map((b) => compileBlock(b, auth, link)));
  const body = parts.join('\n');
  const template = loadTemplate();
  const html = template({ title, body });

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
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: options.pageSize,
      margin: options.margin,
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
