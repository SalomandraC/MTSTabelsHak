import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS } from './redis.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new Redis(configService.get<string>('REDIS_URL', 'redis://localhost:6379')),
    },
    RedisService,
  ],
  exports: [REDIS, RedisService],
})
export class RedisModule {}
