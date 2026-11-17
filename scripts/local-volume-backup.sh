#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

fail() {
  echo "$1" >&2
  exit 1
}

require_commands() {
  for command_name in "$@"; do
    command -v "$command_name" >/dev/null 2>&1 || fail "Missing backup command: $command_name"
  done
}

safe_storage_path() {
  local path=$1
  # shortcut: accepts TaskFlow-style ASCII keys; broaden only with equally safe tar-path validation.
  [[ "$path" =~ ^(public|private)(/[A-Za-z0-9._-]+)*$ ]] || return 1
  [[ "/$path/" != *"/../"* && "/$path/" != *"/./"* ]]
}

create_backup() {
  : "${DATABASE_URL:?DATABASE_URL is required}"
  : "${BACKUP_RECIPIENT:?BACKUP_RECIPIENT is required}"
  : "${BACKUP_OUTPUT_DIR:?BACKUP_OUTPUT_DIR is required}"
  : "${BACKUP_STORAGE_ROOT:?BACKUP_STORAGE_ROOT is required}"
  [[ "${BACKUP_WRITERS_STOPPED:-}" == 1 ]] || fail "Set BACKUP_WRITERS_STOPPED=1 after stopping all application writers"
  [[ -d "$BACKUP_STORAGE_ROOT" && ! -L "$BACKUP_STORAGE_ROOT" ]] || fail "Storage root must be an existing non-symlink directory"

  require_commands pg_dump gpg sha256sum mktemp tar find sort stat base64 tr grep node

  local storage_root output_dir backup_id encrypted_name checksum_name encrypted_file checksum_file
  local temp_dir plain_dump plain_archive manifest service_file source_revision created_utc hash size rel path encoded
  storage_root="$(cd -- "$BACKUP_STORAGE_ROOT" && pwd -P)"
  [[ "$storage_root" != / ]] || fail "Refusing filesystem root as storage root"
  for area in public private; do
    [[ -d "$storage_root/$area" && ! -L "$storage_root/$area" ]] || fail "Storage root must contain real public and private directories"
  done

  if find "$storage_root/public" "$storage_root/private" -mindepth 1 ! \( -type f -o -type d \) -print -quit | grep -q .; then
    fail "Storage may contain only regular files and directories; symlinks and special files are refused"
  fi
  while IFS= read -r -d '' path; do
    rel="${path#"$storage_root"/}"
    safe_storage_path "$rel" || fail "Storage contains a path outside the supported TaskFlow key format"
  done < <(find "$storage_root/public" "$storage_root/private" -print0)

  mkdir -p -- "$BACKUP_OUTPUT_DIR"
  output_dir="$(cd -- "$BACKUP_OUTPUT_DIR" && pwd -P)"
  [[ "$output_dir" != / ]] || fail "Refusing filesystem root as backup output directory"
  backup_id="${BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
  [[ "$backup_id" =~ ^[A-Za-z0-9._-]+$ ]] || fail "Refusing unsafe backup ID"
  encrypted_name="taskflow-${backup_id}.recovery.tar.gpg"
  checksum_name="${encrypted_name}.sha256"
  encrypted_file="$output_dir/$encrypted_name"
  checksum_file="$output_dir/$checksum_name"
  [[ ! -e "$encrypted_file" && ! -e "$checksum_file" ]] || fail "Backup output already exists; choose a new BACKUP_ID"

  temp_dir="$(mktemp -d "$output_dir/.taskflow-backup.XXXXXX")"
  plain_dump="$temp_dir/taskflow.dump"
  plain_archive="$temp_dir/recovery.tar.gz"
  manifest="$temp_dir/manifest.txt"
  service_file="$temp_dir/pg_service.conf"
  local published_encrypted=0 published_checksum=0 completed=0
  cleanup() {
    if [[ "$completed" != 1 ]]; then
      [[ "$published_encrypted" == 0 ]] || rm -f -- "$encrypted_file"
      [[ "$published_checksum" == 0 ]] || rm -f -- "$checksum_file"
    fi
    rm -rf -- "$temp_dir"
  }
  trap cleanup EXIT

  if ! DATABASE_URL="$DATABASE_URL" node - "$service_file" <<'NODE'
const fs = require('node:fs');

function quote(value) {
  if (/[\0\r\n]/.test(value)) throw new Error('invalid connection value');
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

try {
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) throw new Error('invalid URL');
  const options = new Map();
  const add = (key, value) => {
    if (options.has(key)) throw new Error('duplicate option');
    options.set(key, value);
  };
  if (url.hostname) add('host', url.hostname.replace(/^\[|\]$/g, ''));
  if (url.port) add('port', url.port);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (database) add('dbname', database);
  if (url.username) add('user', decodeURIComponent(url.username));
  if (url.password) add('password', decodeURIComponent(url.password));
  for (const [rawKey, value] of url.searchParams) {
    const key = rawKey.toLowerCase();
    if (key === 'schema') continue;
    if (!/^[a-z_][a-z0-9_]*$/.test(key) || ['service', 'servicefile', 'passfile'].includes(key)) throw new Error('invalid option');
    add(key, value);
  }
  if (!options.has('dbname')) throw new Error('missing database');
  const contents = `[taskflow_backup]\n${[...options].map(([key, value]) => `${key}=${quote(value)}`).join('\n')}\n`;
  fs.writeFileSync(process.argv[2], contents, { flag: 'wx', mode: 0o600 });
} catch {
  process.exitCode = 1;
}
NODE
  then
    fail "DATABASE_URL could not be converted to a protected libpq service file"
  fi
  chmod 600 "$service_file"
  unset DATABASE_URL
  if ! PGSERVICEFILE="$service_file" PGSERVICE=taskflow_backup \
    pg_dump --format=custom --file "$plain_dump" --dbname=service=taskflow_backup \
    >"$temp_dir/pg_dump.stdout" 2>"$temp_dir/pg_dump.stderr"; then
    fail "PostgreSQL backup failed"
  fi

  source_revision="${BACKUP_SOURCE_REVISION:-}"
  if [[ -z "$source_revision" ]] && command -v git >/dev/null 2>&1; then
    source_revision="$(git -C "$(dirname -- "${BASH_SOURCE[0]}")/.." rev-parse --verify HEAD 2>/dev/null || true)"
  fi
  [[ "$source_revision" =~ ^[A-Za-z0-9._-]+$ ]] || source_revision=unavailable
  created_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  {
    printf 'TASKFLOW-LOCAL-BACKUP-MANIFEST-V1\nbackup_id=%s\ncreated_utc=%s\nsource_revision=%s\n' "$backup_id" "$created_utc" "$source_revision"
    find "$storage_root/public" "$storage_root/private" -type f -print0 | sort -z >"$temp_dir/files.list"
    while IFS= read -r -d '' path; do
      rel="${path#"$storage_root"/}"
      safe_storage_path "$rel" || fail "Storage contains an unsupported file path"
      hash="$(sha256sum <"$path")"
      hash="${hash%% *}"
      size="$(stat -c %s -- "$path")"
      encoded="$(printf '%s' "$rel" | base64 | tr -d '\n')"
      printf '%s\t%s\t%s\n' "$hash" "$size" "$encoded"
    done <"$temp_dir/files.list"
  } >"$manifest"

  if ! tar --create --gzip --file "$plain_archive" --directory "$temp_dir" taskflow.dump manifest.txt --directory "$storage_root" public private \
    >"$temp_dir/tar.stdout" 2>"$temp_dir/tar.stderr"; then
    fail "Backup archive creation failed"
  fi
  if ! gpg --batch --yes --trust-model always --recipient "$BACKUP_RECIPIENT" \
    --output "$temp_dir/$encrypted_name" --encrypt "$plain_archive" \
    >"$temp_dir/gpg.stdout" 2>"$temp_dir/gpg.stderr"; then
    fail "Backup encryption failed"
  fi
  chmod 600 "$temp_dir/$encrypted_name"
  hash="$(sha256sum <"$temp_dir/$encrypted_name")"
  hash="${hash%% *}"
  printf '%s  %s\n' "$hash" "$encrypted_name" >"$temp_dir/$checksum_name"
  chmod 600 "$temp_dir/$checksum_name"

  ln -- "$temp_dir/$encrypted_name" "$encrypted_file" || fail "Could not publish encrypted backup without overwriting an existing file"
  published_encrypted=1
  ln -- "$temp_dir/$checksum_name" "$checksum_file" || fail "Could not publish checksum without overwriting an existing file"
  published_checksum=1
  completed=1
  printf 'encrypted_backup=%s\nchecksum=%s\n' "$encrypted_file" "$checksum_file"
  trap - EXIT
  cleanup
}

