import type { BlockNode } from '../types.js';
import { createInlineNodeResolver, type ExportAuthContext } from '../live-inline.js';

type AuthContext = ExportAuthContext;

export async function generateMarkdown(title: string, blocks: BlockNode[], auth?: AuthContext): Promise<string> {
  const lines: string[] = [];
  const inlineNodeResolver = createInlineNodeResolver(auth);

  if (title) {
    lines.push(`# ${title}`);
    lines.push('');
  }

  for (const block of blocks) {
    await renderBlock(block, lines, 0, inlineNodeResolver.resolveInlineNodes);
  }

  return lines.join('\n').trim() + '\n';
}

async function renderBlock(
  block: BlockNode,
  lines: string[],
  indent: number,
  resolveInlineNodes: ReturnType<typeof createInlineNodeResolver>['resolveInlineNodes'],
): Promise<void> {
  const pad = '  '.repeat(indent);

  switch (block.type) {
    case 'heading': {
      const prefix = '#'.repeat(block.level ?? 1);
      lines.push(`${pad}${prefix} ${await renderInline(block, resolveInlineNodes)}`);
      lines.push('');
      break;
    }
    case 'paragraph':
    case 'text': {
      const text = await renderInline(block, resolveInlineNodes);
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
        lines.push(`${pad}- ${await renderInline(child, resolveInlineNodes)}`);
      }
      lines.push('');
      break;
    }
    case 'ordered_list': {
      const arr = block.children ?? [];
      for (let i = 0; i < arr.length; i++) {
        lines.push(`${pad}${i + 1}. ${await renderInline(arr[i]!, resolveInlineNodes)}`);
      }
      lines.push('');
      break;
    }
    case 'task_item': {
      const check = block.checked ? '[x]' : '[ ]';
      const parts = await Promise.all((block.children ?? []).map((child) => renderInline(child, resolveInlineNodes)));
      const text = parts.join(' ');
      lines.push(`${pad}- ${check} ${text}`);
      break;
    }
    case 'blockquote': {
      const parts = await Promise.all((block.children ?? []).map((child) => renderInline(child, resolveInlineNodes)));
      const text = parts.join(' ');
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

async function renderInlineNodes(
  block: BlockNode,
  resolveInlineNodes: ReturnType<typeof createInlineNodeResolver>['resolveInlineNodes'],
): Promise<string> {
  if (!block.inlineNodes || block.inlineNodes.length === 0) {
    return block.content ?? '';
  }

  const resolvedNodes = await resolveInlineNodes(block.inlineNodes);

  return resolvedNodes.map((n) => {
    if (n.type === 'hard_break') {
      return '  \n';
    }
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

async function renderInline(
  block: BlockNode,
  resolveInlineNodes: ReturnType<typeof createInlineNodeResolver>['resolveInlineNodes'],
): Promise<string> {
  if (block.inlineNodes) return renderInlineNodes(block, resolveInlineNodes);
  if (block.content) return block.content;
  if (block.children) {
    const parts = await Promise.all(block.children.map((child) => renderInline(child, resolveInlineNodes)));
    return parts.join(' ');
  }
  return '';
}
