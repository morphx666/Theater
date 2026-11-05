# Setting up Theater by hand

The setup scripts (`setup.sh` and `setup.ps1`) do all of this for you. Use this guide if you'd rather do each step yourself, or if a script doesn't work on your system.

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

Then edit `.env`. Set `AVR_HOST` to your receiver's IP address. The receiver shows it under **Setup → Network → Information**. The other settings are described in the [README](../README.md#settings).

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

## Updating

```bash
git pull
npm ci
npm run build
sudo systemctl restart denon-remote   # or stop and re-run npm start
```
