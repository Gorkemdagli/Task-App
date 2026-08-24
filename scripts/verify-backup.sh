#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${BACKUP_ENCRYPTED_FILE:?BACKUP_ENCRYPTED_FILE is required}"
: "${BACKUP_CHECKSUM_FILE:?BACKUP_CHECKSUM_FILE is required}"
: "${BACKUP_PRIVATE_KEY_FILE:?BACKUP_PRIVATE_KEY_FILE is required}"

for command_name in gpg sha256sum pg_restore mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Missing required backup verification command: $command_name" >&2
    exit 1
  }
done

[[ -f "$BACKUP_ENCRYPTED_FILE" && -f "$BACKUP_CHECKSUM_FILE" && -f "$BACKUP_PRIVATE_KEY_FILE" ]] || {
  echo "Backup verification input is missing" >&2
  exit 1
}

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/taskflow-backup-verify.XXXXXX")"
plain_dump="$temp_dir/taskflow.dump"
gnupg_home="$temp_dir/gnupg"
mkdir -m 700 -- "$gnupg_home"

cleanup() {
  rm -rf -- "$temp_dir"
}
trap cleanup EXIT

expected_checksum="$(awk 'NR == 1 { print $1 }' "$BACKUP_CHECKSUM_FILE")"
actual_checksum="$(sha256sum "$BACKUP_ENCRYPTED_FILE" | awk '{ print $1 }')"
if [[ -z "$expected_checksum" || "$expected_checksum" != "$actual_checksum" ]]; then
  echo "Backup checksum mismatch" >&2
  exit 1
fi

if ! GNUPGHOME="$gnupg_home" gpg --batch --quiet --import "$BACKUP_PRIVATE_KEY_FILE" \
  >"$temp_dir/gpg-import.stdout" 2>"$temp_dir/gpg-import.stderr"; then
  echo "Backup decryption key import failed" >&2
  exit 1
fi

if ! GNUPGHOME="$gnupg_home" gpg --batch --quiet --decrypt "$BACKUP_ENCRYPTED_FILE" \
  >"$plain_dump" 2>"$temp_dir/gpg-decrypt.stderr"; then
  echo "Backup decryption failed" >&2
  exit 1
fi

if ! pg_restore --list "$plain_dump" >"$temp_dir/restore.list" 2>"$temp_dir/restore.stderr"; then
  echo "Backup restore listing failed" >&2
  exit 1
fi

[[ -s "$temp_dir/restore.list" ]] || {
  echo "Backup restore listing is empty" >&2
  exit 1
}

printf 'backup_verified=%s\n' "$(basename -- "$BACKUP_ENCRYPTED_FILE")"
