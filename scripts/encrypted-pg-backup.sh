#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_RECIPIENT:?BACKUP_RECIPIENT is required}"
: "${BACKUP_OUTPUT_DIR:?BACKUP_OUTPUT_DIR is required}"

if [[ "$BACKUP_OUTPUT_DIR" == "/" || -z "$BACKUP_OUTPUT_DIR" ]]; then
  echo "Refusing unsafe backup output directory" >&2
  exit 1
fi

for command_name in pg_dump gpg sha256sum mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Missing required backup command: $command_name" >&2
    exit 1
  }
done

mkdir -p -- "$BACKUP_OUTPUT_DIR"
output_dir="$(cd -- "$BACKUP_OUTPUT_DIR" && pwd -P)"
backup_id="${BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
if [[ ! "$backup_id" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Refusing unsafe backup ID" >&2
  exit 1
fi
encrypted_file="$output_dir/taskflow-${backup_id}.dump.gpg"
checksum_file="$encrypted_file.sha256"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/taskflow-backup.XXXXXX")"
plain_dump="$temp_dir/taskflow.dump"

cleanup() {
  rm -rf -- "$temp_dir"
}
trap cleanup EXIT

if ! pg_dump --format=custom --file "$plain_dump" "$DATABASE_URL" \
  >"$temp_dir/pg_dump.stdout" 2>"$temp_dir/pg_dump.stderr"; then
  echo "PostgreSQL backup failed" >&2
  exit 1
fi

if ! gpg --batch --yes --trust-model always --recipient "$BACKUP_RECIPIENT" \
  --output "$encrypted_file" --encrypt "$plain_dump" \
  >"$temp_dir/gpg.stdout" 2>"$temp_dir/gpg.stderr"; then
  rm -f -- "$encrypted_file"
  echo "Backup encryption failed" >&2
  exit 1
fi

if ! sha256sum "$encrypted_file" >"$checksum_file"; then
  rm -f -- "$encrypted_file" "$checksum_file"
  echo "Backup checksum failed" >&2
  exit 1
fi

chmod 600 "$encrypted_file" "$checksum_file"
printf 'encrypted_backup=%s\nchecksum=%s\n' "$(basename -- "$encrypted_file")" "$(basename -- "$checksum_file")"
