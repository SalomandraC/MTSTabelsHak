import type { WorkspaceTreeNode } from '../../../shared/api/wikilive';

export function shouldShowWorkspacePageActions(node: WorkspaceTreeNode): boolean {
  return node.kind === 'wikiPage' && Boolean(node.linkedPageId) && Boolean(node.wikiPage?.canEdit);
}