verify_backup() {
  : "${BACKUP_ENCRYPTED_FILE:?BACKUP_ENCRYPTED_FILE is required}"
  : "${BACKUP_CHECKSUM_FILE:?BACKUP_CHECKSUM_FILE is required}"
  : "${BACKUP_PRIVATE_KEY_FILE:?BACKUP_PRIVATE_KEY_FILE is required}"
  require_commands gpg sha256sum pg_restore tar base64 stat find sort cmp awk wc mktemp
  [[ -f "$BACKUP_ENCRYPTED_FILE" && -f "$BACKUP_CHECKSUM_FILE" && -f "$BACKUP_PRIVATE_KEY_FILE" ]] || fail "Backup verification input is missing"

  local expected recorded actual temp_dir archive gnupg_home members details payload manifest magic id_line date_line revision_line
  local member normalized line mode hash bytes encoded path path_bytes actual_hash actual_bytes row
  local -A seen_members=() seen_files=()
  read -r expected recorded <"$BACKUP_CHECKSUM_FILE" || fail "Backup checksum file is invalid"
  [[ "$expected" =~ ^[a-fA-F0-9]{64}$ && "$recorded" == "$(basename -- "$BACKUP_ENCRYPTED_FILE")" ]] || fail "Backup checksum file is invalid"
  actual="$(sha256sum <"$BACKUP_ENCRYPTED_FILE" | awk '{ print $1 }')"
  [[ "$expected" == "$actual" ]] || fail "Backup checksum mismatch"

  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/taskflow-local-backup-verify.XXXXXX")"
  archive="$temp_dir/recovery.tar.gz"
  gnupg_home="$temp_dir/gnupg"
  mkdir -m 700 -- "$gnupg_home"
  cleanup() { rm -rf -- "$temp_dir"; }
  trap cleanup EXIT

  if ! GNUPGHOME="$gnupg_home" gpg --batch --quiet --import "$BACKUP_PRIVATE_KEY_FILE" \
    >"$temp_dir/gpg-import.stdout" 2>"$temp_dir/gpg-import.stderr"; then
    fail "Backup decryption key import failed"
  fi
  if ! GNUPGHOME="$gnupg_home" gpg --batch --quiet --decrypt "$BACKUP_ENCRYPTED_FILE" \
    >"$archive" 2>"$temp_dir/gpg-decrypt.stderr"; then
    fail "Backup decryption failed"
  fi
  if ! tar --list --gzip --file "$archive" >"$temp_dir/members" 2>"$temp_dir/tar-list.stderr" || \
    ! tar --list --verbose --quoting-style=c --gzip --file "$archive" >"$temp_dir/details" 2>"$temp_dir/tar-details.stderr"; then
    fail "Backup archive listing failed"
  fi

  while IFS= read -r member; do
    normalized="${member%/}"
    [[ "$normalized" == taskflow.dump || "$normalized" == manifest.txt || "$normalized" == public || "$normalized" == public/* || "$normalized" == private || "$normalized" == private/* ]] || fail "Backup archive contains an unsafe path"
    [[ "$normalized" =~ ^[A-Za-z0-9._/-]+$ && "/$normalized/" != *"/../"* && "/$normalized/" != *"/./"* ]] || fail "Backup archive contains an unsafe path"
    [[ -z "${seen_members[$normalized]+present}" ]] || fail "Backup archive contains duplicate paths"
    seen_members[$normalized]=1
  done <"$temp_dir/members"
  [[ -n "${seen_members[taskflow.dump]+present}" && -n "${seen_members[manifest.txt]+present}" && \
    -n "${seen_members[public]+present}" && -n "${seen_members[private]+present}" ]] || fail "Backup archive is incomplete"
  local member_count detail_count
  member_count="$(wc -l <"$temp_dir/members")"
  detail_count="$(wc -l <"$temp_dir/details")"
  [[ "$member_count" == "$detail_count" ]] || fail "Backup archive listing is inconsistent"
  while IFS= read -r line; do
    mode="${line:0:1}"
    [[ "$mode" == - || "$mode" == d ]] || fail "Backup archive contains a non-file entry"
  done <"$temp_dir/details"

  payload="$temp_dir/payload"
  mkdir -m 700 -- "$payload"
  if ! tar --extract --gzip --file "$archive" --no-same-owner --no-same-permissions --directory "$payload" \
    >"$temp_dir/tar-extract.stdout" 2>"$temp_dir/tar-extract.stderr"; then
    fail "Backup archive extraction failed"
  fi
  [[ -f "$payload/taskflow.dump" && ! -L "$payload/taskflow.dump" && -f "$payload/manifest.txt" && ! -L "$payload/manifest.txt" && \
    -d "$payload/public" && ! -L "$payload/public" && -d "$payload/private" && ! -L "$payload/private" ]] || fail "Backup archive contents are incomplete"

  exec 3<"$payload/manifest.txt"
  IFS= read -r magic <&3 || fail "Backup manifest is incomplete"
  IFS= read -r id_line <&3 || fail "Backup manifest is incomplete"
  IFS= read -r date_line <&3 || fail "Backup manifest is incomplete"
  IFS= read -r revision_line <&3 || fail "Backup manifest is incomplete"
  [[ "$magic" == TASKFLOW-LOCAL-BACKUP-MANIFEST-V1 && "$id_line" =~ ^backup_id=[A-Za-z0-9._-]+$ && \
    "$date_line" =~ ^created_utc=[0-9TZ:.-]+$ && "$revision_line" =~ ^source_revision=[A-Za-z0-9._-]+$ ]] || fail "Backup manifest header is invalid"
  : >"$temp_dir/expected-files"
  while IFS= read -r row <&3; do
    IFS=$'\t' read -r hash bytes encoded extra <<<"$row"
    [[ -z "${extra:-}" && "$hash" =~ ^[a-fA-F0-9]{64}$ && "$bytes" =~ ^[0-9]+$ && "$encoded" =~ ^[A-Za-z0-9+/]+={0,2}$ ]] || fail "Backup manifest entry is invalid"
    printf '%s' "$encoded" | base64 --decode >"$temp_dir/path.bin" 2>/dev/null || fail "Backup manifest path is invalid"
    path=''
    IFS= read -r -d '' path <"$temp_dir/path.bin" || true
    path_bytes="$(wc -c <"$temp_dir/path.bin")"
    [[ "$path_bytes" -eq "${#path}" ]] || fail "Backup manifest path is invalid"
    safe_storage_path "$path" || fail "Backup manifest path is unsafe"
    [[ -z "${seen_files[$path]+present}" ]] || fail "Backup manifest contains duplicate paths"
    seen_files[$path]=1
    [[ -f "$payload/$path" && ! -L "$payload/$path" ]] || fail "Backup manifest file is missing"
    actual_bytes="$(stat -c %s -- "$payload/$path")"
    actual_hash="$(sha256sum <"$payload/$path")"
    actual_hash="${actual_hash%% *}"
    [[ "$bytes" == "$actual_bytes" && "$hash" == "$actual_hash" ]] || fail "Backup file integrity mismatch"
    printf '%s\n' "$path" >>"$temp_dir/expected-files"
  done
  exec 3<&-
  (cd -- "$payload" && find public private -type f -print | sort) >"$temp_dir/actual-files"
  sort "$temp_dir/expected-files" >"$temp_dir/expected-files.sorted"
  cmp -s "$temp_dir/expected-files.sorted" "$temp_dir/actual-files" || fail "Backup file manifest does not match storage contents"

  if ! pg_restore --list "$payload/taskflow.dump" >"$temp_dir/restore.list" 2>"$temp_dir/restore.stderr" || [[ ! -s "$temp_dir/restore.list" ]]; then
    fail "Backup PostgreSQL dump listing failed"
  fi
  printf 'backup_verified=%s\n' "$(basename -- "$BACKUP_ENCRYPTED_FILE")"
  trap - EXIT
  cleanup
}

case "${1:-}" in
  create) create_backup ;;
  verify) verify_backup ;;
  *) fail "Usage: $0 create|verify" ;;
esac
