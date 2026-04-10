import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { CollabModule } from './collab/collab.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { RedisModule } from './infra/redis/redis.module';
import { LinksModule } from './links/links.module';
import { MwsModule } from './mws/mws.module';
import { PagesModule } from './pages/pages.module';
import { SearchModule } from './search/search.module';
import { WikiTreeModule } from './wiki-tree/wiki-tree.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: { singleLine: true },
              }
            : undefined,
      },
    }),
    AuthModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    SearchModule,
    WikiTreeModule,
    PagesModule,
    LinksModule,
    CollabModule,
    MwsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
