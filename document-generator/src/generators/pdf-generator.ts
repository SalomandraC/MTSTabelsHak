import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import type { BlockNode, PdfOptions } from '../types.js';
import { DEFAULT_PDF_OPTIONS } from '../types.js';

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 20mm 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #1f1f1f;
    margin: 0; padding: 0;
  }
  h1 { font-size: 22pt; font-weight: 700; margin: 0 0 12pt; border-bottom: 2px solid #d70032; padding-bottom: 6pt; }
  h2 { font-size: 17pt; font-weight: 600; margin: 18pt 0 8pt; }
  h3 { font-size: 14pt; font-weight: 600; margin: 14pt 0 6pt; }
  p { margin: 0 0 8pt; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 10pt; background: #f2f3f5; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f2f3f5; padding: 12px 16px; border-radius: 6px; overflow-x: auto; font-size: 10pt; margin: 12pt 0; }
  pre code { background: none; padding: 0; }
  img { max-width: 100%; height: auto; margin: 8pt 0; border-radius: 6px; }
  iframe { width: 100%; height: 300px; border: 1px solid #d2d8e3; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 12pt 0; font-size: 11pt; }
  th, td { border: 1px solid #d2d8e3; padding: 6px 10px; text-align: left; }
  th { background: #f2f3f5; font-weight: 600; }
  blockquote { border-left: 3px solid #d70032; margin: 12pt 0; padding: 8pt 16pt; background: #f8f9fa; color: #5a6676; }
  ul, ol { margin: 8pt 0; padding-left: 24pt; }
  li { margin: 4pt 0; }
  hr { border: none; border-top: 1px solid #d2d8e3; margin: 16pt 0; }
  .task-item { display: flex; align-items: flex-start; gap: 6pt; margin: 4pt 0; }
  .task-checked::before { content: '☑'; }
  .task-unchecked::before { content: '☐'; }
  a { color: #d70032; text-decoration: underline; }
  .table-placeholder { background: #f8f9fa; border: 2px dashed #d2d8e3; border-radius: 8px; padding: 16px; text-align: center; color: #6b7898; margin: 12pt 0; }
</style>
</head>
<body>
{{#if title}}<h1>{{title}}</h1>{{/if}}
{{{body}}}
</body>
</html>`;

function compileBlock(block: BlockNode): string {
  switch (block.type) {
    case 'heading': {
      const tag = `h${Math.min(block.level ?? 1, 3)}`;
      return `<${tag}>${esc(block.content ?? '')}</${tag}>`;
    }
    case 'paragraph':
    case 'text':
      return `<p>${esc(block.content ?? '')}</p>`;
    case 'image': {
      const src = block.src ?? '';
      const alt = esc(block.alt ?? '');
      if (src.startsWith('data:') || src.startsWith('http')) {
        return `<img src="${escA(src)}" alt="${alt}">`;
      }
      return `<p><em>Изображение: ${alt}</em></p>`;
    }
    case 'iframe': {
      const src = block.src ?? '';
      const embedSrc = src.includes('embed') ? src : src.replace('/watch?v=', '/embed/').replace('youtu.be/', 'www.youtube.com/embed/');
      return `<iframe src="${escA(embedSrc)}" frameborder="0" allowfullscreen></iframe>`;
    }
    case 'table':
      return `<div class="table-placeholder">📊 ${esc(block.content ?? 'Таблица')}</div>`;
    case 'code_block': {
      const lang = block.language ? `<div style="font-size:9pt;color:#6b7898;margin-bottom:4px">${esc(block.language)}</div>` : '';
      return `<pre>${lang}<code>${esc(block.content ?? '')}</code></pre>`;
    }
    case 'bullet_list': {
      const items = (block.children ?? []).map((c: BlockNode) => `<li>${compileChildren(c)}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    case 'ordered_list': {
      const items = (block.children ?? []).map((c: BlockNode) => `<li>${compileChildren(c)}</li>`).join('');
      return `<ol>${items}</ol>`;
    }
    case 'task_list': {
      const items = (block.children ?? []).map((c: BlockNode) => {
        if (c.type === 'task_item') {
          const cls = c.checked ? 'task-checked' : 'task-unchecked';
          const text = (c.children ?? []).map((ch: BlockNode) => ch.content ?? '').join(' ');
          return `<div class="task-item"><span class="${cls}"></span><span>${esc(text)}</span></div>`;
        }
        return compileBlock(c);
      }).join('');
      return `<div style="margin:8pt 0">${items}</div>`;
    }
    case 'blockquote': {
      const inner = (block.children ?? []).map(compileBlock).join('');
      return `<blockquote>${inner}</blockquote>`;
    }
    case 'horizontal_rule':
      return '<hr>';
    default:
      return '';
  }
}

function compileChildren(block: BlockNode): string {
  if (block.content) return esc(block.content);
  if (block.children) return block.children.map(compileBlock).join('');
  return '';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escA(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function generatePdf(title: string, blocks: BlockNode[], opts: PdfOptions = {}): Promise<Buffer> {
  const options = { ...DEFAULT_PDF_OPTIONS, ...opts };
  const body = blocks.map(compileBlock).join('\n');
  const template = Handlebars.compile(HTML_TEMPLATE);
  const html = template({ title, body });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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
