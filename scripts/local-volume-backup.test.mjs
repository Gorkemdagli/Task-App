import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
const bash = process.platform === 'win32' && existsSync(gitBash) ? gitBash : 'bash';
const script = 'scripts/local-volume-backup.sh';

describe('local volume backup bundle', () => {
  it('round-trips the file manifest and refuses corruption or output replacement', () => {
    const root = mkdtempSync(join(tmpdir(), 'taskflow-local-backup-test-'));
    try {
      const storage = join(root, 'storage');
      const output = join(root, 'output');
      mkdirSync(join(storage, 'public'), { recursive: true });
      mkdirSync(join(storage, 'private'), { recursive: true });
      mkdirSync(output);
      writeFileSync(join(storage, 'public', 'logo.webp'), Buffer.from([0, 1, 2, 255]));
      writeFileSync(join(storage, 'private', 'task-1.bin'), 'private fixture');
      writeFileSync(join(root, 'dump.fixture'), 'disposable pg dump');
      writeFileSync(join(root, 'private.asc'), 'mock key');
      writeFileSync(join(root, 'bad-private.asc'), 'bad mock key');

      const bashEnv = join(root, 'bash-env.sh');
      writeFileSync(bashEnv, `
pg_dump() {
  printf '%s\\n' "$@" >"$BACKUP_TEST_PG_DUMP_ARGS"
  cp "$PGSERVICEFILE" "$BACKUP_TEST_SERVICE_COPY"
  if [ -n "\${PGPASSFILE:-}" ]; then cp "$PGPASSFILE" "$BACKUP_TEST_PASS_COPY"; else printf unset >"$BACKUP_TEST_PASS_COPY"; fi
  printf '%s|%s|%s|%s|%s|%s|%s\\n' "\${PGPASSWORD:-unset}" "\${PGHOST:-unset}" "\${PGDATABASE:-unset}" "\${PGUSER:-unset}" "\${PGSSLMODE:-unset}" "\${PGSERVICE:-unset}" "\${PGPASSFILE:+set}" >"$BACKUP_TEST_PG_ENV_STATE"
  printf '%s' "\${DATABASE_URL:-unset}" >"$BACKUP_TEST_DB_URL_STATE"
  while [ "$#" -gt 0 ]; do
    if [ "$1" = --file ]; then cp "$BACKUP_TEST_DUMP" "$2"; return $?; fi
    shift
  done
  return 2
}
gpg() {
  local mode= output= input=
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --import) input=$2; grep -q bad "$input" && return 1; return 0 ;;
      --output) output=$2; shift 2 ;;
      --encrypt) mode=encrypt; shift ;;
      --decrypt) mode=decrypt; shift ;;
      *) input=$1; shift ;;
    esac
  done
  if [ "$mode" = encrypt ]; then
    [ "\${BACKUP_TEST_FAIL_ENCRYPT:-}" != 1 ] || return 1
    cp "$input" "$output"
  else
    cat "$input"
  fi
}
pg_restore() { printf 'TABLE public.probe\\n'; }
`);

      const env = {
        ...process.env,
        BACKUP_ID: 'self-check',
        BACKUP_OUTPUT_DIR: output,
        BACKUP_RECIPIENT: 'test-recipient',
        BACKUP_STORAGE_ROOT: storage,
        BACKUP_TEST_DUMP: join(root, 'dump.fixture'),
        BACKUP_TEST_PG_DUMP_ARGS: join(root, 'pg_dump.args'),
        BACKUP_TEST_SERVICE_COPY: join(root, 'pg_service.conf'),
        BACKUP_TEST_PASS_COPY: join(root, 'pgpass'),
        BACKUP_TEST_DB_URL_STATE: join(root, 'database-url-state'),
        BACKUP_TEST_PG_ENV_STATE: join(root, 'pg-env-state'),
        BACKUP_WRITERS_STOPPED: '1',
        DATABASE_URL: 'postgresql://backup%40user:p%40ss%3A%25%23%27%5Cword@db.example:5432/taskflow?sslmode=require&schema=public',
        PGPASSWORD: 'ambient-dummy-password',
        PGHOST: 'ambient.invalid',
        PGDATABASE: 'ambient-database',
        PGUSER: 'ambient-user',
        PGSSLMODE: 'disable',
        PGSERVICE: 'ambient-service',
        PGSERVICEFILE: join(root, 'ambient.pg_service.conf'),
        PGPASSFILE: join(root, 'ambient.pgpass'),
        BASH_ENV: bashEnv,
      };
      const create = spawnSync(bash, [script, 'create'], { cwd: process.cwd(), encoding: 'utf8', env });
      assert.equal(create.status, 0, create.stderr);
      const encrypted = join(output, 'taskflow-self-check.recovery.tar.gpg');
      const checksum = `${encrypted}.sha256`;
      assert.equal(existsSync(encrypted), true);
      assert.equal(existsSync(checksum), true);
      assert.equal(readFileSync(encrypted).includes(Buffer.from('disposable pg dump')), false);
      const dumpArgs = readFileSync(join(root, 'pg_dump.args'), 'utf8');
      assert.match(dumpArgs, /--dbname=service=taskflow_backup/);
      assert.doesNotMatch(dumpArgs, /postgresql:\/\//);
      assert.equal(readFileSync(join(root, 'database-url-state'), 'utf8'), 'unset');
      assert.equal(readFileSync(join(root, 'pg-env-state'), 'utf8'), 'unset|unset|unset|unset|unset|taskflow_backup|set\n');
      const service = readFileSync(join(root, 'pg_service.conf'), 'utf8');
      assert.match(service, /host=db\.example/);
      assert.match(service, /dbname=taskflow/);
      assert.match(service, /user=backup@user/);
      assert.match(service, /sslmode=require/);
      assert.doesNotMatch(service, /password=/);
      assert.doesNotMatch(service, /schema/);
      assert.equal(readFileSync(join(root, 'pgpass'), 'utf8'), "*:*:*:*:p@ss\\:%#'\\\\word\n");

      const verifyEnv = {
        ...env,
        BACKUP_ENCRYPTED_FILE: encrypted,
        BACKUP_CHECKSUM_FILE: checksum,
        BACKUP_PRIVATE_KEY_FILE: join(root, 'private.asc'),
      };
      const verify = spawnSync(bash, [script, 'verify'], { cwd: process.cwd(), encoding: 'utf8', env: verifyEnv });
      assert.equal(verify.status, 0, verify.stderr);
      assert.match(verify.stdout, /backup_verified=taskflow-self-check\.recovery\.tar\.gpg/);

      const savedChecksum = readFileSync(checksum, 'utf8');
      writeFileSync(checksum, `${'0'.repeat(64)}  taskflow-self-check.recovery.tar.gpg\n`);
      const corrupt = spawnSync(bash, [script, 'verify'], { cwd: process.cwd(), encoding: 'utf8', env: verifyEnv });
      assert.notEqual(corrupt.status, 0);
      assert.match(corrupt.stderr, /checksum mismatch/);
      writeFileSync(checksum, savedChecksum);

      const collision = spawnSync(bash, [script, 'create'], { cwd: process.cwd(), encoding: 'utf8', env });
      assert.notEqual(collision.status, 0);
      assert.equal(readFileSync(checksum, 'utf8'), savedChecksum);

      const badKey = spawnSync(bash, [script, 'verify'], {
        cwd: process.cwd(), encoding: 'utf8', env: { ...verifyEnv, BACKUP_PRIVATE_KEY_FILE: join(root, 'bad-private.asc') },
      });
      assert.notEqual(badKey.status, 0);
      assert.match(badKey.stderr, /decryption key import failed/);

      const unacknowledged = { ...env };
      delete unacknowledged.BACKUP_WRITERS_STOPPED;
      unacknowledged.BACKUP_ID = 'unacknowledged';
      const writerGate = spawnSync(bash, [script, 'create'], { cwd: process.cwd(), encoding: 'utf8', env: unacknowledged });
      assert.notEqual(writerGate.status, 0);
      assert.match(writerGate.stderr, /stopping all application writers/);

      const encryptionFailure = spawnSync(bash, [script, 'create'], {
        cwd: process.cwd(), encoding: 'utf8', env: { ...env, BACKUP_ID: 'failed-encryption', BACKUP_TEST_FAIL_ENCRYPT: '1' },
      });
      assert.notEqual(encryptionFailure.status, 0);
      assert.match(encryptionFailure.stderr, /Backup encryption failed/);
      assert.deepEqual(readdirSync(output).sort(), [
        'taskflow-self-check.recovery.tar.gpg',
        'taskflow-self-check.recovery.tar.gpg.sha256',
      ]);

      const passwordless = spawnSync(bash, [script, 'create'], {
        cwd: process.cwd(), encoding: 'utf8', env: {
          ...env,
          BACKUP_ID: 'passwordless',
          DATABASE_URL: 'postgresql://backup%40user@db.example:5432/taskflow?sslmode=require&schema=public',
        },
      });
      assert.equal(passwordless.status, 0, passwordless.stderr);
      assert.equal(readFileSync(join(root, 'pg-env-state'), 'utf8'), 'unset|unset|unset|unset|unset|taskflow_backup|\n');
      assert.equal(readFileSync(join(root, 'pgpass'), 'utf8'), 'unset');

      const payload = join(root, 'malicious-payload');
      mkdirSync(join(payload, 'public'), { recursive: true });
      mkdirSync(join(payload, 'private'), { recursive: true });
      writeFileSync(join(payload, 'taskflow.dump'), 'fake dump');
      writeFileSync(join(payload, 'manifest.txt'), 'TASKFLOW-LOCAL-BACKUP-MANIFEST-V1\nbackup_id=bad\ncreated_utc=2026-01-01T00:00:00Z\nsource_revision=fixture\n');
      writeFileSync(join(payload, 'public', 'probe.txt'), 'fixture');
      const archive = join(root, 'traversal.tar.gz');
      const tarEnv = { ...verifyEnv, BACKUP_TEST_ARCHIVE: archive, BACKUP_TEST_PAYLOAD: payload };
      const archiveBuild = spawnSync(bash, ['-c', 'archive="$BACKUP_TEST_ARCHIVE"; payload="$BACKUP_TEST_PAYLOAD"; if command -v cygpath >/dev/null 2>&1; then archive="$(cygpath -u "$archive")"; payload="$(cygpath -u "$payload")"; fi; tar --create --gzip --file "$archive" --transform="s|public/probe.txt|../escape|" --directory "$payload" taskflow.dump manifest.txt public private'], {
        cwd: process.cwd(), encoding: 'utf8', env: tarEnv,
      });
      assert.equal(archiveBuild.status, 0, archiveBuild.stderr);
      const listing = spawnSync(bash, ['-c', 'archive="$BACKUP_TEST_ARCHIVE"; if command -v cygpath >/dev/null 2>&1; then archive="$(cygpath -u "$archive")"; fi; tar --list --gzip --file "$archive"'], {
        cwd: process.cwd(), encoding: 'utf8', env: tarEnv,
      });
      assert.match(listing.stdout, /\.\.\/escape/);
      const maliciousBundle = join(output, 'malicious.recovery.tar.gpg');
      copyFileSync(archive, maliciousBundle);
      const maliciousChecksum = `${maliciousBundle}.sha256`;
      const maliciousHash = createHash('sha256').update(readFileSync(maliciousBundle)).digest('hex');
      writeFileSync(maliciousChecksum, `${maliciousHash}  malicious.recovery.tar.gpg\n`);
      const traversal = spawnSync(bash, [script, 'verify'], {
        cwd: process.cwd(), encoding: 'utf8', env: { ...verifyEnv, BACKUP_ENCRYPTED_FILE: maliciousBundle, BACKUP_CHECKSUM_FILE: maliciousChecksum },
      });
      assert.notEqual(traversal.status, 0);
      assert.match(traversal.stderr, /unsafe path/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
