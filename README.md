# Theater: a web remote for the Denon AVR-X1700H

Theater is a fast web remote for the **Denon AVR-X1700H** receiver. You run it on a computer on your home network, such as a Raspberry Pi, a Mac, a Linux box or a Windows PC. Then you open it in any browser on your phone, tablet or desktop. It puts everyday control and the receiver's setup menus on one screen. It updates live, so it stays in sync with the front-panel knob, the IR remote and Denon's own app.

> **Tested only on the AVR-X1700H.** Other recent Denon and Marantz receivers use similar protocols, but they haven't been tested. On another model, some panels may be empty or not work.

<img width="1668" height="1142" alt="image" src="https://github.com/user-attachments/assets/750b4348-c965-4201-9507-dc78d2014093" />

## Features

| Page | What you get |
|---|---|
| **Home** | A volume dial, mute, power, input tiles, sound modes, Quick Select 1–4, what's playing on HEOS (with album art and transport controls), HEOS favorites, and a line showing the current audio format. You can pin any panel from another page here. |
| **Audio** | Audyssey (MultEQ, Dynamic EQ, Reference Level Offset, Dynamic Volume), Dialog Enhancer, subwoofer level, tone, DRC, Cinema EQ, Neural:X and more. Settings the receiver doesn't allow for the current sound mode are greyed out, with the reason. |
| **Video** | HDMI setup, video output, on-screen display and HDCP. |
| **Speakers** | A room map with tap-to-adjust channel levels, plus the stored calibration: distances, levels, crossovers, subwoofer mode and speaker presets. |
| **Zone 2** | Power, source, volume, mute and All Zone Stereo. |
| **Remote** | An on-screen menu pad, an FM/AM tuner with presets, quick settings (sleep, dimmer, ECO, auto-standby) and a live protocol console. |
| **Setup** | Rename, hide and assign inputs; set source levels, volume limits and the graphic EQ; change names, ECO and display options; set this app's own settings; view setup backups. |

### Make it yours

Every page has a **Customize** button. Tap it, then drag panels where you want them and make the important ones wider, up to three columns. Some panels have extra options in Customize mode too. You can lock the volume dial so a stray swipe doesn't change the volume, or give the tuner a green, amber or blue display. Your layout and options are saved on the server, so your phone, tablet and laptop all show the same setup.

## Requirements

- A Denon AVR-X1700H connected to your network by Ethernet or Wi-Fi.
- A computer that stays on, on the same network. A Raspberry Pi works well.
- **Node.js 22.18 or newer.** The server runs TypeScript directly, so no compile step is needed. Check your version with `node --version`.
- Git, to download the app.

## 1. Prepare the receiver

1. On the receiver, go to **Setup → Network → Network Control** and set it to **Always On**. Without this setting, the app can't reach the receiver while it's in standby, and it can't turn the receiver on.
2. Find the receiver's IP address under **Setup → Network → Information**, or in your router's list of devices.
3. In your router, give the receiver a **DHCP reservation** (also called a static lease), so its IP address never changes.

## 2. Install

```bash
git clone https://github.com/morphx666/Theater.git
cd Theater
npm ci
npm run build
```

## 3. Configure

Copy the example settings file and edit it:

```bash
cp .env.example .env
```

