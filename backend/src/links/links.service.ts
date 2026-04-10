import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';

@Injectable()
export class LinksService {
  constructor(private readonly prisma: PrismaService) {}

  async getBacklinks(pageId: string) {
    const items = await this.prisma.pageLink.findMany({
      where: { targetPageId: pageId },
      include: {
        sourcePage: {
          include: {
            page: true,
          },
        },
      },
      orderBy: { lastReindexedAt: 'desc' },
    });

    return {
      items: items.map((item) => ({
        pageId: item.sourcePageId,
        title: item.sourcePage.title,
        excerpt: item.sourcePage.page?.plainTextPreview ?? null,
        updatedAt: item.lastReindexedAt,
      })),
      total: items.length,
    };
  }

  async getOutgoingLinks(pageId: string) {
    const items = await this.prisma.pageLink.findMany({
      where: { sourcePageId: pageId },
      include: {
        targetPage: true,
      },
      orderBy: { lastReindexedAt: 'desc' },
    });

    return {
      items: items.map((item) => ({
        targetPageId: item.targetPageId,
        targetTitle: item.targetPage.title,
        mentionCount: item.mentionCount,
      })),
    };
  }
}
