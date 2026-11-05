# Setting up Theater by hand

The setup scripts do all of the following for you. Use these steps if you'd rather do it yourself, or if a script doesn't work on your system.

## 1. Install Node.js

Theater needs **Node.js 22.18 or newer**. Check your version with `node --version`.

- On Linux, the version in your distribution's repositories is often too old. Use [NodeSource](https://github.com/nodesource/distributions) or [nvm](https://github.com/nvm-sh/nvm). To keep an older Node that other programs need, [install Node 22 alongside it](NODE-ALONGSIDE.md).
- On macOS and Windows, use the installer from [nodejs.org](https://nodejs.org).

## 2. Install and build

From the app's folder:

```bash
npm ci
npm run build
```

## 3. Configure

Copy the example settings file:

```bash
cp .env.example .env
```

Then edit `.env`:

| Setting | Default | Meaning |
|---|---|---|
| `AVR_HOST` | (none) | Your receiver's IP address. **Required.** The receiver shows it under **Setup → Network → Information**. |
| `PORT` | `8787` | The port the app listens on. |
| `AVR_TELNET` | `on` | Set to `off` to use HTTP polling only. See [Troubleshooting](../README.md#troubleshooting). |
| `DATA_DIR` | `data/` in the app's folder | Where app settings, layouts and setup backups are stored. Optional. If you set it, use an absolute path. |

After changing `.env`, restart Theater.

## 4. Run

```bash
npm start
```

Open `http://localhost:8787` on the same computer, or `http://<computer-ip>:8787` from a phone or tablet. If other devices can't connect, allow the port through the computer's firewall.

## 5. Start automatically (Linux with systemd)

1. Copy the service file into systemd's folder:
   ```bash
   sudo cp deploy/denon-remote.service /etc/systemd/system/
   ```
2. Edit **the copy** in `/etc/systemd/system/`, not the one in the repo, so `git pull` never conflicts with your changes:
   ```bash
   sudo nano /etc/systemd/system/denon-remote.service
   ```
   - `User`: your Linux user name.
   - `WorkingDirectory`: the folder you cloned into.
   - `ExecStart`: the full path to `node`. Find it with `which node`. If you installed Node with nvm, or [alongside an older Node](NODE-ALONGSIDE.md), the path won't be `/usr/bin/node`.

   Keep the receiver IP and port in `.env`. The service reads them from there.
3. Start the service, and have it start at boot:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now denon-remote
   ```
4. To check that it's running, use `systemctl status denon-remote`. To follow the log, use `journalctl -u denon-remote -f`.

On macOS or Windows, you can keep `npm start` running in a terminal, or use a process manager such as [pm2](https://pm2.keymetrics.io/).

## Updating a manual setup

```bash
git pull
npm ci
npm run build
sudo systemctl restart denon-remote   # or stop and re-run npm start
```

If you installed Node 22 [alongside an older Node](NODE-ALONGSIDE.md#updating-theater), use the update commands in that guide instead.