| Setting | Default | Meaning |
|---|---|---|
| `AVR_HOST` | `192.168.1.50` | Your receiver's IP address. **You must change this.** |
| `PORT` | `8787` | The port the app listens on. |
| `AVR_TELNET` | `on` | Set to `off` to use HTTP polling only. See [Troubleshooting](#troubleshooting). |
| `DATA_DIR` | `./data` | Where app settings, layouts and setup backups are stored. |

## 4. Run

```bash
npm start
```

Open `http://localhost:8787` on the same computer. From a phone or tablet, open `http://<computer-ip>:8787`. If it doesn't load from other devices, allow port 8787 through the computer's firewall.

To use it like an app on a phone, open it in the browser and choose **Share → Add to Home Screen** (iOS) or **Add to Home screen** (Android).

## Run it all the time on a Raspberry Pi (or any Linux machine)

1. Install Node.js 22.18 or newer. The version in the Raspberry Pi OS repositories is often too old. Use [NodeSource](https://github.com/nodesource/distributions) or [nvm](https://github.com/nvm-sh/nvm) instead.
2. Follow steps 2 and 3 above on the Pi.
3. Edit [deploy/denon-remote.service](deploy/denon-remote.service) to match your setup:
   - `User`: your Linux user name.
   - `WorkingDirectory`: the folder you cloned into.
   - `ExecStart`: the full path to `node`. Find it with `which node`. If you installed Node with nvm, the path won't be `/usr/bin/node`.
   - `Environment=AVR_HOST=…`: remove this line, or set it to your receiver's IP. Values in this file take precedence over `.env`.
4. Install and start the service:
   ```bash
   sudo cp deploy/denon-remote.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now denon-remote
   ```
5. To check that it's running, use `systemctl status denon-remote`. To follow the log, use `journalctl -u denon-remote -f`.

On a Mac or Windows PC, keep `npm start` running in a terminal. You can also use a process manager such as [pm2](https://pm2.keymetrics.io/) to keep it running.

## Updating

```bash
git pull
npm ci
npm run build
sudo systemctl restart denon-remote   # or stop and re-run npm start
```

Your settings and layouts in `data/` are kept.

## Safety

The app can change real receiver settings, so the server checks everything the browser sends before passing it on:

- **Volume cap.** Main and Zone 2 volume can't go above the app's cap (default −10 dB, set in *Setup → App & Info*) or the receiver's own Volume Limit, whichever is lower.
- **Command allowlist.** Only known commands are passed through. Factory reset, network reboot, panel lock and firmware commands are blocked.
- **Setup allowlist.** Only the setup pages this app uses can be read or written. Firmware update, reset, setup lock, IP settings and diagnostics can't be reached.
- **Backups.** Before every setup change, the previous value is saved to `data/backups/`. You can view the saved values under *Setup → App & Info*.

**There is no login.** Anyone who can reach the app's port can control your receiver. Keep it on your home network, and **don't forward the port to the internet.**

## Troubleshooting

The status line under the page title shows the connection state:

- **Live:** connected to the receiver. Everything works.
- **HTTP fallback:** the app can reach the receiver but can't open its telnet connection. The receiver accepts **only one telnet client at a time**, so another app or home-automation system (for example Home Assistant's Denon integration) may be holding it. Basic control still works, but updates are slower. To fix it, close the other client or switch that client to HTTP. If you'd rather keep the other client, set `AVR_TELNET=off` in `.env`.
- **Receiver unreachable:** check `AVR_HOST` and confirm that **Network Control** is set to **Always On**. Also check that the computer can reach the receiver: `ping <receiver-ip>`.
- **Server offline:** the browser can't reach the app. Check that `npm start` or the service is still running.
- **"Frontend not built"** in the browser: run `npm run build`.

## Development

```bash
npm run dev:server   # API server with auto-restart, on :8787
npm run dev:web      # Vite dev server with hot reload, on :5173 (proxies to the API server)
npm test
```

On macOS and Linux, `npm run dev` starts both servers at once. On Windows, run the two commands in separate terminals.

The project has two parts. The server (`server/`, Node and TypeScript) talks to the receiver over telnet, HTTP, its HTTPS setup API and HEOS. The frontend (`web/`, Svelte 5) is served from `dist/` after you build it. Protocol notes, including several undocumented commands, are in [docs/PROTOCOL.md](docs/PROTOCOL.md). The setup API's write format is in [docs/SETUP-API.md](docs/SETUP-API.md).

## Disclaimer

Every line of this app was written by AI: [Claude](https://claude.com/claude-code), Anthropic's AI model. [Xavier Flix](https://xavierflix.com) directed and supervised the work, and tested the app on a real AVR-X1700H.

This is an independent project. It is not affiliated with or endorsed by Denon, Marantz, Sound United or Masimo. **Use it at your own risk.**
