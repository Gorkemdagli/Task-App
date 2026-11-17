import './env';
import { runArchiveBatch } from './archive-batch';
import { maintenancePrisma } from './lib/maintenancePrisma';

export async function runArchiveOnce(): Promise<void> {
  try {
    const result = await runArchiveBatch();
    console.log(`[archive-worker] completed archived=${result.archivedCount}`);
  } catch (error) {
    console.error('[archive-worker] failed', error);
    process.exitCode = 1;
  } finally {
    try {
      await maintenancePrisma.$disconnect();
    } catch (error) {
      console.error('[archive-worker] disconnect failed', error);
      process.exitCode = 1;
    }
  }
}

if (require.main === module) void runArchiveOnce();
