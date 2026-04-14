import type { BlockNode } from '../types.js';

export function generateMarkdown(title: string, blocks: BlockNode[]): string {
  const lines: string[] = [];

  if (title) {
    lines.push(`# ${title}`);
    lines.push('');
  }

  for (const block of blocks) {
    renderBlock(block, lines, 0);
  }

  return lines.join('\n').trim() + '\n';
}

function renderBlock(block: BlockNode, lines: string[], indent: number): void {
  const pad = '  '.repeat(indent);

  switch (block.type) {
    case 'heading': {
      const prefix = '#'.repeat(block.level ?? 1);
      lines.push(`${pad}${prefix} ${block.content ?? ''}`);
      lines.push('');
      break;
    }
    case 'paragraph':
    case 'text': {
      const text = renderInlineNodes(block);
      lines.push(`${pad}${text}`);
      lines.push('');
      break;
    }
    case 'page_link': {
      // standalone page link block
      const label = block.pageTitle ?? block.content ?? 'Страница';
      if (block.pageId && block.href) {
        lines.push(`${pad}[${label}](${block.href})`);
      } else {
        lines.push(`${pad}${label}`);
      }
      lines.push('');
      break;
    }
    case 'image': {
      lines.push(`${pad}![${block.alt ?? ''}](${block.src ?? ''})`);
      lines.push('');
      break;
    }
    case 'iframe': {
      lines.push(`${pad}<!-- Embedded content: ${block.src ?? ''} -->`);
      lines.push('');
      break;
    }
    case 'table': {
      lines.push(`${pad}> 📊 ${block.content ?? 'MWS Table'}`);
      lines.push('');
      break;
    }
    case 'code_block': {
      const lang = block.language ?? '';
      lines.push(`${pad}\`\`\`${lang}`);
      lines.push(block.content ?? '');
      lines.push(`${pad}\`\`\``);
      lines.push('');
      break;
    }
    case 'bullet_list': {
      for (const child of block.children ?? []) {
        lines.push(`${pad}- ${renderInline(child)}`);
      }
      lines.push('');
      break;
    }
    case 'ordered_list': {
      const arr = block.children ?? [];
      for (let i = 0; i < arr.length; i++) {
        lines.push(`${pad}${i + 1}. ${renderInline(arr[i])}`);
      }
      lines.push('');
      break;
    }
    case 'task_item': {
      const check = block.checked ? '[x]' : '[ ]';
      const text = (block.children ?? []).map(renderInline).join(' ');
      lines.push(`${pad}- ${check} ${text}`);
      break;
    }
    case 'blockquote': {
      const text = (block.children ?? []).map(renderInline).join(' ');
      lines.push(`${pad}> ${text}`);
      lines.push('');
      break;
    }
    case 'horizontal_rule': {
      lines.push(`${pad}---`);
      lines.push('');
      break;
    }
    default: {
      if (block.content) {
        lines.push(`${pad}${block.content}`);
        lines.push('');
      }
    }
  }
}

// Render inlineNodes to Markdown if available, otherwise fall back to content
function renderInlineNodes(block: BlockNode): string {
  if (!block.inlineNodes || block.inlineNodes.length === 0) {
    return block.content ?? '';
  }

  return block.inlineNodes.map((n) => {
    if (n.type === 'page_link') {
      const label = n.pageTitle ?? n.text ?? 'Страница';
      if (n.href) return `[${label}](${n.href})`;
      if (n.pageId) return `[${label}](#page-${n.pageId})`;
      return label;
    }
    if (n.type === 'link' && n.href) {
      return `[${n.text ?? n.href}](${n.href})`;
    }
    let text = n.text ?? '';
    if (n.bold) text = `**${text}**`;
    if (n.italic) text = `*${text}*`;
    if (n.strike) text = `~~${text}~~`;
    if (n.code) text = `\`${text}\``;
    return text;
  }).join('');
}

function renderInline(block: BlockNode): string {
  if (block.inlineNodes) return renderInlineNodes(block);
  if (block.content) return block.content;
  if (block.children) return block.children.map(renderInline).join(' ');
  return '';
}
