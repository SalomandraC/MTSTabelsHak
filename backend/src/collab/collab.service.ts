import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserContext } from 'src/auth/user-context';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { RedisService } from 'src/infra/redis/redis.service';
import { OpenCollabSessionDto } from './dto/open-collab-session.dto';
import { CreateCheckpointDto } from './dto/create-checkpoint.dto';
import { CollabPersistenceService } from './collab-persistence.service';

@Injectable()
export class CollabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly persistenceService: CollabPersistenceService,
  ) {}

  async openSession(pageId: string, dto: OpenCollabSessionDto, user: UserContext) {
    const page = await this.prisma.wikiNode.findUnique({ where: { id: pageId } });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const session = await this.prisma.collabSession.create({
      data: {
        pageId,
        userId: user.userId,
        clientId: dto.client.clientId,
        deviceId: dto.client.deviceId,
        displayName: dto.client.userDisplayName ?? user.displayName,
      },
    });

    const token = this.authService.issueCollabToken(user, pageId, session.id, dto.client.clientId);
    const port = this.configService.get<string>('COLLAB_PORT', '8081');
    const activeUsers = await this.redisService.smembers(this.presenceKey(pageId));

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
        activeUsers: activeUsers.map((entry, index) => {
          const parsed = JSON.parse(entry) as { userId: string; displayName: string };
          return {
            userId: parsed.userId,
            displayName: parsed.displayName,
            color: ['#0EA5E9', '#22C55E', '#F97316', '#A855F7'][index % 4],
          };
        }),
      },
    };
  }

  async createCheckpoint(pageId: string, dto: CreateCheckpointDto, user: UserContext) {
    return this.persistenceService.createCheckpoint(
      pageId,
      dto.documentState.value,
      user,
      dto.trigger,
    );
  }

  presenceKey(pageId: string): string {
    return `presence:page:${pageId}`;
  }
}
