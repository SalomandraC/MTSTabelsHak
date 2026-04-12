import { describe, expect, it } from 'vitest';
import { Eye, FileLock2, FileText, MessageSquare } from 'lucide-react';

import { getWorkspaceNodeIcon } from './workspace-node-icon';

describe('getWorkspaceNodeIcon', () => {
  it('shows a lock for inaccessible pages', () => {
    const icon = getWorkspaceNodeIcon({
      kind: 'wikiPage',
      id: 'page-1',
      title: 'Locked',
      spaceId: 'space-1',
      parentId: null,
      children: [],
      wikiPage: { isLocked: true },
    } as never);

    expect((icon as any).type).toBe(FileLock2);
  });

  it('shows a comment icon when the user can comment', () => {
    const icon = getWorkspaceNodeIcon({
      kind: 'wikiPage',
      id: 'page-2',
      title: 'Commentable',
      spaceId: 'space-1',
      parentId: null,
      children: [],
      wikiPage: {
        isLocked: false,
        role: 'commentator',
      },
    } as never);

    expect((icon as any).type).toBe(MessageSquare);
  });

  it('shows an eye for read-only pages', () => {
    const icon = getWorkspaceNodeIcon({
      kind: 'wikiPage',
      id: 'page-3',
      title: 'Read only',
      spaceId: 'space-1',
      parentId: null,
      children: [],
      wikiPage: {
        isLocked: false,
        role: 'guest',
      },
    } as never);

    expect((icon as any).type).toBe(Eye);
  });

  it('shows a plain file for editable pages', () => {
    const icon = getWorkspaceNodeIcon({
      kind: 'wikiPage',
      id: 'page-4',
      title: 'Editable',
      spaceId: 'space-1',
      parentId: null,
      children: [],
      wikiPage: {
        isLocked: false,
        role: 'editor',
      },
    } as never);

    expect((icon as any).type).toBe(FileText);
  });
});