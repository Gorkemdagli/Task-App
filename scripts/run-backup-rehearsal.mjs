import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
const command = process.platform === 'win32' && existsSync(gitBash) ? gitBash : 'bash';
const child = spawn(command, ['scripts/backup-rehearsal.sh'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

child.once('error', (error) => {
  console.error(`Unable to start backup rehearsal: ${error.message}`);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    console.error(`Backup rehearsal terminated by ${signal}`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
