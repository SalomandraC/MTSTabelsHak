import { DocumentIndexingService } from '../src/links/document-indexing.service';

describe('DocumentIndexingService', () => {
  const service = new DocumentIndexingService();

  it('extracts plain text, page links and table embeds', () => {
    const result = service.extractFromProsemirrorJson({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello WikiLive' }] },
        { type: 'pageLink', attrs: { pageId: 'page-2' } },
        {
          type: 'mwsTableEmbed',
          attrs: {
            blockId: 'block-1',
            spaceId: 'spc1',
            nodeId: 'dstNode',
            datasheetId: 'dst1',
            viewId: 'viw1',
            displayMode: 'table',
            selectedFieldIds: ['fld1'],
            allowInlineEdit: true,
          },
        },
      ],
    });

    expect(result.plainTextPreview).toContain('Hello WikiLive');
    expect(result.links).toEqual([{ targetPageId: 'page-2', mentionCount: 1 }]);
    expect(result.embeds).toHaveLength(1);
    expect(result.embeds[0].mwsDatasheetId).toBe('dst1');
  });
});
