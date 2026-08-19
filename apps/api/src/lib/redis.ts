import Redis from 'ioredis';

// Single shared connection — imported both by the NestJS RedisModule (for DI'd
// services) and by src/auth/auth.ts (which is built outside NestJS's DI graph,
// per the @thallesp/nestjs-better-auth pattern of a plain `export const auth`).
export const redis = new Redis(process.env.REDIS_URL!);
