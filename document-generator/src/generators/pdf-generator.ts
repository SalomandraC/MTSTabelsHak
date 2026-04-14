import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import type { BlockNode, PdfOptions } from '../types.js';
import { DEFAULT_PDF_OPTIONS } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load template from file; fall back to inline if file not found (e.g. during tests)
function loadTemplate(): HandlebarsTemplateDelegate {
  try {
    const tplPath = join(__dirname, '..', 'templates', 'pdf', 'document.hbs');
    const src = readFileSync(tplPath, 'utf-8');
    return Handlebars.compile(src);
  } catch {
    // Inline fallback
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
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Inline content renderer (handles marks on text nodes) ───────────────────

function renderInlineNodes(nodes: BlockNode[]): string {
  return nodes.map((n) => {
    let text = esc(n.content ?? '');
    if (n.marks) {
      for (const mark of n.marks) {
        switch (mark.type) {
          case 'bold': text = `<strong>${text}</strong>`; break;
          case 'italic': text = `<em>${text}</em>`; break;
          case 'strike': text = `<s>${text}</s>`; break;
          case 'underline': text = `<u>${text}</u>`; break;
          case 'code': text = `<code>${text}</code>`; break;
          case 'highlight': {
            const color = (mark.attrs?.color as string) ?? '#fef08a';
            text = `<mark style="background-color:${escAttr(color)}">${text}</mark>`;
            break;
          }
          case 'link': {
            const href = escAttr((mark.attrs?.href as string) ?? '#');
            text = `<a href="${href}">${text}</a>`;
            break;
          }
        }
      }
    }
    return text;
  }).join('');
}

// ─── Block compiler ───────────────────────────────────────────────────────────

function compileBlock(block: BlockNode): string {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(Math.max(block.level ?? 1, 1), 6);
      return `<h${level}>${esc(block.content ?? '')}</h${level}>`;
    }

    case 'paragraph':
    case 'text':
      return `<p>${esc(block.content ?? '')}</p>`;

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
      // Convert YouTube watch URLs to embed
      const embedSrc = src
        .replace(/youtube\.com\/watch\?v=([^&]+)/, 'youtube.com/embed/$1')
        .replace(/youtu\.be\/([^?]+)/, 'youtube.com/embed/$1');
      return `<div class="iframe-placeholder">🔗 Встроенный контент: <a href="${escAttr(src)}">${esc(src)}</a></div>`;
    }

    case 'table':
      return `<div class="table-placeholder">📊 ${esc(block.content ?? 'Таблица MWS')}</div>`;

    case 'code_block': {
      const lang = block.language ? `<div class="lang-label">${esc(block.language)}</div>` : '';
      return `<pre>${lang}<code>${esc(block.content ?? '')}</code></pre>`;
    }

    case 'bullet_list': {
      const items = (block.children ?? []).map((c) => `<li>${compileChildContent(c)}</li>`).join('');
      return `<ul>${items}</ul>`;
    }

    case 'ordered_list': {
      const items = (block.children ?? []).map((c) => `<li>${compileChildContent(c)}</li>`).join('');
      return `<ol>${items}</ol>`;
    }

    case 'task_list': {
      const items = (block.children ?? []).map((c) => {
        if (c.type === 'task_item') {
          const icon = c.checked ? '☑' : '☐';
          const text = (c.children ?? []).map(compileChildContent).join(' ');
          return `<li class="task-item"><span>${icon}</span><span>${esc(text)}</span></li>`;
        }
        return `<li>${compileChildContent(c)}</li>`;
      }).join('');
      return `<ul style="list-style:none;padding-left:0">${items}</ul>`;
    }

    case 'task_item': {
      const icon = block.checked ? '☑' : '☐';
      const text = (block.children ?? []).map(compileChildContent).join(' ');
      return `<div class="task-item"><span>${icon}</span><span>${esc(text)}</span></div>`;
    }

    case 'blockquote': {
      const inner = (block.children ?? []).map(compileBlock).join('');
      return `<blockquote>${inner}</blockquote>`;
    }

    case 'horizontal_rule':
      return '<hr>';

    default:
      return block.content ? `<p>${esc(block.content)}</p>` : '';
  }
}

function compileChildContent(block: BlockNode): string {
  if (block.content) return esc(block.content);
  if (block.children) return block.children.map(compileBlock).join('');
  return '';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generatePdf(
  title: string,
  blocks: BlockNode[],
  opts: PdfOptions = {},
): Promise<Buffer> {
  const options = { ...DEFAULT_PDF_OPTIONS, ...opts };
  const body = blocks.map(compileBlock).join('\n');
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
