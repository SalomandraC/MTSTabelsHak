import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommentResolveReason, CommentThreadStatus, WikiNodeType } from '@prisma/client';
import { UserContext } from 'src/auth/user-context';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { PageAccessService } from 'src/page-access/page-access.service';
import { CreateCommentMessageDto } from './dto/create-comment-message.dto';
import { CreateCommentThreadDto } from './dto/create-comment-thread.dto';
import { UpdateCommentMessageDto } from './dto/update-comment-message.dto';
import { UpdateCommentThreadDto } from './dto/update-comment-thread.dto';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageAccessService: PageAccessService,
  ) {}

  async listThreads(pageId: string, includeResolved = true, user?: UserContext) {
    await this.pageAccessService.assertCanView(pageId, user);
    await this.ensurePageExists(pageId);

    const threads = await this.prisma.pageCommentThread.findMany({
      where: {
        pageId,
        ...(includeResolved ? {} : { status: CommentThreadStatus.open }),
      },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [
        { status: 'asc' },
        { updatedAt: 'desc' },
      ],
    });

    return {
      items: threads.map((thread) => this.mapThread(thread)),
    };
  }

  async createThread(pageId: string, dto: CreateCommentThreadDto, user: UserContext) {
    await this.pageAccessService.assertCanComment(pageId, user);
    await this.ensurePageExists(pageId);

    const existing = await this.prisma.pageCommentThread.findUnique({
      where: { id: dto.threadId },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Comment thread already exists');
    }

    const thread = await this.prisma.pageCommentThread.create({
      data: {
        id: dto.threadId,
        pageId,
        anchorText: dto.anchorText.trim(),
        createdBy: user.userId,
        createdByName: user.displayName,
        messages: {
          create: {
            body: dto.body.trim(),
            createdBy: user.userId,
            createdByName: user.displayName,
          },
        },
      },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      thread: this.mapThread(thread),
    };
  }

  async addMessage(pageId: string, threadId: string, dto: CreateCommentMessageDto, user: UserContext) {
    await this.pageAccessService.assertCanComment(pageId, user);
    await this.getThreadOrThrow(pageId, threadId);

    await this.prisma.pageCommentMessage.create({
      data: {
        threadId,
        body: dto.body.trim(),
        createdBy: user.userId,
        createdByName: user.displayName,
      },
    });

    return {
      thread: await this.getMappedThread(pageId, threadId),
    };
  }

  async updateMessage(
    pageId: string,
    threadId: string,
    messageId: string,
    dto: UpdateCommentMessageDto,
    user: UserContext,
  ) {
    await this.pageAccessService.assertCanComment(pageId, user);
    const message = await this.prisma.pageCommentMessage.findFirst({
      where: {
        id: messageId,
        threadId,
        deletedAt: null,
        thread: {
          pageId,
        },
      },
      select: {
        id: true,
        createdBy: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Comment message not found');
    }

    if (message.createdBy !== user.userId) {
      throw new ForbiddenException('Only the author can edit this comment');
    }

    await this.prisma.pageCommentMessage.update({
      where: { id: message.id },
      data: { body: dto.body.trim() },
    });

    return {
      thread: await this.getMappedThread(pageId, threadId),
    };
  }

  async deleteMessage(pageId: string, threadId: string, messageId: string, user: UserContext) {
    await this.pageAccessService.assertCanComment(pageId, user);
    const message = await this.prisma.pageCommentMessage.findFirst({
      where: {
        id: messageId,
        threadId,
        deletedAt: null,
        thread: {
          pageId,
        },
      },
      select: {
        id: true,
        createdBy: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Comment message not found');
    }

    if (message.createdBy !== user.userId) {
      throw new ForbiddenException('Only the author can delete this comment');
    }

    await this.prisma.pageCommentMessage.update({
      where: { id: message.id },
      data: { deletedAt: new Date() },
    });

    return {
      thread: await this.getMappedThread(pageId, threadId),
    };
  }

  async updateThread(pageId: string, threadId: string, dto: UpdateCommentThreadDto, user: UserContext) {
    await this.pageAccessService.assertCanComment(pageId, user);
    await this.getThreadOrThrow(pageId, threadId);

    const isResolved = dto.status === CommentThreadStatus.resolved;
    const thread = await this.prisma.pageCommentThread.update({
      where: { id: threadId },
      data: {
        status: dto.status,
        resolvedBy: isResolved ? user.userId : null,
        resolvedAt: isResolved ? new Date() : null,
        resolvedReason: isResolved ? CommentResolveReason.manual : null,
      },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      thread: this.mapThread(thread),
    };
  }

  async autoResolveMissingAnchorsAfterRestore(pageId: string, plainText: string, user: UserContext): Promise<number> {
    await this.ensurePageExists(pageId);

    const normalizedDocumentText = this.normalizeAnchorText(plainText);
    const openThreads = await this.prisma.pageCommentThread.findMany({
      where: {
        pageId,
        status: CommentThreadStatus.open,
      },
      select: {
        id: true,
        anchorText: true,
      },
    });

    const missingThreadIds = openThreads
      .filter((thread) => {
        const normalizedAnchor = this.normalizeAnchorText(thread.anchorText);
        return normalizedAnchor.length > 0 && !normalizedDocumentText.includes(normalizedAnchor);
      })
      .map((thread) => thread.id);

    if (missingThreadIds.length === 0) {
      return 0;
    }

    const resolvedAt = new Date();
    await this.prisma.pageCommentThread.updateMany({
      where: {
        id: { in: missingThreadIds },
      },
      data: {
        status: CommentThreadStatus.resolved,
        resolvedBy: user.userId,
        resolvedAt,
        resolvedReason: CommentResolveReason.anchor_removed_by_restore,
      },
    });

    return missingThreadIds.length;
  }

  private async ensurePageExists(pageId: string): Promise<void> {
    const page = await this.prisma.wikiNode.findFirst({
      where: {
        id: pageId,
        type: WikiNodeType.page,
        isArchived: false,
      },
      select: { id: true },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }
  }

  private async getThreadOrThrow(pageId: string, threadId: string) {
    const thread = await this.prisma.pageCommentThread.findFirst({
      where: {
        id: threadId,
        pageId,
      },
      select: { id: true },
    });

    if (!thread) {
      throw new NotFoundException('Comment thread not found');
    }

    return thread;
  }

  private async getMappedThread(pageId: string, threadId: string) {
    const thread = await this.prisma.pageCommentThread.findFirst({
      where: {
        id: threadId,
        pageId,
      },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException('Comment thread not found');
    }

    return this.mapThread(thread);
  }

  private mapThread(thread: any) {
    return {
      id: thread.id,
      pageId: thread.pageId,
      anchorText: thread.anchorText,
      status: thread.status,
      createdBy: thread.createdBy,
      createdByName: thread.createdByName,
      resolvedBy: thread.resolvedBy,
      resolvedAt: thread.resolvedAt,
      resolvedReason: thread.resolvedReason ?? null,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messages: thread.messages.map((message: any) => ({
        id: message.id,
        threadId: message.threadId,
        body: message.body,
        createdBy: message.createdBy,
        createdByName: message.createdByName,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      })),
    };
  }

  private normalizeAnchorText(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
  }
}
