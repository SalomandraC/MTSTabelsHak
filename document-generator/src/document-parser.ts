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
        content: renderInlineContent(node.content ?? [], link),
        inlineNodes: extractInlineNodes(node.content ?? [], link),
      });
      break;
    }

    case 'paragraph': {
      if (node.content?.length === 1 && node.content[0].type === 'image') {
        flattenNode(node.content[0], blocks, link);
        return;
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
  flattenNode(node, blocks, link);
}

function extractText(node: ProseMirrorNode): string {
  if (node.type === 'pageLink') {
    return (node.attrs?.title as string) ?? 'Страница';
  }
  if (node.type === 'templateVariable') {
    const label = (node.attrs?.label as string) || (node.attrs?.key as string) || 'Параметр';
    return `{{${label}}}`;
  }
  if (node.type === 'liveReference') {
    const value = (node.attrs?.value as string) ?? '';
    if (value.trim()) {
      return value;
    }
    return (node.attrs?.label as string) || `${String(node.attrs?.recordId ?? 'record')} / ${String(node.attrs?.fieldId ?? 'field')}`;
  }
  if (node.type === 'liveFormula') {
    const result = (node.attrs?.result as string) ?? '';
    if (result.trim()) {
      return result;
    }
    return (node.attrs?.expression as string) ?? '';
  }
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

    if (n.type === 'templateVariable') {
      const label = (n.attrs?.label as string) || (n.attrs?.key as string) || 'Параметр';
      return `{{${label}}}`;
    }

    if (n.type === 'liveReference') {
      const value = String(n.attrs?.value ?? '').trim();
      if (value) {
        return value;
      }

      const label = String(n.attrs?.label ?? '').trim();
      if (label) {
        return label;
      }

      return `${String(n.attrs?.recordId ?? 'record')} / ${String(n.attrs?.fieldId ?? 'field')}`;
    }

    if (n.type === 'liveFormula') {
      const result = String(n.attrs?.result ?? '').trim();
      if (result) {
        return result;
      }
      return String(n.attrs?.expression ?? '').trim();
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
    } else if (n.type === 'templateVariable') {
      result.push({
        type: 'template_variable',
        key: (n.attrs?.key as string) ?? undefined,
        label: (n.attrs?.label as string) ?? undefined,
        description: (n.attrs?.description as string) ?? undefined,
      });
    } else if (n.type === 'liveReference') {
      result.push({
        type: 'live_reference',
        datasheetId: (n.attrs?.datasheetId as string) ?? undefined,
        recordId: (n.attrs?.recordId as string) ?? undefined,
        fieldId: (n.attrs?.fieldId as string) ?? undefined,
        label: (n.attrs?.label as string) ?? undefined,
        value: (n.attrs?.value as string) ?? undefined,
      });
    } else if (n.type === 'liveFormula') {
      result.push({
        type: 'live_formula',
        expression: (n.attrs?.expression as string) ?? undefined,
        result: (n.attrs?.result as string) ?? undefined,
      });
    } else if (n.type === 'hardBreak') {
      result.push({
        type: 'hard_break',
      });
    } else if (n.type === 'text') {
      const hasLinkMark = n.marks?.find((mark) => mark.type === 'link');
      const node: InlineNode = hasLinkMark
        ? {
            type: 'link',
            text: n.text ?? '',
            href: (hasLinkMark.attrs?.href as string) ?? undefined,
          }
        : { type: 'text', text: n.text ?? '' };
      if (n.marks) {
        for (const mark of n.marks) {
          if (mark.type === 'bold') node.bold = true;
          if (mark.type === 'italic') node.italic = true;
          if (mark.type === 'strike') node.strike = true;
          if (mark.type === 'code') node.code = true;
        }
      }
      result.push(node);
    }
  }
  return result;
}
