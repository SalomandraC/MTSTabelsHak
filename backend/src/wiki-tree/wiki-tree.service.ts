import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WikiNodeType } from '@prisma/client';
import { UserContext } from 'src/auth/user-context';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { MwsService } from 'src/mws/mws.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { MoveNodeDto } from './dto/move-node.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

const WIKI_NODE_TYPE_MWS_FOLDER = 'mws_folder';
const WIKI_NODE_TYPE_MWS_TABLE = 'mws_table';

export interface TreeNode {
  id: string;
  spaceId: string;
  type: WikiNodeType;
  title: string;
  icon: string | null;
  parentId: string | null;
  position: number;
  isArchived: boolean;
  children: TreeNode[];
}

@Injectable()
export class WikiTreeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mwsService: MwsService,
  ) {}

  async getTree(spaceId: string): Promise<TreeNode[]> {
    const nodes = await this.prisma.wikiNode.findMany({
      where: { spaceId, isArchived: false },
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });

    return this.buildTree(nodes.map((node) => ({ ...node, children: [] })));
  }

  buildTree(nodes: TreeNode[]): TreeNode[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const roots: TreeNode[] = [];

    for (const node of nodes) {
      if (!node.parentId) {
        roots.push(node);
        continue;
      }

      const parent = byId.get(node.parentId);
      if (!parent) {
        roots.push(node);
        continue;
      }

      parent.children.push(node);
    }

    const sortRecursive = (items: TreeNode[]) => {
      items.sort((a, b) => a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' }));
      items.forEach((item) => sortRecursive(item.children));
    };

    sortRecursive(roots);

    return roots;
  }

  async createFolder(dto: CreateFolderDto, user: UserContext) {
    const { parentId, externalParentNodeId } = await this.resolveParent(dto.spaceId, dto.parentNodeId, dto.externalParentNodeId, user);
    const position = await this.nextPosition(dto.spaceId, parentId);

    return this.prisma.wikiNode.create({
      data: {
        spaceId: dto.spaceId,
        type: WikiNodeType.folder,
        parentId,
        title: dto.title,
        icon: dto.icon,
        position,
        mwsParentNodeId: externalParentNodeId,
        createdBy: user.userId,
        updatedBy: user.userId,
      },
    });
  }

  async updateFolder(folderId: string, dto: UpdateFolderDto, user: UserContext) {
    const folder = await this.prisma.wikiNode.findUnique({ where: { id: folderId } });
    if (!folder || folder.type !== WikiNodeType.folder) {
      throw new NotFoundException('Folder not found');
    }

    return this.prisma.wikiNode.update({
      where: { id: folderId },
      data: {
        title: dto.title,
        icon: dto.icon,
        isArchived: dto.isArchived,
        updatedBy: user.userId,
      },
    });
  }

  async deleteFolder(folderId: string, user: UserContext): Promise<void> {
    const folder = await this.prisma.wikiNode.findUnique({ where: { id: folderId } });
    if (!folder || folder.type !== WikiNodeType.folder) {
      throw new NotFoundException('Folder not found');
    }

    const nodes = await this.prisma.wikiNode.findMany({
      where: { spaceId: folder.spaceId },
      orderBy: { createdAt: 'asc' },
    });
    const ids = new Set<string>();
    const visit = (parentId: string) => {
      ids.add(parentId);
      nodes
        .filter((node) => node.parentId === parentId)
        .forEach((node) => visit(node.id));
    };
    visit(folderId);

    await this.prisma.$transaction([
      this.prisma.wikiNode.updateMany({
        where: { id: { in: [...ids] } },
        data: { isArchived: true, updatedBy: user.userId },
      }),
    ]);
  }

  async moveNode(nodeId: string, dto: MoveNodeDto, user: UserContext) {
    const node = await this.prisma.wikiNode.findUnique({ where: { id: nodeId } });
    if (!node) {
      throw new NotFoundException('Node not found');
    }

    if (node.type === WIKI_NODE_TYPE_MWS_FOLDER || node.type === WIKI_NODE_TYPE_MWS_TABLE) {
      throw new BadRequestException('External MWS nodes are read-only and cannot be moved');
    }

    const { parentId, externalParentNodeId } = await this.resolveParent(
      node.spaceId,
      dto.targetParentId ?? undefined,
      dto.targetExternalParentNodeId ?? undefined,
      user,
    );

    if (parentId) {
      const parent = await this.prisma.wikiNode.findUnique({ where: { id: parentId } });
      if (parent && parent.spaceId !== node.spaceId) {
        throw new BadRequestException('Cannot move node between spaces');
      }
    }

    return this.prisma.wikiNode.update({
      where: { id: nodeId },
      data: {
        parentId,
        mwsParentNodeId: externalParentNodeId,
        updatedBy: user.userId,
      },
    });
  }

  private async assertParentFolder(parentId?: string): Promise<void> {
    if (!parentId) {
      return;
    }

    const parent = await this.prisma.wikiNode.findUnique({ where: { id: parentId } });
    if (!parent || (parent.type !== WikiNodeType.folder && parent.type !== WIKI_NODE_TYPE_MWS_FOLDER)) {
      throw new BadRequestException('Parent node must be an existing local or MWS folder');
    }
  }

  private async nextPosition(spaceId: string, parentId: string | null): Promise<number> {
    const sibling = await this.prisma.wikiNode.findFirst({
      where: { spaceId, parentId, isArchived: false },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return sibling ? sibling.position + 1 : 0;
  }

  private async resolveParent(
    spaceId: string,
    parentNodeId: string | undefined,
    externalParentNodeId: string | undefined,
    user: UserContext,
  ) {
    if (parentNodeId && externalParentNodeId) {
      throw new BadRequestException('Use either parentNodeId or externalParentNodeId');
    }

    if (parentNodeId) {
      await this.assertParentFolder(parentNodeId);
      const parent = await this.prisma.wikiNode.findUnique({ where: { id: parentNodeId } });
      return {
        parentId: parentNodeId,
        externalParentNodeId: parent?.sourceNodeId ?? parent?.mwsSourceNodeId ?? null,
      };
    }

    if (!externalParentNodeId) {
      return {
        parentId: null,
        externalParentNodeId: null,
      };
    }

    const shadowParent = await this.mwsService.resolveShadowFolderNode(spaceId, externalParentNodeId, user);

    return {
      parentId: shadowParent.id,
      externalParentNodeId,
    };
  }
}
