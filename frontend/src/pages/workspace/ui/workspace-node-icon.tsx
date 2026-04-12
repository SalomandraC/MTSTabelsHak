import type { ReactNode } from 'react';
import { Database, Eye, FileLock2, FileText, Folder, MessageSquare, Table2 } from 'lucide-react';

import type { WorkspaceTreeNode } from '../../../shared/api/wikilive';

export function getWorkspaceNodeIcon(node: WorkspaceTreeNode): ReactNode {
  if (node.kind === 'mwsFolder') {
    return <Folder size={18} strokeWidth={1.8} />;
  }

  if (node.kind === 'mwsTable') {
    return <Table2 size={17} strokeWidth={1.9} />;
  }

  if (node.kind === 'mwsNode') {
    return <Database size={17} strokeWidth={1.8} />;
  }

  if (node.kind === 'wikiPage') {
    if (node.wikiPage?.isLocked) {
      return <FileLock2 size={17} strokeWidth={1.8} />;
    }

    if (node.wikiPage?.canEdit) {
      return <FileText size={17} strokeWidth={1.8} />;
    }

    if (node.wikiPage?.role === 'commentator') {
      return <MessageSquare size={17} strokeWidth={1.8} />;
    }

    if (node.wikiPage?.role === 'guest' || node.wikiPage?.canView) {
      return <Eye size={17} strokeWidth={1.8} />;
    }

    return <FileText size={17} strokeWidth={1.8} />;
  }

  return <FileText size={17} strokeWidth={1.8} />;
}