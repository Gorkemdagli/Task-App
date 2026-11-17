#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required for backup rehearsal" >&2
  exit 1
}

# Git Bash otherwise rewrites container paths such as /var/lib/postgresql.
if command -v cygpath >/dev/null 2>&1; then
  export MSYS_NO_PATHCONV=1
fi

scripts_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
rehearsal_dir="$(mktemp -d "${TMPDIR:-/tmp}/taskflow-backup-rehearsal.XXXXXX")"

docker_mount_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    printf '%s\n' "$1"
  fi
}

docker_scripts_dir="$(docker_mount_path "$scripts_dir")"
docker_rehearsal_dir="$(docker_mount_path "$rehearsal_dir")"
mkdir -p "$rehearsal_dir/storage/public" "$rehearsal_dir/storage/private"
printf 'rehearsal public object\n' >"$rehearsal_dir/storage/public/probe.txt"
printf 'rehearsal private object\n' >"$rehearsal_dir/storage/private/probe.txt"
run_id="${RANDOM:-0}-$$"
network_name="taskflow-backup-${run_id}"
db_name="taskflow-backup-db-${run_id}"
backup_image="taskflow-backup-rehearsal:${run_id}"

cleanup() {
  docker rm -f "$db_name" >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
  docker image rm -f "$backup_image" >/dev/null 2>&1 || true
  rm -rf -- "$rehearsal_dir"
}
trap cleanup EXIT

docker network create "$network_name" >/dev/null
docker build --pull=false \
  --file "$docker_scripts_dir/Dockerfile.backup-rehearsal" \
  --tag "$backup_image" \
  "$docker_scripts_dir" >/dev/null

docker run --rm -d \
  --name "$db_name" \
  --network "$network_name" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=taskflow \
  -e POSTGRES_DB=taskflow_rehearsal \
  --tmpfs /var/lib/postgresql/data \
  postgres@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b >/dev/null

for attempt in $(seq 1 60); do
  if docker exec "$db_name" pg_isready -U postgres -d taskflow_rehearsal >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "60" ]]; then
    echo "Disposable PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec "$db_name" psql -U postgres -d taskflow_rehearsal -v ON_ERROR_STOP=1 \
  -c 'CREATE TABLE rehearsal_probe (id integer PRIMARY KEY, value text NOT NULL);' \
  -c "INSERT INTO rehearsal_probe VALUES (1, 'encrypted-rehearsal');" >/dev/null

docker run --rm \
  --network "$network_name" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -v "$docker_scripts_dir:/workspace/scripts:ro" \
  -v "$docker_rehearsal_dir:/rehearsal" \
  "$backup_image" \
  bash -s <<'CONTAINER_SCRIPT'
set -Eeuo pipefail

export GNUPGHOME=/rehearsal/gnupg
mkdir -m 700 -p "$GNUPGHOME" /rehearsal/output
gpg --batch --passphrase '' --quick-generate-key \
  'TaskFlow disposable rehearsal <rehearsal@taskflow.invalid>' rsa2048 encrypt 1d >/dev/null 2>&1
recipient="$(gpg --with-colons --list-keys | awk -F: '$1 == "fpr" { print $10; exit }')"
test -n "$recipient"
gpg --batch --armor --export-secret-keys "$recipient" > /rehearsal/private.asc
chmod 600 /rehearsal/private.asc

export DATABASE_URL=postgresql://postgres:taskflow@db:5432/taskflow_rehearsal
export BACKUP_RECIPIENT="$recipient"
export BACKUP_OUTPUT_DIR=/rehearsal/output
export BACKUP_ID=disposable-rehearsal
bash /workspace/scripts/encrypted-pg-backup.sh

encrypted_file="$(find /rehearsal/output -maxdepth 1 -type f -name '*.dump.gpg' -print -quit)"
test -n "$encrypted_file"
export BACKUP_ENCRYPTED_FILE="$encrypted_file"
export BACKUP_CHECKSUM_FILE="$encrypted_file.sha256"
export BACKUP_PRIVATE_KEY_FILE=/rehearsal/private.asc
bash /workspace/scripts/verify-backup.sh
test ! -e /rehearsal/taskflow.dump

export BACKUP_STORAGE_ROOT=/rehearsal/storage
export BACKUP_WRITERS_STOPPED=1
export BACKUP_ID=disposable-volume-rehearsal
bash /workspace/scripts/local-volume-backup.sh create
bundle_file=/rehearsal/output/taskflow-disposable-volume-rehearsal.recovery.tar.gpg
export BACKUP_ENCRYPTED_FILE="$bundle_file"
export BACKUP_CHECKSUM_FILE="$bundle_file.sha256"
bash /workspace/scripts/local-volume-backup.sh verify

bundle_archive=/rehearsal/recovery.tar.gz
GNUPGHOME="$GNUPGHOME" gpg --batch --quiet --decrypt "$bundle_file" >"$bundle_archive"
PGPASSWORD=taskflow createdb -h db -U postgres taskflow_rehearsal_restore
cat >/rehearsal/restore.pg_service.conf <<'RESTORE_SERVICE'
[taskflow_rehearsal_restore]
host=db
port=5432
dbname=taskflow_rehearsal_restore
user=postgres
password=taskflow
RESTORE_SERVICE
chmod 600 /rehearsal/restore.pg_service.conf
export PGSERVICEFILE=/rehearsal/restore.pg_service.conf
export PGSERVICE=taskflow_rehearsal_restore
tar --to-stdout --gzip --file "$bundle_archive" taskflow.dump > /rehearsal/restored.dump
pg_restore --exit-on-error --no-owner --no-acl --dbname=service=taskflow_rehearsal_restore /rehearsal/restored.dump
restored_value="$(psql --dbname=service=taskflow_rehearsal_restore -At -c 'SELECT value FROM rehearsal_probe WHERE id = 1')"
test "$restored_value" = encrypted-rehearsal
tar --to-stdout --gzip --file "$bundle_archive" public/probe.txt | cmp - /rehearsal/storage/public/probe.txt
tar --to-stdout --gzip --file "$bundle_archive" private/probe.txt | cmp - /rehearsal/storage/private/probe.txt
rm -f /rehearsal/restored.dump
test ! -e /rehearsal/restored.dump
CONTAINER_SCRIPT

echo 'backup rehearsal passed: encrypted database and local-volume bundle verified and restored into disposable targets'
