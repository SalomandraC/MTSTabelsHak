import type { WorkspaceTreeNode } from '../../../shared/api/wikilive';

export function isWorkspaceFolder(node: WorkspaceTreeNode): boolean {
  return node.kind === 'mwsFolder' || node.kind === 'wikiFolder';
}

export function shouldShowWorkspacePageActions(node: WorkspaceTreeNode): boolean {
  if (isWorkspaceFolder(node)) {
    return true;
  }

  return node.kind === 'wikiPage' && Boolean(node.linkedPageId) && Boolean(node.wikiPage?.canEdit);
}
