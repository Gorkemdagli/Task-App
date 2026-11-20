#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

repository="https://github.com/Gorkemdagli/Task-App.git"
branch_ref="refs/heads/Master"
uuid_file="${TASKFLOW_COOLIFY_UUID_FILE:-/etc/taskflow-coolify-deploy.uuid}"
state_dir="${TASKFLOW_COOLIFY_STATE_DIR:-/var/lib/taskflow-coolify-deploy}"
state_file="$state_dir/master.sha"
credential_file="${CREDENTIALS_DIRECTORY:?systemd credential directory is required}/deploy-token"

if [[ ! -r "$uuid_file" || ! -r "$credential_file" ]]; then
  echo "Coolify UUID or deploy credential is unavailable" >&2
  exit 1
fi

IFS= read -r resource_uuid < "$uuid_file" || true
IFS= read -r deploy_token < "$credential_file" || true
if [[ ! "$resource_uuid" =~ ^[A-Za-z0-9-]{8,128}$ ]]; then
  echo "Coolify resource UUID is invalid" >&2
  exit 1
fi
if [[ -z "$deploy_token" || "$deploy_token" == *$'\n'* || "$deploy_token" == *$'\r'* ]]; then
  echo "Coolify deploy credential is invalid" >&2
  exit 1
fi

remote_output="$(GIT_TERMINAL_PROMPT=0 git ls-remote --exit-code --quiet "$repository" "$branch_ref")"
if [[ ! "$remote_output" =~ ^([0-9a-f]{40}|[0-9a-f]{64})[[:space:]]refs/heads/Master$ ]]; then
  echo "Could not read the exact GitHub Master branch revision" >&2
  exit 1
fi
remote_sha="${BASH_REMATCH[1]}"

mkdir -p -- "$state_dir"
if [[ ! -e "$state_file" ]]; then
  state_tmp="$(mktemp "$state_dir/.master.sha.XXXXXX")"
  trap 'rm -f -- "$state_tmp"' EXIT
  printf '%s\n' "$remote_sha" > "$state_tmp"
  chmod 600 "$state_tmp"
  mv -f -- "$state_tmp" "$state_file"
  trap - EXIT
  echo "Recorded the initial Master revision without deploying"
  exit 0
fi

IFS= read -r previous_sha < "$state_file" || true
if [[ ! "$previous_sha" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]]; then
  echo "Stored Master revision is invalid; refusing to deploy" >&2
  exit 1
fi
if [[ "$remote_sha" == "$previous_sha" ]]; then
  exit 0
fi

if ! http_status="$(printf 'Authorization: Bearer %s\n' "$deploy_token" | curl \
  --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --request POST --header @- --noproxy '*' --proto '=http' \
  --connect-timeout 5 --max-time 20 \
  "http://127.0.0.1:8000/api/v1/deploy?uuid=${resource_uuid}&force=false")"; then
  echo "Coolify deploy request failed; revision will be retried" >&2
  exit 1
fi
if [[ ! "$http_status" =~ ^2[0-9][0-9]$ ]]; then
  echo "Coolify rejected the deploy request (HTTP $http_status); revision will be retried" >&2
  exit 1
fi

state_tmp="$(mktemp "$state_dir/.master.sha.XXXXXX")"
trap 'rm -f -- "$state_tmp"' EXIT
printf '%s\n' "$remote_sha" > "$state_tmp"
chmod 600 "$state_tmp"
mv -f -- "$state_tmp" "$state_file"
trap - EXIT
echo "Coolify accepted deployment for the new Master revision"
