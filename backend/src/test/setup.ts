import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

beforeAll(async () => {
  // Test ortamı bağlantıları zaten env üzerinden kurulu
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});