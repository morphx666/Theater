# Install Node 22 alongside an older Node

Theater needs **Node.js 22.18 or newer**. If your machine already has an older Node that other programs depend on, you don't have to upgrade it. You can install Node 22 into its own folder and use it only for Theater.

> **On Linux, `./setup.sh` does all of this for you.** When it finds that your Node is too old, it offers to install Node 22 in `/opt/node22`. It then builds the app with it and points the service at it. Use this guide only if you'd rather do it by hand.

This guide is for Linux, including Raspberry Pi OS. The steps:

- leave your existing Node (usually `/usr/bin/node`) untouched;
- don't change your `PATH`, so every other program keeps using the old version;
- put Node 22 in `/opt/node22`, a fixed path the service can point to.

## 1. Check your architecture

```bash
uname -m
```

| Output | Meaning | Use in step 2 |
|---|---|---|
| `aarch64` | 64-bit OS (most current Raspberry Pi OS installs) | `arm64` |
| `armv7l` | 32-bit OS | `armv7l` |
| `x86_64` | A regular PC | `x64` |
| `armv6l` | Raspberry Pi Zero or Pi 1 | No official Node 22 builds exist. Use the community builds at [unofficial-builds.nodejs.org](https://unofficial-builds.nodejs.org/download/release/). |

## 2. Download Node 22 into `/opt/node22`

Set `ARCH` to the value from the table, then run:

```bash
ARCH=arm64
cd /tmp
FILE=$(curl -s https://nodejs.org/dist/latest-v22.x/ | grep -o "node-v22[0-9.]*-linux-$ARCH.tar.xz" | head -1)
curl -O "https://nodejs.org/dist/latest-v22.x/$FILE"
sudo mkdir -p /opt/node22
sudo tar -xJf "$FILE" -C /opt/node22 --strip-components=1
rm "$FILE"
```

Check both versions:

```bash
/opt/node22/bin/node --version   # v22.x — used by Theater
node --version                   # your existing version, unchanged
```

## 3. Install and build Theater with Node 22

Run these from Theater's folder:

```bash
PATH=/opt/node22/bin:$PATH npm ci
PATH=/opt/node22/bin:$PATH npm run build
```

The `PATH=…` prefix applies only to that one command. Afterwards, your shell is back to the old Node.

To start Theater by hand, outside the service:

```bash
/opt/node22/bin/node --env-file-if-exists=.env server/index.ts
```

## 4. Point the service at Node 22

Follow the service steps in [Setting up Theater by hand](MANUAL-SETUP.md#5-start-automatically-linux-with-systemd). When you edit the installed service file, set `ExecStart` to:

```ini
ExecStart=/opt/node22/bin/node --env-file-if-exists=.env server/index.ts
```

Then reload systemd and restart the service:

```bash
sudo systemctl daemon-reload
sudo systemctl restart denon-remote
```

## Updating Theater

Use the same `PATH=…` prefix:

```bash
git pull
PATH=/opt/node22/bin:$PATH npm ci
PATH=/opt/node22/bin:$PATH npm run build
sudo systemctl restart denon-remote
```

## Updating Node 22

Run step 2 again. It overwrites `/opt/node22` with the latest 22.x, and the path stays the same. Then restart the service.

## Removing it

```bash
sudo rm -rf /opt/node22
```

Your existing Node is not affected.
