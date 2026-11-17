import './env';
import cron from 'node-cron';
import { runArchiveBatch } from './archive-batch';

export { runArchiveBatch };

export function startArchiveWorker(): ReturnType<typeof cron.schedule> {
  const job = cron.schedule('0 * * * *', () => runArchiveBatch(), { noOverlap: true });
  return job;
}

if (require.main === module) {
  startArchiveWorker();
  console.log('[archive-worker] started');
}
