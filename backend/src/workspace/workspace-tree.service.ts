import { Injectable } from '@nestjs/common';
import { WikiNode, WikiNodeType } from '@prisma/client';
import { UserContext } from 'src/auth/user-context';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { MwsService, NormalizedMwsNode } from 'src/mws/mws.service';

type WikiPageNode = WikiNode & {
  page: {
    plainTextPreview: string | null;
  } | null;
  targetLinks: unknown[];
};

export type WorkspaceTreeNodeKind = 'mwsFolder' | 'mwsTable' | 'mwsNode' | 'wikiPage';

export type WorkspaceTreeNode = {
  id: string;
  kind: WorkspaceTreeNodeKind;
  title: string;
  spaceId: string;
  parentId: string | null;
  children: WorkspaceTreeNode[];
  mwsNode?: NormalizedMwsNode;
  wikiPage?: {
    id: string;
    title: string;
    icon: string | null;
    excerpt: string | null;
    createdAt: Date;
    updatedAt: Date;
    backlinksCount: number;
  };
  datasheetId?: string | null;
  linkedPageId?: string | null;
  openInMwsUrl?: string | null;
};

@Injectable()
export class WorkspaceTreeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mwsService: MwsService,
  ) {}

  async getTree(spaceId: string, user: UserContext) {
    const [mwsTree, wikiPages] = await Promise.all([
      this.mwsService.listNodes(spaceId, undefined, true, user),
      this.prisma.wikiNode.findMany({
        where: {
          spaceId,
          type: WikiNodeType.page,
          isArchived: false,
        },
        include: {
          page: {
            select: {
              plainTextPreview: true,
            },
          },
          targetLinks: true,
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    return {
      items: this.overlayWikiPages(spaceId, mwsTree.items, wikiPages),
    };
  }

  private overlayWikiPages(
    spaceId: string,
    mwsNodes: NormalizedMwsNode[],
    wikiPages: WikiPageNode[],
  ): WorkspaceTreeNode[] {
    const pagesBySourceNodeId = new Map<string, WikiPageNode[]>();
    const pagesByMwsParentNodeId = new Map<string | null, WikiPageNode[]>();
    const attachedPageIds = new Set<string>();
    const knownMwsNodeIds = new Set(this.flattenMwsNodes(mwsNodes).map((node) => node.id));

    for (const page of wikiPages) {
      if (page.mwsSourceNodeId && knownMwsNodeIds.has(page.mwsSourceNodeId)) {
        const items = pagesBySourceNodeId.get(page.mwsSourceNodeId) ?? [];
        items.push(page);
        pagesBySourceNodeId.set(page.mwsSourceNodeId, items);
        attachedPageIds.add(page.id);
        continue;
      }

      if (page.mwsParentNodeId && knownMwsNodeIds.has(page.mwsParentNodeId)) {
        const items = pagesByMwsParentNodeId.get(page.mwsParentNodeId) ?? [];
        items.push(page);
        pagesByMwsParentNodeId.set(page.mwsParentNodeId, items);
        attachedPageIds.add(page.id);
      }
    }

    const toMwsTreeNode = (node: NormalizedMwsNode): WorkspaceTreeNode => {
      const children = node.children.flatMap((child) => {
        const childTreeNode = toMwsTreeNode(child);
        const tablePages = pagesBySourceNodeId.get(child.id) ?? [];

        return [
          childTreeNode,
          ...tablePages.map((page) => this.toWikiTreeNode(spaceId, page, child.parentId)),
        ];
      });

      const parentOnlyPages = pagesByMwsParentNodeId.get(node.id) ?? [];
      children.push(...parentOnlyPages.map((page) => this.toWikiTreeNode(spaceId, page, node.id)));

      return {
        id: this.mwsTreeId(node.id),
        kind: this.getMwsNodeKind(node),
        title: node.name,
        spaceId,
        parentId: node.parentId ? this.mwsTreeId(node.parentId) : null,
        children,
        mwsNode: node,
        datasheetId: node.datasheetId ?? node.dstId,
        openInMwsUrl: node.openInMwsUrl,
      };
    };

    const roots = mwsNodes.flatMap((node) => {
      const treeNode = toMwsTreeNode(node);
      const siblingPages = pagesBySourceNodeId.get(node.id) ?? [];

      return [
        treeNode,
        ...siblingPages.map((page) => this.toWikiTreeNode(spaceId, page, node.parentId)),
      ];
    });

    const unattachedPages = wikiPages.filter((page) => !attachedPageIds.has(page.id));
    roots.push(...unattachedPages.map((page) => this.toWikiTreeNode(spaceId, page, null)));

    return roots;
  }

  private flattenMwsNodes(nodes: NormalizedMwsNode[]): NormalizedMwsNode[] {
    return nodes.flatMap((node) => [node, ...this.flattenMwsNodes(node.children)]);
  }

  private getMwsNodeKind(node: NormalizedMwsNode): WorkspaceTreeNodeKind {
    if (this.isTableNode(node)) {
      return 'mwsTable';
    }

    const type = node.type.toLowerCase();
    if (type.includes('folder') || node.children.length > 0) {
      return 'mwsFolder';
    }

    return 'mwsNode';
  }

  private isTableNode(node: NormalizedMwsNode) {
    const type = node.type.toLowerCase();
    return Boolean(node.datasheetId ?? node.dstId) || type.includes('datasheet') || type.includes('table');
  }

  private toWikiTreeNode(
    spaceId: string,
    page: WikiPageNode,
    mwsParentNodeId: string | null,
  ): WorkspaceTreeNode {
    return {
      id: page.id,
      kind: 'wikiPage',
      title: page.title,
      spaceId,
      parentId: mwsParentNodeId ? this.mwsTreeId(mwsParentNodeId) : null,
      children: [],
      linkedPageId: page.id,
      wikiPage: {
        id: page.id,
        title: page.title,
        icon: page.icon,
        excerpt: page.page?.plainTextPreview ?? null,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        backlinksCount: page.targetLinks.length,
      },
      datasheetId: page.mwsDatasheetId,
    };
  }

  private mwsTreeId(nodeId: string) {
    return `mws:${nodeId}`;
  }
}
