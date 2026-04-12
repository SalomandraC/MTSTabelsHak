import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserContext } from 'src/auth/user-context';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { RedisService } from 'src/infra/redis/redis.service';
import { PageAccessService } from 'src/page-access/page-access.service';
import { OpenCollabSessionDto } from './dto/open-collab-session.dto';
import { CreateCheckpointDto } from './dto/create-checkpoint.dto';
import { CollabPersistenceService } from './collab-persistence.service';

@Injectable()
export class CollabService {
  private readonly logger = new Logger(CollabService.name);

  private get userRepository(): {
    upsert: (args: unknown) => Promise<unknown>;
  } {
    return (this.prisma as PrismaService & { user: CollabService['userRepository'] }).user;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly persistenceService: CollabPersistenceService,
    private readonly pageAccessService: PageAccessService,
  ) {}

  async openSession(pageId: string, dto: OpenCollabSessionDto, user: UserContext) {
    const access = await this.pageAccessService.assertCanView(pageId, user);
    const page = await this.prisma.wikiNode.findUnique({ where: { id: pageId } });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.userRepository.upsert({
      where: { userId: user.userId },
      create: {
        userId: user.userId,
        clientId: user.clientId ?? null,
        displayName: user.displayName,
      },
      update: {
        clientId: user.clientId ?? null,
        displayName: user.displayName,
      },
    });

    const session = await this.prisma.collabSession.create({
      data: {
        pageId,
        userId: user.userId,
        clientId: dto.client.clientId,
        deviceId: dto.client.deviceId,
      },
    });

    const token = this.authService.issueCollabToken(user, pageId, session.id, dto.client.clientId, access);
    const port = this.configService.get<string>('COLLAB_PORT', '8081');
    const activeUsers = await this.redisService.smembers(this.presenceKey(pageId));
    const parsedActiveUsers = activeUsers.flatMap((entry, index) => {
      try {
        const parsed = JSON.parse(entry) as { userId?: unknown; displayName?: unknown };

        if (typeof parsed.userId !== 'string' || typeof parsed.displayName !== 'string') {
          this.logger.warn(`Skipping malformed collab presence entry for page ${pageId} at index ${index}`);
          return [];
        }

        return [
          {
            userId: parsed.userId,
            displayName: parsed.displayName,
            color: ['#0EA5E9', '#22C55E', '#F97316', '#A855F7'][index % 4],
          },
        ];
      } catch {
        this.logger.warn(`Skipping unreadable collab presence entry for page ${pageId} at index ${index}`);
        return [];
      }
    });

    return {
      sessionId: session.id,
      websocket: {
        url: `ws://localhost:${port}`,
        documentName: pageId,
        token,
        heartbeatIntervalSec: 30,
      },
      documentState: await this.persistenceService.getDocumentState(pageId),
      awareness: {
        activeUsers: parsedActiveUsers,
      },
      access: {
        role: access.role,
        capabilities: access.capabilities,
      },
    };
  }

  async createCheckpoint(pageId: string, dto: CreateCheckpointDto, user: UserContext) {
    return this.persistenceService.createCheckpoint(
      pageId,
      dto.documentState.value,
      user,
      dto.trigger,
      dto.restoredFromCheckpointId,
    );
  }

  presenceKey(pageId: string): string {
    return `presence:page:${pageId}`;
  }
}
