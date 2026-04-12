import { describe, expect, it } from 'vitest';
import { Eye, MessageSquare, Pencil } from 'lucide-react';

import { getWorkspaceAccessSummary } from './workspace-access-summary';

describe('getWorkspaceAccessSummary', () => {
  it('returns a read-only summary for view-only access', () => {
    const summary = getWorkspaceAccessSummary({
      role: 'guest',
      principal: 'authenticated',
      isSpaceMember: false,
      isOwner: false,
      capabilities: {
        canView: true,
        canEdit: false,
        canComment: false,
        canManageAccess: false,
        canDelete: false,
        canUseAi: false,
        canUseAdvancedPlugins: false,
      },
      policy: {
        ownerUserId: 'owner-1',
        viewAccess: 'link_holders',
        commentAccess: 'owner_only',
        editAccess: 'owner_only',
      },
    });

    expect(summary?.title).toBe('Только просмотр');
    expect((summary?.icon as any).type).toBe(Eye);
  });

  it('returns a comment summary when the user can comment but not edit', () => {
    const summary = getWorkspaceAccessSummary({
      role: 'commentator',
      principal: 'authenticated',
      isSpaceMember: false,
      isOwner: false,
      capabilities: {
        canView: true,
        canEdit: false,
        canComment: true,
        canManageAccess: false,
        canDelete: false,
        canUseAi: false,
        canUseAdvancedPlugins: false,
      },
      policy: {
        ownerUserId: 'owner-1',
        viewAccess: 'link_holders',
        commentAccess: 'link_holders',
        editAccess: 'owner_only',
      },
    });

    expect(summary?.title).toBe('Комментарий');
    expect((summary?.icon as any).type).toBe(MessageSquare);
  });

  it('returns an edit summary for editors', () => {
    const summary = getWorkspaceAccessSummary({
      role: 'editor',
      principal: 'authenticated',
      isSpaceMember: true,
      isOwner: false,
      capabilities: {
        canView: true,
        canEdit: true,
        canComment: true,
        canManageAccess: false,
        canDelete: false,
        canUseAi: true,
        canUseAdvancedPlugins: true,
      },
      policy: {
        ownerUserId: 'owner-1',
        viewAccess: 'space_members',
        commentAccess: 'space_members',
        editAccess: 'space_members',
      },
    });

    expect(summary?.title).toBe('Редактирование');
    expect((summary?.icon as any).type).toBe(Pencil);
  });
});