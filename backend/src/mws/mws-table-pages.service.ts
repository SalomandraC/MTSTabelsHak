import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WikiNode, WikiNodeType } from '@prisma/client';
import * as Y from 'yjs';
import { UserContext } from 'src/auth/user-context';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { CreateMwsTablePageDto } from './dto/mws.dto';
import { MwsService, NormalizedMwsNode } from './mws.service';

type PageWithCounts = WikiNode & {
  targetLinks: unknown[];
};

@Injectable()
export class MwsTablePagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mwsService: MwsService,
  ) {}

  async createOrOpenTablePage(dto: CreateMwsTablePageDto, user: UserContext) {
    const tableNode = await this.findMwsNode(dto.spaceId, dto.nodeId, user);
    const datasheetId = dto.datasheetId ?? tableNode.datasheetId ?? tableNode.dstId ?? tableNode.id;

    if (!this.isTableNode(tableNode) && !dto.datasheetId) {
      throw new BadRequestException('MWS node must be a table/datasheet to create a WikiLive table page');
    }

    const existingPage = await this.findExistingPage(dto.spaceId, tableNode.id);
    if (existingPage) {
      return {
        page: this.toPageSummary(existingPage),
        node: tableNode,
        created: false,
        openInMwsUrl: tableNode.openInMwsUrl,
      };
    }

    try {
      const blockId = randomUUID();
      const title = (dto.title ?? `Wiki: ${tableNode.name}`).slice(0, 255);
      const snapshotDoc = this.createTablePageYDoc({
        title,
        blockId,
        spaceId: dto.spaceId,
        nodeId: tableNode.id,
        datasheetId,
      });
      const snapshot = Buffer.from(Y.encodeStateAsUpdate(snapshotDoc));
      const stateVector = Buffer.from(Y.encodeStateVector(snapshotDoc));
      const position = await this.nextPosition(dto.spaceId);

      const createdNode = await this.prisma.$transaction(async (tx) => {
        const node = await tx.wikiNode.create({
          data: {
            spaceId: dto.spaceId,
            type: WikiNodeType.page,
            parentId: null,
            title,
            icon: 'doc',
            position,
            mwsSpaceId: dto.spaceId,
            mwsParentNodeId: tableNode.parentId,
            mwsSourceNodeId: tableNode.id,
            mwsDatasheetId: datasheetId,
            createdBy: user.userId,
            updatedBy: user.userId,
          },
        });

        await tx.wikiPage.create({
          data: {
            nodeId: node.id,
            plainTextPreview: `Live MWS Tables: ${tableNode.name}`,
            lastSnapshotVersion: 0,
            lastIndexedAt: new Date(),
          },
        });

        await tx.pageDocument.create({
          data: {
            pageId: node.id,
            ydocSnapshot: new Uint8Array(snapshot),
            stateVector: new Uint8Array(stateVector),
            serverVersion: 0,
          },
        });

        await tx.pageEmbed.create({
          data: {
            pageId: node.id,
            blockId,
            provider: 'mws_tables',
            mwsSpaceId: dto.spaceId,
            mwsNodeId: tableNode.id,
            mwsDatasheetId: datasheetId,
            displayMode: 'table',
            selectedFieldIds: [],
            pageSize: 50,
            allowInlineEdit: true,
            config: {
              blockId,
              spaceId: dto.spaceId,
              nodeId: tableNode.id,
              datasheetId,
              displayMode: 'table',
              selectedFieldIds: [],
              pageSize: 50,
              allowInlineEdit: true,
            },
            lastResolvedAt: new Date(),
          },
        });

        return node;
      });

      return {
        page: this.toPageSummary({ ...createdNode, targetLinks: [] }),
        node: tableNode,
        created: true,
        openInMwsUrl: tableNode.openInMwsUrl,
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const page = await this.findExistingPage(dto.spaceId, tableNode.id);
        if (page) {
          return {
            page: this.toPageSummary(page),
            node: tableNode,
            created: false,
            openInMwsUrl: tableNode.openInMwsUrl,
          };
        }
      }

      throw error;
    }
  }

  private async findMwsNode(spaceId: string, nodeId: string, user: UserContext) {
    const tree = await this.mwsService.listNodes(spaceId, undefined, true, user);
    const node = this.flattenNodes(tree.items).find((item) => item.id === nodeId);

    if (!node) {
      throw new NotFoundException('MWS node not found in selected space');
    }

    return node;
  }

  private flattenNodes(nodes: NormalizedMwsNode[]): NormalizedMwsNode[] {
    return nodes.flatMap((node) => [node, ...this.flattenNodes(node.children ?? [])]);
  }

  private isTableNode(node: NormalizedMwsNode) {
    const type = node.type.toLowerCase();
    return Boolean(node.datasheetId ?? node.dstId) || type.includes('datasheet') || type.includes('table');
  }

  private async findExistingPage(spaceId: string, mwsSourceNodeId: string): Promise<PageWithCounts | null> {
    return this.prisma.wikiNode.findFirst({
      where: {
        spaceId,
        type: WikiNodeType.page,
        isArchived: false,
        mwsSourceNodeId,
      },
      include: {
        targetLinks: true,
      },
    });
  }

  private async nextPosition(spaceId: string): Promise<number> {
    const sibling = await this.prisma.wikiNode.findFirst({
      where: { spaceId, parentId: null, isArchived: false },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return sibling ? sibling.position + 1 : 0;
  }

  private createTablePageYDoc({
    title,
    blockId,
    spaceId,
    nodeId,
    datasheetId,
  }: {
    title: string;
    blockId: string;
    spaceId: string;
    nodeId: string;
    datasheetId: string;
  }) {
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment('default');
    const headingRoot = new Y.XmlElement('rootblock');
    const heading = new Y.XmlElement('heading');
    const headingText = new Y.XmlText();
    this.setYjsAttribute(heading, 'level', 1);
    headingText.insert(0, title.replace(/^Wiki:\s*/i, ''));
    heading.insert(0, [headingText]);
    headingRoot.insert(0, [heading]);

    const tableRoot = new Y.XmlElement('rootblock');
    const embed = new Y.XmlElement('mwsTableEmbed');
    this.setYjsAttribute(embed, 'blockId', blockId);
    this.setYjsAttribute(embed, 'spaceId', spaceId);
    this.setYjsAttribute(embed, 'nodeId', nodeId);
    this.setYjsAttribute(embed, 'datasheetId', datasheetId);
    this.setYjsAttribute(embed, 'displayMode', 'table');
    this.setYjsAttribute(embed, 'selectedFieldIds', []);
    this.setYjsAttribute(embed, 'pageSize', 50);
    this.setYjsAttribute(embed, 'allowInlineEdit', true);
    tableRoot.insert(0, [embed]);
    fragment.insert(0, [headingRoot, tableRoot]);

    return ydoc;
  }

  private setYjsAttribute(element: Y.XmlElement, key: string, value: unknown) {
    (element as unknown as { setAttribute: (name: string, value: unknown) => void }).setAttribute(key, value);
  }

  private toPageSummary(page: PageWithCounts) {
    return {
      id: page.id,
      title: page.title,
      icon: page.icon,
      excerpt: null,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      backlinksCount: page.targetLinks.length,
    };
  }
}
