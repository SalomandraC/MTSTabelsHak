import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSec?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSec) {
      await this.redis.set(key, serialized, 'EX', ttlSec);
      return;
    }

    await this.redis.set(key, serialized);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  async sadd(key: string, value: string, ttlSec?: number): Promise<void> {
    await this.redis.sadd(key, value);
    if (ttlSec) {
      await this.redis.expire(key, ttlSec);
    }
  }

  async smembers(key: string): Promise<string[]> {
    return this.redis.smembers(key);
  }
}
