import { describe, expect, it } from 'vitest';

import { shouldShowWorkspacePageActions } from './workspace-node-permissions';

describe('shouldShowWorkspacePageActions', () => {
  it('hides the three-dot menu for read-only pages', () => {
    expect(
      shouldShowWorkspacePageActions({
        kind: 'wikiPage',
        id: 'page-1',
        title: 'Read only',
        spaceId: 'space-1',
        parentId: null,
        children: [],
        linkedPageId: 'page-1',
        wikiPage: {
          canEdit: false,
        },
      } as never),
    ).toBe(false);
  });

  it('shows the three-dot menu only for editable wiki pages', () => {
    expect(
      shouldShowWorkspacePageActions({
        kind: 'wikiPage',
        id: 'page-2',
        title: 'Editable',
        spaceId: 'space-1',
        parentId: null,
        children: [],
        linkedPageId: 'page-2',
        wikiPage: {
          canEdit: true,
        },
      } as never),
    ).toBe(true);
  });
});