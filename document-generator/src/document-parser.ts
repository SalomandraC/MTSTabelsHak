import type { ProseMirrorNode, ProseMirrorDocument, BlockNode } from './types.js';
export type { BlockNode } from './types.js';

export type ParserLinkContext = {
  appBaseUrl: string;
  spaceId: string;
};

export function flattenDocument(
  doc: ProseMirrorDocument | ProseMirrorNode[],
  link?: ParserLinkContext,
): BlockNode[] {
  const content = Array.isArray(doc) ? doc : (doc as ProseMirrorDocument).content ?? [];
  const blocks: BlockNode[] = [];
  for (const node of content) {
    flattenNode(node, blocks, link);
  }
  return blocks;
}

function flattenNode(node: ProseMirrorNode, blocks: BlockNode[], link?: ParserLinkContext): void {
  switch (node.type) {
    case 'rootblock': {
      if (node.content) {
        for (const child of node.content) {
          flattenNode(child, blocks, link);
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
      if (node.content?.length === 1 && node.content[0].type === 'image') {
        flattenNode(node.content[0], blocks, link);
        return;
      }
      const inlineTypes = node.content?.map(n => n.type).join(',') ?? '';
      const pageLinkCount = node.content?.filter(n => n.type === 'pageLink').length ?? 0;
      if (pageLinkCount > 0) {
        console.log(`[parser] paragraph inlineTypes="${inlineTypes}" pageLinkCount=${pageLinkCount}`);
      }
      blocks.push({
        type: 'paragraph',
        content: renderInlineContent(node.content ?? [], link),
        marks: extractMarks(node.content ?? []),
        inlineNodes: extractInlineNodes(node.content ?? [], link),
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

    case 'pageLink': {
      // pageLink as block-level (rare, but handle it)
      blocks.push({
        type: 'page_link',
        pageId: (node.attrs?.pageId as string) ?? null,
        pageTitle: (node.attrs?.title as string) ?? null,
        content: (node.attrs?.title as string) ?? 'Страница',
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
        flattenListItem(child, items, link);
      }
      blocks.push({ type: 'bullet_list', children: items });
      break;
    }

    case 'orderedList': {
      const items: BlockNode[] = [];
      for (const child of node.content ?? []) {
        flattenListItem(child, items, link);
      }
      blocks.push({ type: 'ordered_list', children: items });
      break;
    }

    case 'taskList': {
      const items: BlockNode[] = [];
      for (const child of node.content ?? []) {
        flattenNode(child, items, link);
      }
      blocks.push({ type: 'task_list', children: items });
      break;
    }

    case 'taskItem': {
      const contentBlocks: BlockNode[] = [];
      for (const child of node.content ?? []) {
        flattenNode(child, contentBlocks, link);
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
        flattenNode(child, contentBlocks, link);
      }
      blocks.push({ type: 'blockquote', children: contentBlocks });
      break;
    }

    case 'horizontalRule': {
      blocks.push({ type: 'horizontal_rule' });
      break;
    }

    default: {
      const text = extractText(node);
      // Log nodes that might contain pageLinks
      const hasPageLink = JSON.stringify(node).includes('"pageLink"');
      if (hasPageLink) {
        console.log(`[parser] node type="${node.type}" contains pageLink, content types: ${node.content?.map(n => n.type).join(',') ?? 'none'}`);
      }
      if (text.trim()) {
        blocks.push({ type: 'paragraph', content: text });
      }
      break;
    }
  }
}

function flattenListItem(node: ProseMirrorNode, blocks: BlockNode[], link?: ParserLinkContext): void {
  // listItem wraps a paragraph — extract it preserving inlineNodes
  if (node.type === 'listItem') {
    const para = node.content?.find(c => c.type === 'paragraph');
    if (para) {
      blocks.push({
        type: 'paragraph',
        content: renderInlineContent(para.content ?? [], link),
        inlineNodes: extractInlineNodes(para.content ?? [], link),
      });
      return;
    }
  }
  // Fallback for other structures
  flattenNode(node, blocks, link);
}

function extractText(node: ProseMirrorNode): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractText).join('');
}

function extractMarks(nodes: ProseMirrorNode[]): Array<{ type: string; attrs?: Record<string, unknown> }> {
  const allMarks: Array<{ type: string; attrs?: Record<string, unknown> }> = [];
  for (const n of nodes) {
    if (n.marks) allMarks.push(...n.marks);
    if (n.content) allMarks.push(...extractMarks(n.content));
  }
  return allMarks;
}

function renderInlineContent(nodes: ProseMirrorNode[], link?: ParserLinkContext): string {
  return nodes.map((n) => {
    if (n.type === 'pageLink') {
      const title = (n.attrs?.title as string) ?? 'Страница';
      const pageId = n.attrs?.pageId as string | undefined;
      if (link?.appBaseUrl && link?.spaceId && pageId) {
        const url = `${link.appBaseUrl.replace(/\/$/, '')}/spaces/${encodeURIComponent(link.spaceId)}/pages/${encodeURIComponent(pageId)}`;
        return `<a href="${url}">${title}</a>`;
      }
      return title;
    }

    if (n.type === 'text') {
      let text = n.text ?? '';
      if (n.marks) {
        for (const mark of n.marks) {
          switch (mark.type) {
            case 'bold': text = `<strong>${text}</strong>`; break;
            case 'italic': text = `<em>${text}</em>`; break;
            case 'strike': text = `<s>${text}</s>`; break;
            case 'code': text = `<code>${text}</code>`; break;
            case 'link': {
              const href = (mark.attrs?.href as string) ?? '';
              text = `<a href="${href}">${text}</a>`;
              break;
            }
          }
        }
      }
      return text;
    }

    if (n.type === 'hardBreak') return '<br>';
    return '';
  }).join('');
}

type InlineNode = NonNullable<import('./types.js').BlockNode['inlineNodes']>[number];

function extractInlineNodes(nodes: ProseMirrorNode[], link?: ParserLinkContext): InlineNode[] {
  const result: InlineNode[] = [];
  for (const n of nodes) {
    if (n.type === 'pageLink') {
      const pageId = (n.attrs?.pageId as string) ?? undefined;
      const pageTitle = (n.attrs?.title as string) ?? undefined;
      let href: string | undefined;
      if (link?.appBaseUrl && link?.spaceId && pageId) {
        href = `${link.appBaseUrl.replace(/\/$/, '')}/spaces/${encodeURIComponent(link.spaceId)}/pages/${encodeURIComponent(pageId)}`;
      }
      result.push({ type: 'page_link', text: pageTitle ?? 'Страница', pageId, pageTitle, href });
    } else if (n.type === 'text') {
      const node: InlineNode = { type: 'text', text: n.text ?? '' };
      if (n.marks) {
        for (const mark of n.marks) {
          if (mark.type === 'bold') node.bold = true;
          if (mark.type === 'italic') node.italic = true;
          if (mark.type === 'strike') node.strike = true;
          if (mark.type === 'code') node.code = true;
          if (mark.type === 'link') node.href = (mark.attrs?.href as string) ?? undefined;
        }
      }
      result.push(node);
    }
  }
  return result;
}
