import { Injectable } from '@nestjs/common';

export interface ExtractedPageLink {
  targetPageId: string;
  mentionCount: number;
}

export interface ExtractedPageEmbed {
  blockId: string;
  provider: 'mws_tables';
  mwsSpaceId?: string;
  mwsNodeId?: string;
  mwsDatasheetId?: string;
  mwsViewId?: string;
  displayMode?: string;
  selectedFieldIds: string[];
  filterFormula?: string;
  pageSize?: number;
  allowInlineEdit: boolean;
  config: Record<string, unknown>;
}

export interface IndexedDocument {
  plainTextPreview: string;
  links: ExtractedPageLink[];
  embeds: ExtractedPageEmbed[];
}

@Injectable()
export class DocumentIndexingService {
  extractPlainTextFromProsemirrorJson(doc: Record<string, any> | null | undefined): string {
    const textParts: string[] = [];

    const visit = (node: Record<string, any> | null | undefined) => {
      if (!node || typeof node !== 'object') {
        return;
      }

      if (typeof node.text === 'string' && node.text.trim()) {
        textParts.push(node.text.trim());
      }

      const content = Array.isArray(node.content) ? node.content : [];
      content.forEach((child) => visit(child));
    };

    visit(doc);

    return textParts.join(' ').trim();
  }

  extractFromProsemirrorJson(doc: Record<string, any> | null | undefined): IndexedDocument {
    const linkCounts = new Map<string, number>();
    const embeds: ExtractedPageEmbed[] = [];

    const visit = (node: Record<string, any> | null | undefined) => {
      if (!node || typeof node !== 'object') {
        return;
      }

      if (node.type === 'pageLink') {
        const targetPageId = node.attrs?.pageId ?? node.attrs?.targetPageId;
        if (targetPageId) {
          linkCounts.set(targetPageId, (linkCounts.get(targetPageId) ?? 0) + 1);
        }
      }

      if (node.type === 'mwsTableEmbed') {
        embeds.push({
          blockId: node.attrs?.blockId ?? node.attrs?.id ?? crypto.randomUUID(),
          provider: 'mws_tables',
          mwsSpaceId: node.attrs?.spaceId,
          mwsNodeId: node.attrs?.nodeId,
          mwsDatasheetId: node.attrs?.datasheetId,
          mwsViewId: node.attrs?.viewId,
          displayMode: node.attrs?.displayMode,
          selectedFieldIds: Array.isArray(node.attrs?.selectedFieldIds)
            ? node.attrs.selectedFieldIds
            : [],
          filterFormula: node.attrs?.filterByFormula,
          pageSize: node.attrs?.pageSize,
          allowInlineEdit: Boolean(node.attrs?.allowInlineEdit),
          config: node.attrs ?? {},
        });
      }

      const content = Array.isArray(node.content) ? node.content : [];
      content.forEach((child) => visit(child));
    };

    visit(doc);
    const plainText = this.extractPlainTextFromProsemirrorJson(doc);

    return {
      plainTextPreview: plainText.slice(0, 1000),
      links: [...linkCounts.entries()].map(([targetPageId, mentionCount]) => ({
        targetPageId,
        mentionCount,
      })),
      embeds,
    };
  }
}
