import type { ProseMirrorNode, ProseMirrorDocument, BlockNode } from './types.js';
export type { BlockNode } from './types.js';

/**
 * Flatten a ProseMirror document into a list of renderable blocks.
 */
export function flattenDocument(doc: ProseMirrorDocument | ProseMirrorNode[]): BlockNode[] {
  const content = Array.isArray(doc) ? doc : (doc as ProseMirrorDocument).content ?? [];
  const blocks: BlockNode[] = [];

  for (const node of content) {
    flattenNode(node, blocks);
  }

  return blocks;
}

function flattenNode(node: ProseMirrorNode, blocks: BlockNode[]): void {
  switch (node.type) {
    case 'rootblock': {
      // rootblock wraps a single block — flatten its content
      if (node.content) {
        for (const child of node.content) {
          flattenNode(child, blocks);
        }
      }
      break;
    }

    case 'heading': {
      blocks.push({
        type: 'heading',
        level: (node.attrs?.level as number) ?? 1,
        content: extractText(node),
      });
      break;
    }

    case 'paragraph': {
      // Check for inline images
      if (node.content?.length === 1 && node.content[0].type === 'image') {
        flattenNode(node.content[0], blocks);
        return;
      }
      blocks.push({
        type: 'paragraph',
        content: renderInlineContent(node.content ?? []),
        marks: extractMarks(node.content ?? []),
      });
      break;
    }

    case 'text': {
      blocks.push({
        type: 'text',
        content: node.text ?? '',
        marks: node.marks,
      });
      break;
    }

    case 'image': {
      blocks.push({
        type: 'image',
        src: (node.attrs?.src as string) ?? '',
        alt: (node.attrs?.alt as string) ?? '',
      });
      break;
    }

    case 'iframeBlock': {
      blocks.push({
        type: 'iframe',
        src: (node.attrs?.src as string) ?? '',
      });
      break;
    }

    case 'mwsTableEmbed': {
      blocks.push({
        type: 'table',
        content: (node.attrs?.title as string) ?? 'MWS Table',
        datasheetId: (node.attrs?.datasheetId as string) ?? null,
        viewId: (node.attrs?.viewId as string) ?? null,
        spaceId: (node.attrs?.spaceId as string) ?? null,
      });
      break;
    }

    case 'codeBlock': {
      blocks.push({
        type: 'code_block',
        content: extractText(node),
        language: (node.attrs?.language as string) ?? '',
      });
      break;
    }

    case 'bulletList': {
      const items: BlockNode[] = [];
      for (const child of node.content ?? []) {
        flattenNode(child, items);
      }
      blocks.push({ type: 'bullet_list', children: items });
      break;
    }

    case 'orderedList': {
      const items: BlockNode[] = [];
      for (const child of node.content ?? []) {
        flattenNode(child, items);
      }
      blocks.push({ type: 'ordered_list', children: items });
      break;
    }

    case 'taskList': {
      const items: BlockNode[] = [];
      for (const child of node.content ?? []) {
        flattenNode(child, items);
      }
      blocks.push({ type: 'task_list', children: items });
      break;
    }

    case 'taskItem': {
      const contentBlocks: BlockNode[] = [];
      for (const child of node.content ?? []) {
        flattenNode(child, contentBlocks);
      }
      blocks.push({
        type: 'task_item',
        checked: (node.attrs?.checked as boolean) ?? false,
        children: contentBlocks,
      });
      break;
    }

    case 'blockquote': {
      const contentBlocks: BlockNode[] = [];
      for (const child of node.content ?? []) {
        flattenNode(child, contentBlocks);
      }
      blocks.push({ type: 'blockquote', children: contentBlocks });
      break;
    }

    case 'horizontalRule': {
      blocks.push({ type: 'horizontal_rule' });
      break;
    }

    default: {
      // Fallback: try to extract text
      const text = extractText(node);
      if (text.trim()) {
        blocks.push({ type: 'paragraph', content: text });
      }
      break;
    }
  }
}

function extractText(node: ProseMirrorNode): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractText).join('');
}

function extractMarks(nodes: ProseMirrorNode[]): Array<{ type: string; attrs?: Record<string, unknown> }> {
  const allMarks: Array<{ type: string; attrs?: Record<string, unknown> }> = [];
  for (const n of nodes) {
    if (n.marks) {
      allMarks.push(...n.marks);
    }
    if (n.content) {
      allMarks.push(...extractMarks(n.content));
    }
  }
  return allMarks;
}

function renderInlineContent(nodes: ProseMirrorNode[]): string {
  return nodes.map((n) => {
    if (n.type === 'text') {
      let text = n.text ?? '';
      if (n.marks) {
        for (const mark of n.marks) {
          switch (mark.type) {
            case 'bold':
              text = `**${text}**`;
              break;
            case 'italic':
              text = `*${text}*`;
              break;
            case 'strike':
              text = `~~${text}~~`;
              break;
            case 'code':
              text = `\`${text}\``;
              break;
            case 'link':
              text = `[${text}](${(mark.attrs?.href as string) ?? ''})`;
              break;
          }
        }
      }
      return text;
    }
    if (n.type === 'hardBreak') return '\n';
    return '';
  }).join('');
}
