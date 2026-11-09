# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local web remote for one specific receiver, a **Denon AVR-X1700H**. It has a Node server (TypeScript, run natively by Node ≥ 22.18 with no compile step) and a Svelte 5 SPA built by Vite. The server is the only thing that talks to the receiver. Browsers talk to the server over a WebSocket and REST. The app is deployed to a Raspberry Pi as a systemd service ([deploy/denon-remote.service](deploy/denon-remote.service)).

## Commands

```bash
npm install
npm run build          # vite build: web/ -> dist/ (the server serves dist/ statically)
npm start              # server on :8787 (reads .env if present)
npm run dev:server     # server with node --watch
npm run dev:web        # vite dev server on :5173, proxies /api and /ws to $API (default http://localhost:8787)
npm test               # node --test server/*.test.ts
node --test --test-name-pattern="guard enforces" server/parse.test.ts   # run a single test
```

`npm run dev` uses `cmd & vite; wait`. That only works in a POSIX shell. On Windows (npm runs scripts with cmd.exe), run `dev:server` and `dev:web` in two terminals instead.

There is no linter or type-check script. Tests cover only the pure server logic: the telnet parser, the guard, setup-write validation, and the speaker preset parsers, payloads and engine (against a fake receiver).

End users install with `./setup.sh` (Linux/macOS) or `setup.ps1` (Windows). These platform wrappers find or install Node 22, run `npm ci` and the build, and generate the autostart entry: a systemd unit, a launchd agent, or a Scheduled Task plus firewall rule. The cross-platform part is [scripts/setup.ts](scripts/setup.ts). It finds the receiver with SSDP and confirms it through `:8080/goform/Deviceinfo.xml`, picks a free port, asks about telnet and the data folder, and writes `.env`. Its `writeEnv` keeps comments, and a `null` value comments a setting out. Re-running a script is also how users update: each script first runs a fast-forward-only `git fetch` + `git merge` (skipped with `--no-update` / `-NoUpdate`, or when there's no `.git`, no upstream, or no network) and, if that pulled anything, re-launches the new copy of itself with `THEATER_UPDATED=1` so the updated setup logic runs. Keep `setup.ps1` plain ASCII and compatible with Windows PowerShell 5.1.

Configuration comes from `.env` (copy `.env.example`): `AVR_HOST`, `PORT`, `AVR_TELNET=off` (HTTP polling only), and `DATA_DIR`. Runtime data lives in `data/` and is gitignored: `settings.json`, `backups/`, `signal-codes.json`, and `speaker-presets.json`.

## Architecture

### Server (`server/`)

The receiver has four interfaces, and the server uses all of them ([docs/PROTOCOL.md](docs/PROTOCOL.md)):

| Port | Module | Role |
|---|---|---|
| telnet 23 | [telnet.ts](server/telnet.ts) | One persistent connection. The receiver pushes every state change. Commands go through a paced queue with an 80 ms gap; duplicate queries and stale absolute-volume sets are collapsed. While telnet is down, commands are sent over HTTP 8080. |
| HTTP 8080 | [http-status.ts](server/http-status.ts), [tuner-presets.ts](server/tuner-presets.ts), [audio-map.ts](server/audio-map.ts) | Status polling when telnet is unavailable (`AppCommand.xml`; the body must be newline-separated XML). Also handles tuner preset names and skips, and the input-channel / active-speaker grids for the Status panel's signal view (`AppCommand0300.xml`). |
| HTTPS 10443 | [setup.ts](server/setup.ts) | Guarded proxy to the receiver's setup API (`/ajax/<section>/get_config\|set_config?type=N`). Requests run one at a time. |
| HEOS 1255 | [heos.ts](server/heos.ts) | Now playing, album art, transport, and favorites. |

[index.ts](server/index.ts) wires these together:
- **One state object, many lines.** Every telnet line goes through `applyLine(state, line)` in [parse.ts](server/parse.ts). That function is pure and returns whether anything changed. The HTTP poller converts its results into telnet-style lines so the same parser handles both. A change calls `scheduleBroadcast()`, which waits 40 ms and then sends a full `snapshot()` (state, nowPlaying, conn, settings, cap) to every WebSocket client.
- **Re-query rules.** Many values exist only for the current power state, input, sound mode, or speaker preset. The `telnet.on('line')` handler re-sends query batches after the relevant transitions (`POWER_ON_QUERIES`, `CV?`, `SIGNAL_QUERIES`, `refreshInstalled`). If you add a new state field, check whether it also needs a re-query trigger there.
- **Settings** (`data/settings.json`) hold the volume cap, the volume step, `topVolume` (the top-bar volume control), `accent` (the app accent color; palettes in `app.css`, applied by [lib/accent.js](web/src/lib/accent.js)), per-page `layouts`, and `panelOptions`. They are written only through `POST /api/settings`, which validates every field. Settings are part of every snapshot, so all devices stay in sync.
- **Speaker presets** ([speaker-presets.ts](server/speaker-presets.ts), design in [docs/SPEAKER-PRESETS.md](docs/SPEAKER-PRESETS.md)): any number of app presets on top of the receiver's two slots. Each one uses one slot's Audyssey calibration and stores the rest of that slot's settings in groups (`GROUPS`), and applying it writes only what differs, muted. Setup writes made from the browser call `noteWrite`, which auto-saves into the active preset. If you add a per-preset setting, add it as a group.
- **Video signal codes** ([signal.ts](server/signal.ts)) are learned at runtime. When an unknown color-space or pixel-depth code appears, the server reads the slow Information page once (about 30 s; it blocks the setup server while it loads) and saves the mapping.

### Safety layer (do not weaken)

Everything the browser sends goes through a guard, and these limits are deliberate:
- [guard.ts](server/guard.ts): an **allowlist** of telnet command regexes, plus a `BLOCKED` list (`SYRST`, `NSRBT`, `SY…`, and others). It clamps or rejects volume above `effectiveCap`, which is the stricter of the app cap and the receiver's own Volume Limit, for both Main and Zone 2. It also rejects tuner commands unless the input is TUNER. A new UI command needs a matching `ALLOWED` pattern.
- [setup.ts](server/setup.ts): `READABLE` and `WRITABLE` (section/type) allowlists, the `NEVER` and `NEVER_READ` lists, a `ROOTS` table of allowed XML root elements per writable page, `FORBIDDEN_TAGS`, and a power-on volume cap. `safeExtra` drops every extra query param except the Graphic EQ channel view, because a mere **GET** of `general` type 11 with `opt1=2` **starts a firmware update**. Asking for an unsupported type hangs the receiver's web server for about 30 s. Before every write, the current value is backed up to `data/backups/`.
- To expose a new setup page, add it to `WRITABLE` and `ROOTS`, using the exact payload format from [docs/SETUP-API.md](docs/SETUP-API.md), and add a case to the "setup write validation" test.

### Frontend (`web/src/`)

- **Master volume** UI goes through [lib/volume.svelte.js](web/src/lib/volume.svelte.js) (cap, receiver maximum, throttled sends, the optimistic value while dragging), shared by the Volume panel's dial and the top-bar [VolumeMini](web/src/lib/VolumeMini.svelte). Both obey the Volume panel's "Lock dial" option and change the volume only by dragging the knob, never by tapping the track.
- [lib/avr.svelte.js](web/src/lib/avr.svelte.js) holds the single global `$state` store (`avr`). The WebSocket replaces it with each snapshot. `send(cmd)` sends guarded telnet commands, `api()` calls REST, and `toast()` shows a message. The UI is a thin view of server state: there is no optimistic local copy of receiver state.
- **Panels.** Every card is a component in `web/src/panels/`, wrapped in [lib/Panel.svelte](web/src/lib/Panel.svelte), which provides the title, the pin-to-Home button, and the `needsPower` standby placeholder. Panel also animates every change in the card's height or width ([lib/smoothSize.js](web/src/lib/smoothSize.js)); that's why the card's content sits in an inner `.sz` wrapper. Each panel is registered in [panels/index.js](web/src/panels/index.js) with `id`, `section` (the page it appears on), an optional Setup `tab`, `wide`, and `options` (per-panel settings shown in Customize mode). The pages are generic. [pages/Section.svelte](web/src/pages/Section.svelte) renders every panel of a section, [pages/Home.svelte](web/src/pages/Home.svelte) renders the user's pinned list, and [pages/Setup.svelte](web/src/pages/Setup.svelte) adds tabs. Pages and nav live in [App.svelte](web/src/App.svelte); routing uses the URL hash (`#sound`, or `#setup/<tab>` to open a Setup tab). On Home, each panel's title has a link to the page it lives on (the `panelLink` context set by Home).
- **Layout.** [lib/PanelBoard.svelte](web/src/lib/PanelBoard.svelte) implements Customize mode: drag, arrow keys, and 1–3 column spans. [lib/lanes.js](web/src/lib/lanes.js) gives a masonry layout, using native `display: grid-lanes` when the browser supports it and a JS fallback otherwise. [lib/layout.svelte.js](web/src/lib/layout.svelte.js) saves `{order, lanes, spans}` per page to the server, and keeps a pending local copy while a save is in flight so stale broadcasts don't make panels jump. Open/closed sections are stored per device in localStorage ([lib/remember.js](web/src/lib/remember.js)).
- **Panels backed by the setup API** use `useSetup(section, type)` from [lib/useSetup.svelte.js](web/src/lib/useSetup.svelte.js). It returns a reactive `{doc, loading, error, saving, reload, write(xml)}`, and `doc` is a parsed XML DOM element. Build payloads with `el()` and `esc()` from [lib/setup.js](web/src/lib/setup.js). The `display` attribute means 1 = hidden, 2 = greyed out, 3 = editable.
- [lib/availability.svelte.js](web/src/lib/availability.svelte.js) reads setup pages audio/9 and audio/4 to decide which Audyssey and surround controls to grey out for the current mode or signal.

### Value encodings worth knowing

- Volume: `MV375` means 37.5 − 80 = −42.5 dB. Three digits mean a half step, and `99` means minimum. Use `volToDb` and `dbToVol` (server) or `vol2` (client).
- Channel and tone levels: 50 means 0 dB (see `level2` and `levelToDb`).
- Some queries need a space before the `?` (`PSDYNEQ ?`, `OPTPN ?`). Check [docs/PROTOCOL.md](docs/PROTOCOL.md), which also covers the undocumented `SS…` status queries, before adding commands.

### Owner's manual

The receiver's owner's manual, **North American edition** (edition code `3520 10812 00AD`, ©2021, 284 pages), is at `docs/AVRX1700H_NA_EN.pdf`. It's gitignored because it's Denon's copyrighted document, so a fresh clone won't have it; download it from https://manuals.denon.com/AVRX1700H/NA/EN/. Use it as the authority for when a setting is available, what it does, and its range; for example, LFE works only with Dolby Digital or DTS sources. Get searchable text with `pdftotext -layout docs/AVRX1700H_NA_EN.pdf out.txt`. Page numbers are in the footer lines ("Rear panel  NNN"). Don't use the international edition (AVR-X1700H / DAB, 304 pages): it omits **Pure Direct**, which this US unit has. In the NA manual, most restrictions for "Direct" also apply to "Pure Direct". The receiver's own `display` flags (see availability.svelte.js) still decide whether a control is enabled; use the manual to choose the reason text.
