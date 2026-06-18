import { createApp } from './app';
import { env } from './env';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 TaskFlow API running on http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Health: http://localhost:${env.PORT}/api/v1/health`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  const forceExit = setTimeout(() => {
    console.error('Forced exit after 10s');
    process.exit(1);
  }, 10_000).unref();
  void forceExit;

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  } catch (err) {
    console.error('Shutdown error:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));