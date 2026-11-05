# Theater — a nicer remote for the Denon AVR-X1700H

A fast, good-looking web remote for the Denon AVR-X1700H. It works on phones, tablets and desktops, and you can
install it to a phone's home screen as an app. It replaces Denon's mobile app and the receiver's built-in setup page,
with everything on one screen and live updates.

## Features

| Page | What you get |
|---|---|
| **Home** | Big volume dial (drag, scroll, arrow keys, hold +/−), mute, power, input tiles with your names, sound modes, Quick Select 1–4 (long-press to save), what's playing on HEOS with album art and play/pause/skip, HEOS favorites, and a live line showing the format (e.g. *Dolby Audio – Dolby Surround · PCM · 48 kHz · 5.1.2*). |
| **Sound** | Audyssey MultEQ, Dynamic EQ, Reference Level Offset, Dynamic Volume, Dialog Enhancer, subwoofer level, LFE, Cinema EQ, tone controls, DRC, Restorer, Loudness Management, Neural:X, Center Spread, lip-sync delay. Only settings the current input and mode support are shown. |
| **Speakers** | Room map of your speakers with tap-to-adjust channel trims, and the stored calibration: distances, levels, crossovers, subwoofer mode, LFE low-pass filter, speaker sizes, speaker presets. |
| **Zone 2** | Power, source, volume, mute, All Zone Stereo (party mode). |
| **Remote** | On-screen menu D-pad, tuner, sleep timer, dimmer, ECO, auto-standby, Bluetooth transmitter, and a **live protocol console**. |
| **Setup** | Rename, hide and assign inputs; per-source level; volume limit, power-on volume, mute level (Main + Zone 2); 9-band graphic EQ; zone and Quick Select names; ECO and display options; app settings; backups. |

## Quick start (Mac)

```bash
npm install
npm run build
npm start            # → http://localhost:8787  (also reachable from your phone at http://<this-mac-ip>:8787)
```

Development with hot reload: `npm run dev`, then open the Vite URL it prints (port 5173).
Tests: `npm test`.

Configuration lives in `.env`. Copy `.env.example` to create it. The main setting is `AVR_HOST`, the receiver's IP.
Give the receiver a DHCP reservation in your router so its IP never changes.

## Raspberry Pi

1. Install Node.js **22.18 or newer**. The server runs TypeScript natively, so there's no build step on the Pi.
2. On the Pi, copy this folder to `/home/pi/denon-remote`. Then run `npm ci && npm run build` (or copy over a `dist/` you built on the Mac).
3. Install the service:
   ```bash
   sudo cp deploy/denon-remote.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now denon-remote
   ```
4. Open `http://<pi-ip>:8787`. On a phone, use **Share → Add to Home Screen**.

On the receiver, set **Setup → Network → Network Control → Always On**. Otherwise the app can't reach it or turn it on
from standby.

## How it works

```
 phone / browser  ──WebSocket + REST──▶  Node server (this app)  ──▶  AVR-X1700H
                                          ├─ telnet :23     live control + push status (one persistent connection)
                                          ├─ HTTP   :8080   fallback when telnet is unavailable
                                          ├─ HEOS   :1255   now playing, album art, transport, favorites
                                          └─ HTTPS  :10443  the receiver's setup API (guarded proxy)
```

The browser can't talk to the receiver directly: it uses a self-signed certificate, raw TCP, and no CORS. The server
keeps one telnet connection open and pushes every change to all open browsers, so the phone app, the front-panel
knob and this UI all stay in sync.

Protocol details, including several **undocumented** commands found on this unit, are in [docs/PROTOCOL.md](docs/PROTOCOL.md).
The full write format of the receiver's setup API is in [docs/SETUP-API.md](docs/SETUP-API.md).

## Safety

Everything the browser sends passes through a server-side guard:

- **Volume cap.** Master and Zone 2 volume can't exceed the app cap (default −10 dB, set in *Setup → App & Info*) or
  the receiver's own Volume Limit, whichever is lower. The server also refuses a power-on volume above the cap.
- **Command allowlist.** Only known command families are allowed. Factory reset (`SYRST`), network reboot, panel lock
  and all `SY…` system commands are blocked.
- **Setup API.** Only the setup pages listed above can be read or written. Firmware update, reset, setup lock, network/IP,
  HEOS account and HDMI diagnostics are not reachable. Note: on this firmware a mere *read* of
  `general/get_config?type=11&opt1=2` **starts a firmware update**, so extra query parameters are stripped.
  "Set defaults" payloads are rejected.
- **Backups.** Before every setup write, the server saves the previous value to `data/backups/`.
- **Pacing.** Commands are spaced 80 ms apart, as the receiver requires.
