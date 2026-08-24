import './env';
import cron from 'node-cron';
import { runArchiveBatch } from './archive-batch';

export { runArchiveBatch };

export function startArchiveWorker(): ReturnType<typeof cron.schedule> {
  const job = cron.schedule('0 * * * *', () => {
    void runArchiveBatch();
  });
  return job;
}

if (require.main === module) {
  startArchiveWorker();
  console.log('[archive-worker] started');
}
