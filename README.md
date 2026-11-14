# Theater: a web remote for the Denon AVR-X1700H

Theater is a fast web remote for the **Denon AVR-X1700H** receiver. You run it on a computer on your home network, such as a Raspberry Pi, a Mac, a Linux box or a Windows PC. Then you open it in any browser on your phone, tablet or desktop. It puts everyday control and the receiver's setup menus on one screen. It updates live, so it stays in sync with the front-panel knob, the IR remote and Denon's own app.

> **Tested only on the AVR-X1700H.** Other recent Denon and Marantz receivers use similar protocols, but they haven't been tested. On another model, some panels may be empty or not work.

<img width="1668" height="1133" alt="image" src="https://github.com/user-attachments/assets/62ff702c-288d-4d1c-a0b3-dcb24186176e" />

## Features

| Page | What you get |
|---|---|
| **Home** | A volume dial, mute, power, input tiles, sound modes, Quick Select 1–4, what's playing on HEOS (with album art and transport controls), HEOS favorites, and a line showing the current audio format. You can pin any panel from another page here. |
| **Audio** | Audyssey (MultEQ, Dynamic EQ, Reference Level Offset, Dynamic Volume), Dialog Enhancer, subwoofer level, tone, DRC, Cinema EQ, Neural:X and more. Settings the receiver doesn't allow for the current sound mode are greyed out, with the reason. |
| **Video** | HDMI setup, video output, on-screen display and HDCP. |
| **Speakers** | A room map with tap-to-adjust channel levels, plus the stored calibration: distances, levels, crossovers and subwoofer mode. Unlimited speaker presets on top of the receiver's two. |
| **Zone 2** | Power, source, volume, mute and All Zone Stereo. |
| **Remote** | An on-screen menu pad, an FM/AM tuner with presets, quick settings (sleep, dimmer, ECO, auto-standby) and a live protocol console. |
| **Setup** | Rename, hide and assign inputs; set source levels, volume limits and the graphic EQ; change names, ECO and display options; set this app's own settings; view setup backups. |

### Make it yours

Every page has a **Customize** button. Tap it, then drag panels where you want them and make the important ones wider, up to three columns. Some panels have extra options in Customize mode too. You can lock the volume dial so a stray swipe doesn't change the volume, or give the tuner a green, amber or blue display. Your layout and options are saved on the server, so your phone, tablet and laptop all show the same setup.

### Sound modes

The Sound mode panel groups the modes as Surround, Stereo and Direct. The arrow on each group lists the modes the receiver offers for the signal playing. In the Surround list, the mode that plays the source as it is comes first, then the upmixed versions (+ Neural:X, + DSur), then the effects.

The receiver offers fewer modes than its manual lists, so the app learns from it which ones it really has. Most modes switch with one command. A few have no command of their own: the receiver only reaches them through the remote's Movie, Music and Game buttons, which step through the modes one at a time. For those, the app presses the button that gets there in the fewest steps and remembers where each button left off, so the next time is usually a single step. You may hear the audio drop a few times while it steps. With DTS-HD, for example, DTS-HD MSTR and DTS-HD + DSur sometimes need this; other modes never do.

## Requirements

- A Denon AVR-X1700H connected to your network by Ethernet or Wi-Fi.
- A computer that stays on, on the same network: a Raspberry Pi, a Mac, a Linux box or a Windows PC.
- [Git](https://git-scm.com/downloads), to download the app.
- Node.js 22.18 or newer. If you don't have it, the setup script can install it for you.

## 1. Prepare the receiver

1. On the receiver, go to **Setup → Network → Network Control** and set it to **Always On**. Without this setting, the app can't reach the receiver while it's in standby, and it can't turn the receiver on.
2. In your router, give the receiver a **DHCP reservation** (also called a static lease), so its IP address never changes.

## 2. Install

If you'd rather do each step yourself, see [Setting up Theater by hand](docs/MANUAL-SETUP.md).

```bash
git clone https://github.com/morphx666/Theater.git
cd Theater
```

Then run the setup script.

**Linux, Raspberry Pi or macOS:**

```bash
./setup.sh
```

**Windows** (in PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

The script works out everything it can and asks only about the rest:

- **Node.js.** It uses your Node if it's new enough. If it isn't, the script offers to install Node 22:
  - on Linux, in `/opt/node22`, next to your current Node, which stays as it is ([details](docs/NODE-ALONGSIDE.md))
  - on macOS, with Homebrew
  - on Windows, with winget
- **Install and build.** It installs the app's packages and builds it.
- **Your receiver.** It finds the receiver on your network by itself. If it can't, or if you have more than one, it asks.
- **Port.** It uses port 8787, or asks for another if something else is already using it.
- **Telnet and data folder.** It asks whether Theater should keep a telnet connection to the receiver (answer no if another app such as Home Assistant needs it), and where to keep settings and backups. Press Enter to accept the defaults.
- **Start automatically.** It offers to start Theater automatically: as a service when a Linux machine boots, when you log in on macOS, or when you sign in on Windows. On Windows, it can also add a firewall rule so phones and tablets on your network can connect.

When it's done, it shows the address to open. To change any of your answers later, run the script again.

## 3. Open it

Open the address the script showed, for example `http://192.168.1.2:8787`, in a browser on your phone, tablet or computer.

To use it like an app on a phone, choose **Share → Add to Home Screen** (iOS) or **Add to Home screen** (Android).

## Updating

Run the setup script again:

```bash
./setup.sh      # on Windows: powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

The setup script downloads the latest version with git, keeps your settings, rebuilds the app and restarts Theater. If the update would overwrite changes you made to the app's files, it skips the update and installs the version you have. To reinstall without updating, add `--no-update` (on Windows, `-NoUpdate`). Your layouts and options in `data/` are kept too. If you set Theater up by hand, see [Updating a manual setup](docs/MANUAL-SETUP.md#updating-a-manual-setup).

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
- **HTTP fallback:** the app can reach the receiver but can't open its telnet connection. The receiver accepts **only one telnet client at a time**, so another app or home-automation system (for example Home Assistant's Denon integration) may be holding it. Basic control still works, but updates are slower. To fix it, close the other client or switch that client to HTTP. If you'd rather keep the other client, run the setup script again and answer no to the telnet question. In a manual setup, set `AVR_TELNET=off` in `.env` instead.
- **Receiver unreachable:** check `AVR_HOST` and confirm that **Network Control** is set to **Always On**. Also check that the computer can reach the receiver: `ping <receiver-ip>`.
- **Server offline:** the browser can't reach the app. Check that Theater is running:
  - Linux: `systemctl status denon-remote`, and the log with `journalctl -u denon-remote -f`.
  - macOS: the log is in `~/Library/Logs/Theater.log`.
  - Windows: the **Theater** task in Task Scheduler.

  To see any error messages directly, stop Theater and run `npm start` in a terminal.
- **The page loads on the computer but not on your phone:** a firewall is blocking the port. On Windows, run the setup script again and allow the firewall rule. On Linux with `ufw`, the setup script shows the command to run.
- **"Frontend not built"** in the browser: run the setup script again.

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

## License

[MIT](LICENSE) © 2026 [Xavier Flix](https://xavierflix.com)
