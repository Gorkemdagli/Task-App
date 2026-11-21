#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "$0")" && pwd -P)"
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
mock_bin="$temp_dir/bin"
state_dir="$temp_dir/state"
credential_dir="$temp_dir/credentials"
mkdir -p "$mock_bin" "$credential_dir"
printf '%s\n' '12345678-abcd' > "$temp_dir/uuid"
printf '%s\n' 'test-secret' > "$credential_dir/deploy-token"

cat > "$mock_bin/git" <<'MOCK_GIT'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$*" == "ls-remote --exit-code --quiet https://github.com/Gorkemdagli/Task-App.git refs/heads/Master" ]]
printf '%s\trefs/heads/Master\n' "$MOCK_REMOTE_SHA"
MOCK_GIT

cat > "$mock_bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
IFS= read -r authorization
[[ "$authorization" == 'Authorization: Bearer test-secret' ]]
[[ "${!#}" == 'http://127.0.0.1:8000/api/v1/deploy?uuid=12345678-abcd&force=false' ]]
printf 'called\n' >> "$MOCK_CURL_CALLS"
if [[ "${MOCK_CURL_EXIT:-0}" != 0 ]]; then
  exit "$MOCK_CURL_EXIT"
fi
printf '%s' "${MOCK_HTTP_STATUS:-202}"
MOCK_CURL
chmod +x "$mock_bin/git" "$mock_bin/curl"

run_poller() {
  env PATH="$mock_bin:$PATH" \
    TASKFLOW_COOLIFY_UUID_FILE="$temp_dir/uuid" \
    TASKFLOW_COOLIFY_STATE_DIR="$state_dir" \
    CREDENTIALS_DIRECTORY="$credential_dir" \
    MOCK_CURL_CALLS="$temp_dir/calls" \
    "$@" "$script_dir/master-poller.sh"
}

first_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
second_sha=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

run_poller MOCK_REMOTE_SHA="$first_sha" >/dev/null
[[ "$(<"$state_dir/master.sha")" == "$first_sha" ]]
[[ ! -e "$temp_dir/calls" ]]

run_poller MOCK_REMOTE_SHA="$first_sha" >/dev/null
[[ ! -e "$temp_dir/calls" ]]

run_poller MOCK_REMOTE_SHA="$second_sha" >/dev/null
[[ "$(<"$state_dir/master.sha")" == "$second_sha" ]]
[[ "$(wc -l < "$temp_dir/calls")" -eq 1 ]]

third_sha=cccccccccccccccccccccccccccccccccccccccc
if run_poller MOCK_REMOTE_SHA="$third_sha" MOCK_HTTP_STATUS=500 >/dev/null 2>&1; then
  echo "Expected a failed Coolify response to fail the poller" >&2
  exit 1
fi
[[ "$(<"$state_dir/master.sha")" == "$second_sha" ]]

if run_poller MOCK_REMOTE_SHA="$third_sha" MOCK_CURL_EXIT=7 >/dev/null 2>&1; then
  echo "Expected a network error to fail the poller" >&2
  exit 1
fi
[[ "$(<"$state_dir/master.sha")" == "$second_sha" ]]

run_poller MOCK_REMOTE_SHA="$third_sha" MOCK_HTTP_STATUS=202 >/dev/null
[[ "$(<"$state_dir/master.sha")" == "$third_sha" ]]
[[ "$(wc -l < "$temp_dir/calls")" -eq 4 ]]

grep -Fq 'OnUnitActiveSec=5min' "$script_dir/taskflow-coolify-master-poller.timer"
echo "master poller checks passed"
