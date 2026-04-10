import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchPages(spaceId: string, query?: string, limit = 20) {
    return this.prisma.wikiNode.findMany({
      where: {
        spaceId,
        type: 'page',
        isArchived: false,
        OR: query
          ? [
              { title: { contains: query, mode: 'insensitive' } },
              {
                page: {
                  is: {
                    plainTextPreview: { contains: query, mode: 'insensitive' },
                  },
                },
              },
            ]
          : undefined,
      },
      include: { page: true, targetLinks: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });
  }
}
