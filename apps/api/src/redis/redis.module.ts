import { Global, Module } from '@nestjs/common';
import { redis } from '../lib/redis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [{ provide: REDIS_CLIENT, useValue: redis }],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
