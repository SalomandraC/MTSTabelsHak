import { Injectable } from '@nestjs/common';
import { WikiNode, WikiNodeType } from '@prisma/client';
import { UserContext } from 'src/auth/user-context';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { MwsService } from 'src/mws/mws.service';
import { DocumentRole, PageAccessService } from 'src/page-access/page-access.service';

type TreeRecord = WikiNode & {
  page: {
    plainTextPreview: string | null;
  } | null;
  targetLinks: unknown[];
};

export type WorkspaceTreeNodeKind = 'mwsFolder' | 'mwsTable' | 'wikiFolder' | 'wikiPage';

export type WorkspaceTreeNode = {
  id: string;
  kind: WorkspaceTreeNodeKind;
  title: string;
  spaceId: string;
  parentId: string | null;
  children: WorkspaceTreeNode[];
  mwsNode?: {
    id: string;
    name: string;
    type: string;
    spaceId: string | null;
    parentId: string | null;
    path: string[];
    datasheetId: string | null;
    dstId: string | null;
    openInMwsUrl: string | null;
    children: [];
  };
  wikiPage?: {
    id: string;
    title: string;
    icon: string | null;
    excerpt: string | null;
    createdAt: Date;
    updatedAt: Date;
    backlinksCount: number;
    role: DocumentRole | null;
    canView: boolean;
    canEdit: boolean;
    isLocked: boolean;
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
    private readonly pageAccessService: PageAccessService,
  ) {}

  async getTree(spaceId: string, user: UserContext) {
    await this.mwsService.syncSpaceNodes(spaceId, user);

    const records = await this.prisma.wikiNode.findMany({
      where: {
        spaceId,
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
    });

    const accessByPageId = new Map(
      await Promise.all(
        records
          .filter((record) => record.type === WikiNodeType.page)
          .map(async (record) => [record.id, await this.pageAccessService.resolvePageAccess(record.id, user)] as const),
      ),
    );

    return {
      items: this.buildTree(records, accessByPageId),
    };
  }

  private buildTree(
    records: TreeRecord[],
    accessByPageId: Map<string, Awaited<ReturnType<PageAccessService['resolvePageAccess']>>>,
  ): WorkspaceTreeNode[] {
    const byParentId = new Map<string | null, TreeRecord[]>();

    for (const record of records) {
      const items = byParentId.get(record.parentId ?? null) ?? [];
      items.push(record);
      byParentId.set(record.parentId ?? null, items);
    }

    const toNode = (record: TreeRecord): WorkspaceTreeNode => {
      const children = (byParentId.get(record.id) ?? [])
        .map(toNode)
        .sort((left, right) => left.title.localeCompare(right.title, 'ru', { sensitivity: 'base' }));

      if (record.type === WikiNodeType.page) {
        const access = accessByPageId.get(record.id);
        return {
          id: record.id,
          kind: 'wikiPage',
          title: record.title,
          spaceId: record.spaceId,
          parentId: record.parentId,
          children,
          linkedPageId: record.id,
          datasheetId: record.mwsDatasheetId,
          wikiPage: {
            id: record.id,
            title: record.title,
            icon: record.icon,
            excerpt: record.page?.plainTextPreview ?? null,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            backlinksCount: record.targetLinks.length,
            role: access?.role ?? null,
            canView: access?.capabilities.canView ?? false,
            canEdit: access?.capabilities.canEdit ?? false,
            isLocked: !(access?.capabilities.canView ?? false),
          },
        };
      }

      if (record.type === WikiNodeType.folder) {
        return {
          id: record.id,
          kind: 'wikiFolder',
          title: record.title,
          spaceId: record.spaceId,
          parentId: record.parentId,
          children,
        };
      }

      const nodeId = record.sourceNodeId ?? record.mwsSourceNodeId ?? record.id;
      const openInMwsUrl = this.mwsService.buildOpenInMwsUrlFromIds(
        record.mwsSpaceId ?? record.spaceId,
        nodeId,
        record.mwsDatasheetId,
      );
      const mwsType = record.type === WikiNodeType.mws_table ? 'table' : 'folder';

      return {
        id: record.id,
        kind: record.type === WikiNodeType.mws_table ? 'mwsTable' : 'mwsFolder',
        title: record.title,
        spaceId: record.spaceId,
        parentId: record.parentId,
        children,
        datasheetId: record.mwsDatasheetId,
        openInMwsUrl,
        mwsNode: {
          id: nodeId,
          name: record.title,
          type: mwsType,
          spaceId: record.mwsSpaceId ?? record.spaceId,
          parentId: record.sourceParentNodeId ?? null,
          path: [],
          datasheetId: record.mwsDatasheetId,
          dstId: record.mwsDatasheetId,
          openInMwsUrl,
          children: [],
        },
      };
    };

    return (byParentId.get(null) ?? [])
      .map(toNode)
      .sort((left, right) => left.title.localeCompare(right.title, 'ru', { sensitivity: 'base' }));
  }
}
