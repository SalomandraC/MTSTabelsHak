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
      lines.push(`${pad}${block.content ?? ''}`);
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
      lines.push(`${pad}> 📊 ${block.content ?? 'MWS Table — просмотрите в оригинале'}`);
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

function renderInline(block: BlockNode): string {
  if (block.content) return block.content;
  if (block.children) return block.children.map(renderInline).join(' ');
  return '';
}
