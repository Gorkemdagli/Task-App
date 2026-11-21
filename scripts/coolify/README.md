# Private Coolify deploy polling

This timer runs on the Coolify Linux host. Every five minutes it checks the public GitHub `Master` branch. The first service run records the current revision and does not deploy. Later changes trigger Coolify through `127.0.0.1`, so the dashboard does not need a public DNS record or inbound access. GitHub needs to be reachable outbound from the host.

## Install from Windows

From the repository root in PowerShell, create a private upload directory in the SSH user's home and copy the three files there. Replace `SSH_USER` and `SERVER_IP` with the SSH login already used for that host.

```powershell
ssh SSH_USER@SERVER_IP 'umask 077; mkdir -p taskflow-coolify-install && chmod 700 taskflow-coolify-install'
scp .\scripts\coolify\master-poller.sh SSH_USER@SERVER_IP:taskflow-coolify-install/
scp .\scripts\coolify\taskflow-coolify-master-poller.service SSH_USER@SERVER_IP:taskflow-coolify-install/
scp .\scripts\coolify\taskflow-coolify-master-poller.timer SSH_USER@SERVER_IP:taskflow-coolify-install/
ssh SSH_USER@SERVER_IP
```

On the Coolify host, install the files:

```sh
sudo install -o root -g root -m 0755 "$HOME/taskflow-coolify-install/master-poller.sh" /usr/local/sbin/taskflow-coolify-master-poller
sudo install -o root -g root -m 0644 "$HOME/taskflow-coolify-install/taskflow-coolify-master-poller.service" /etc/systemd/system/taskflow-coolify-master-poller.service
sudo install -o root -g root -m 0644 "$HOME/taskflow-coolify-install/taskflow-coolify-master-poller.timer" /etc/systemd/system/taskflow-coolify-master-poller.timer
```

## Configure Coolify

1. Confirm the application source branch is exactly `Master`.
2. In Coolify, enable **Settings > Advanced > API Access** if it is off. Create an API token with `deploy` permission and clear `read` permission. Copy the token once.
3. From the app's Webhooks page, copy its resource UUID. Store only that UUID on the host:

   ```sh
   sudo install -o root -g root -m 0600 /dev/null /etc/taskflow-coolify-deploy.uuid
   read -r -p "Coolify resource UUID: " COOLIFY_UUID
   printf '%s\n' "$COOLIFY_UUID" | sudo tee /etc/taskflow-coolify-deploy.uuid >/dev/null
   unset COOLIFY_UUID
   ```

4. Store the deploy token without putting it in shell history or a process argument:

   ```sh
   sudo install -o root -g root -m 0600 /dev/null /etc/taskflow-coolify-deploy.token
   read -r -s -p "Coolify deploy token: " COOLIFY_TOKEN
   printf '\n'
   printf '%s' "$COOLIFY_TOKEN" | sudo tee /etc/taskflow-coolify-deploy.token >/dev/null
   unset COOLIFY_TOKEN
   ```

5. Reload systemd and run the service once. This stores the current `Master` SHA as the baseline without deploying it:

   ```sh
   sudo systemctl daemon-reload
   sudo systemd-analyze verify taskflow-coolify-master-poller.service taskflow-coolify-master-poller.timer
   sudo systemctl start taskflow-coolify-master-poller.service
   sudo journalctl -u taskflow-coolify-master-poller.service -n 10 --no-pager
   ```

6. Once the baseline run succeeds, enable the five-minute timer:

   ```sh
   sudo systemctl enable --now taskflow-coolify-master-poller.timer
   systemctl list-timers taskflow-coolify-master-poller.timer
   ```

If a GitHub repository webhook or another Coolify auto-deploy integration already targets this app, disable that trigger when switching to the timer to avoid duplicate deployments. This setup does not change existing webhook settings.

## Verify

Check the timer and its last run:

```sh
systemctl list-timers taskflow-coolify-master-poller.timer
sudo journalctl -u taskflow-coolify-master-poller.service --since today --no-pager
```

An unchanged branch produces no deployment request. After a new commit reaches `Master`, the next timer run sends one authenticated local `POST`. The stored SHA advances only after Coolify returns a successful 2xx response, so failed requests are retried. Coolify's deployment page confirms the build and health result.

The token stays in a root-only file and is passed to the service as a systemd credential. The API response body and token are not written to logs.
