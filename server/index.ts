// Denon Remote server: bridges the browser (WebSocket + REST) to the receiver (telnet / HTTP / HEOS / setup API).

import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { AvrTelnet } from './telnet.ts';
import { Heos, emptyNowPlaying } from './heos.ts';
import { SetupApi, HttpError, READABLE, WRITABLE } from './setup.ts';
import { applyLine, emptyState, REFRESH_QUERIES, POWER_ON_QUERIES, SIGNAL_QUERIES, installedFromLevelsXml, LEVEL_INDEX_TO_CODE } from './parse.ts';
import { decodeVideo, learnFromInformation, loadCodes, saveCodes } from './signal.ts';
import { guard, effectiveCap, quickRecallCorrection } from './guard.ts';
import { pollAsTelnetLines } from './http-status.ts';
import { fetchAudioMap, type AudioMap } from './audio-map.ts';
import { TunerPresets, PRESET_COUNT, pad, validPreset, validName } from './tuner-presets.ts';
import { SpeakerPresets, PresetError } from './speaker-presets.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.AVR_HOST ?? '192.168.1.50';
const PORT = Number(process.env.PORT ?? 8787);
const DATA = process.env.DATA_DIR ?? path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist');
const USE_TELNET = process.env.AVR_TELNET !== 'off';

// ---------- app settings (persisted) ----------
type Layout = { order?: string[]; lanes?: Record<string, number>; spans?: Record<string, number> };
type Settings = {
  volumeCapDb: number; volumeStep: number;
  topVolume: boolean; // compact volume control in the top bar
  accent: string; // app accent color (one of ACCENTS)
  layouts?: Record<string, Layout>; // per page: panel order, start column, width in columns
  panelOptions?: Record<string, Record<string, boolean | string>>; // per panel, e.g. { volume: { locked: true }, tuner: { dialColor: 'amber' } }
  home?: string[]; homeLanes?: Record<string, number>; homeSpans?: Record<string, number>; // legacy (migrated)
};
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const ACCENTS = ['amber', 'rose', 'violet', 'blue', 'teal', 'green']; // palettes in web/src/app.css
let settings: Settings = { volumeCapDb: -10, volumeStep: 0.5, topVolume: true, accent: 'blue' };
try { settings = { ...settings, ...JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8')) }; } catch {}
// Migrate the older Home-only layout format into layouts.home.
if (settings.home || settings.homeLanes || settings.homeSpans) {
  settings.layouts = { ...(settings.layouts ?? {}), home: { order: settings.home, lanes: settings.homeLanes ?? {}, spans: settings.homeSpans ?? {} } };
  if (!settings.home) delete settings.layouts.home!.order;
  delete settings.home; delete settings.homeLanes; delete settings.homeSpans;
  await saveSettings().catch(() => {});
}
const ID = /^[a-z0-9-]{1,40}$/;
const intMap = (m: unknown, lo: number, hi: number) =>
  Object.fromEntries(Object.entries(m && typeof m === 'object' ? m : {}).filter(([k, v]) => ID.test(k) && Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi)) as Record<string, number>;
async function saveSettings() {
  await fs.mkdir(DATA, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ---------- receiver connections ----------
const state = emptyState();
const telnet = new AvrTelnet(HOST);
const heos = new Heos(HOST);
const setup = new SetupApi(HOST, DATA);
const conn = { telnet: false, heos: false, http: false };
let progress = { position: null as number | null, duration: null as number | null };
let lastLog: string[] = []; // recent raw telnet lines, for the debug console
let prevPowerLine: string | null = null;
const lastModeLine: Record<string, string> = {};
let cvTimer: NodeJS.Timeout | undefined;

// Installed speakers (independent of sound mode) come from the setup API's Levels page.
async function refreshInstalled() {
  try {
    const list = installedFromLevelsXml(await setup.get('speakers', 5));
    if (list.length && JSON.stringify(list) !== JSON.stringify(state.installed)) { state.installed = list; scheduleBroadcast(); }
  } catch (e) {
    log(`could not read installed speakers: ${(e as Error).message}`);
  }
}

// ---------- tuner presets (names / skip live on the AppCommand API) ----------
const tunerPresets = new TunerPresets(HOST);
async function refreshSkipped() {
  try {
    const list = await tunerPresets.skipped();
    if (JSON.stringify(list) !== JSON.stringify(state.tuner.skipped)) { state.tuner.skipped = list; scheduleBroadcast(); }
  } catch (e) {
    log(`could not read tuner preset skips: ${(e as Error).message}`);
  }
}
/** After a change: give the receiver a moment, then re-read names (telnet) and skips. */
function rereadPresets() {
  setTimeout(() => { telnet.send('OPTPN ?'); refreshSkipped(); }, 1200);
}
async function presetAction(b: any, who: string) {
  if (state.source !== 'TUNER') throw new HttpError(409, 'Switch the input to Tuner first');
  const n = Number(b?.n);
  const one = () => { if (!validPreset(n)) throw new HttpError(400, 'preset must be 1-56'); return n; };
  switch (b?.action) {
    case 'rename': {
      if (!validName(b.name)) throw new HttpError(400, 'name: up to 8 plain characters');
      await tunerPresets.rename(one(), b.name);
      log(`preset ${pad(n)} renamed to "${b.name.trim()}" (from ${who})`);
      break;
    }
    case 'delete': // the receiver can't empty a slot: hide it (skip) and clear its name
      await tunerPresets.setSkip(one(), true);
      if (state.tuner.presets[pad(n)]?.name) await tunerPresets.rename(n, '');
      log(`preset ${pad(n)} deleted (skipped) (from ${who})`);
      break;
    case 'restore':
      await tunerPresets.setSkip(one(), false);
      log(`preset ${pad(n)} restored (from ${who})`);
      break;
    case 'deleteAll':
    case 'restoreAll': {
      const del = b.action === 'deleteAll';
      if (del) { // keep a copy of what was there
        await fs.mkdir(path.join(DATA, 'backups'), { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        await fs.writeFile(path.join(DATA, 'backups', `${ts}_tuner_presets.json`), JSON.stringify(state.tuner, null, 2));
      }
      for (let i = 1; i <= PRESET_COUNT; i++) {
        if (state.tuner.skipped.includes(pad(i)) === del) continue; // already in that state
        await tunerPresets.setSkip(i, del);
        if (del && state.tuner.presets[pad(i)]?.name) await tunerPresets.rename(i, '');
      }
      log(`all presets ${del ? 'deleted (skipped)' : 'restored'} (from ${who})`);
      break;
    }
    default:
      throw new HttpError(400, 'unknown action');
  }
  rereadPresets();
}

// ---------- speaker presets (as many as the user wants, on top of the receiver's two slots) ----------
const speakerPresets = new SpeakerPresets(DATA, {
  io: {
    get: (section, type, extra) => setup.get(section, type, extra),
    set: async (section, type, xml) => {
      log(`setup write ${section}/${type} (speaker preset): ${xml.slice(0, 200)}`);
      await setup.set(section, type, xml, effectiveCap(settings.volumeCapDb, state));
    },
    cmd: (c) => { const r = sendCommand(c, 'speaker preset'); if (!r.ok) throw new Error(r.reason); },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  },
  zoneOn: () => state.zoneMain === true,
  muted: () => state.mute,
  log: (m) => log(m),
  changed: () => scheduleBroadcast(),
  applied: () => { setTimeout(() => telnet.sendMany(REFRESH_QUERIES), 800); setTimeout(refreshInstalled, 1500); },
  levelCodes: (lv) => Object.keys(lv).map((i) => LEVEL_INDEX_TO_CODE[Number(i)]).filter(Boolean),
});
await speakerPresets.load();
speakerPresets.slotChanged(); // first sync shortly after start

// ---------- HDMI signal info ----------
const signalCodes = await loadCodes(DATA);
let signalTimer: NodeJS.Timeout | undefined;
function querySignal(delay = 1200) {
  clearTimeout(signalTimer);
  signalTimer = setTimeout(() => { if (conn.telnet) telnet.sendMany(SIGNAL_QUERIES); }, delay);
}
// Codes for color space / pixel depth we haven't seen yet: read the (slow) Information page once to learn them.
let lastLearn = 0;
let learning = false;
let learnTimer: NodeJS.Timeout | undefined;
function maybeLearnCodes() {
  if (learning || Date.now() - lastLearn < 10 * 60_000 || !state.zoneMain) return;
  if (!decodeVideo(state.video, signalCodes)?.unknown) return;
  clearTimeout(learnTimer);
  learnTimer = setTimeout(async () => {
    if (!decodeVideo(state.video, signalCodes)?.unknown) return;
    learning = true; lastLearn = Date.now();
    const before = JSON.stringify([state.video.cos, state.video.pix]);
    log(`unknown video signal codes (color ${state.video.cos}, depth ${state.video.pix}); reading the Information page (~30 s)`);
    try {
      const xml = await setup.information();
      // The signal may have changed during the 30 s wait; only learn if the codes are the same as when we asked.
      if (JSON.stringify([state.video.cos, state.video.pix]) === before && learnFromInformation(xml, state.video, signalCodes)) {
        await saveCodes(DATA, signalCodes);
        log(`learned video signal codes: ${JSON.stringify(signalCodes)}`);
        scheduleBroadcast();
      }
    } catch (e) {
      log(`could not read the Information page: ${(e as Error).message}`);
    } finally {
      learning = false;
    }
  }, 4000); // let the signal settle first
}
// ---------- audio channel map (input signal channels / active speakers) ----------
let audioMap: AudioMap = null;
let mapTimer: NodeJS.Timeout | undefined;
let mapBusy = false;
function queryAudioMap(delay = 800) {
  clearTimeout(mapTimer);
  mapTimer = setTimeout(async () => {
    if (state.zoneMain !== true) {
      if (audioMap) { audioMap = null; scheduleBroadcast(); }
      return;
    }
    if (mapBusy) return queryAudioMap(500);
    mapBusy = true;
    try {
      const m = await fetchAudioMap(HOST);
      if (JSON.stringify(m) !== JSON.stringify(audioMap)) { audioMap = m; scheduleBroadcast(); }
    } catch { /* keep the last map; the next trigger or poll retries */ } finally {
      mapBusy = false;
    }
  }, delay);
}
// Light polling while someone is looking (the receiver doesn't announce every video change).
setInterval(() => { if (state.zoneMain && wss.clients.size) queryAudioMap(0); }, 10_000);
setInterval(() => { if (conn.telnet && state.zoneMain && wss.clients.size) telnet.sendMany(SIGNAL_QUERIES); }, 10_000);

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

telnet.on('status', (up: boolean) => {
  conn.telnet = up;
  log(`telnet ${up ? 'connected' : 'disconnected'}`);
  if (up) { telnet.sendMany(REFRESH_QUERIES); setTimeout(refreshInstalled, 2000); setTimeout(refreshSkipped, 3000); }
  scheduleBroadcast();
});
telnet.on('warn', (m) => log(m));
telnet.on('line', (line: string) => {
  lastLog.push(line);
  if (lastLog.length > 200) lastLog = lastLog.slice(-200);
  const prevPower = state.zoneMain;
  const prevSource = state.source;
  if (/^(PW|ZM|Z2)(ON|OFF|STANDBY)$/.test(line) && line !== (line.startsWith('PW') ? (prevPowerLine ?? '') : '')) {
    if (line.startsWith('PW')) prevPowerLine = line;
    log(`receiver reported: ${line}`);
  }
  const changed = applyLine(state, line);
  if (changed) scheduleBroadcast();
  capAfterQuickRecall(line);
  // Audyssey settings are part of the active speaker preset (auto-saved like the setup pages).
  if (changed && /^PS(MULTEQ|DYNEQ|REFLEV|DYNVOL)/.test(line)) speakerPresets.noteWrite('audio', 9);
  // Parameters depend on power state and input; re-read them after transitions.
  if ((line === 'ZMON' && prevPower === false) || (line.startsWith('SI') && prevSource && line.slice(2) !== prevSource)) {
    setTimeout(() => telnet.sendMany(POWER_ON_QUERIES), 1500);
    querySignal(4000); // the HDMI handshake takes a few seconds
    if (line === 'ZMON') speakerPresets.slotChanged(); // read in changes made while the app couldn't see them
  }
  // New content often means a new video format too (e.g. a movie switching to 4K24 HDR).
  const sigKey = line.startsWith('SYSDA') ? 'sig:SYSDA' : line.startsWith('SSINFAISSIG') ? 'sig:AIS' : null;
  if (sigKey && line !== lastModeLine[sigKey]) {
    lastModeLine[sigKey] = line;
    querySignal();
  }
  if (/^(SYSDV|SSINFSIG)/.test(line)) maybeLearnCodes();
  // Switching speaker preset changes levels, speakers and Audyssey: re-read them.
  if (/^SPPR [12]$/.test(line) && line !== lastModeLine.SPPR) {
    const first = lastModeLine.SPPR === undefined;
    lastModeLine.SPPR = line;
    speakerPresets.slotChanged(); // follow switches made on the receiver or its remote
    if (!first) {
      setTimeout(() => telnet.sendMany(['SSLEV ?', 'CV?', ...POWER_ON_QUERIES]), 2500);
      setTimeout(refreshInstalled, 5000);
    }
  }
  // Active channels depend on the sound mode and the incoming format: re-read them when either changes.
  if ((/^MS(?!QUICK)/.test(line) || line.startsWith('SYSDA')) && line !== lastModeLine[line.slice(0, 2)]) {
    lastModeLine[line.slice(0, 2)] = line;
    clearTimeout(cvTimer);
    cvTimer = setTimeout(() => telnet.send('CV?'), 700);
  }
  // Input channels and active speakers follow the power, input, format, sound mode and speaker setup.
  if (/^(ZM(ON|OFF)|SI|MS(?!QUICK)|SYSDA|SSINFAIS(FOR|SIG)|SPPR|OPINF|PSSWR|PSNEURAL)/.test(line)) queryAudioMap();
  broadcastRaw(line);
});

heos.on('status', (up: boolean) => { conn.heos = up; log(`heos ${up ? 'connected' : 'disconnected'}`); scheduleBroadcast(); });
heos.on('nowPlaying', () => scheduleBroadcast());
heos.on('progress', (p) => { progress = p; broadcast({ type: 'progress', ...p }); });
heos.on('warn', (m) => log(m));

// HTTP polling fallback whenever telnet is down.
setInterval(async () => {
  if (conn.telnet) return;
  try {
    const lines = await pollAsTelnetLines(HOST);
    conn.http = true;
    let changed = false;
    for (const l of lines) { changed = applyLine(state, l) || changed; capAfterQuickRecall(l); }
    if (changed) scheduleBroadcast();
  } catch {
    if (conn.http) { conn.http = false; scheduleBroadcast(); }
  }
}, 3000);

// ---------- websocket ----------
const server = http.createServer(handle);
const wss = new WebSocketServer({ server, path: '/ws' });

function snapshot() {
  return {
    type: 'state',
    state: { ...state, videoInfo: decodeVideo(state.video, signalCodes), audioMap },
    nowPlaying: heos.now ?? emptyNowPlaying(),
    progress,
    conn,
    settings,
    speakerPresets: speakerPresets.summary(),
    cap: effectiveCap(settings.volumeCapDb, state),
  };
}

let pending: NodeJS.Timeout | null = null;
function scheduleBroadcast() {
  if (pending) return;
  pending = setTimeout(() => { pending = null; broadcast(snapshot()); }, 40);
}
function broadcast(msg: object) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(s);
}
const rawSubscribers = new Set<WebSocket>();
function broadcastRaw(line: string) {
  if (!rawSubscribers.size) return;
  const s = JSON.stringify({ type: 'raw', line });
  for (const c of rawSubscribers) if (c.readyState === WebSocket.OPEN) c.send(s);
}

// Quick Select recall can raise the volume past the app's cap (see quickRecallCorrection in guard.ts).
// For a few seconds after the app recalls one, any reported volume above the cap is brought back down.
let quickRecallUntil = 0;
function capAfterQuickRecall(line: string) {
  if (Date.now() > quickRecallUntil) return;
  const cap = effectiveCap(settings.volumeCapDb, state);
  const fix = quickRecallCorrection(line, cap);
  if (fix) { log(`Quick Select set ${line}, above the ${cap} dB cap; sending ${fix}`); telnet.send(fix); }
}

function sendCommand(raw: string, source = ''): { ok: boolean; cmd?: string; reason?: string } {
  const r = guard(raw, state, effectiveCap(settings.volumeCapDb, state));
  if (!r.ok) { log(`rejected: ${raw} (${r.reason})`); return r; }
  if (!r.cmd.endsWith('?')) log(`sent: ${r.cmd}${source ? ` (from ${source})` : ''}`); // audit trail (queries omitted)
  if (/^MSQUICK[1-4]$/.test(r.cmd)) quickRecallUntil = Date.now() + 6000;
  telnet.send(r.cmd);
  if (r.cmd.startsWith('TPANMEM')) { // saving into a deleted (skipped) slot brings it back
    const n = Number(r.cmd.slice(7));
    if (state.tuner.skipped.includes(pad(n))) tunerPresets.setSkip(n, false).catch((e) => log(`could not unskip preset: ${e.message}`));
    rereadPresets();
  }
  return r;
}

const clientNames = new WeakMap<WebSocket, string>();
const clientName = (ws: WebSocket) => clientNames.get(ws) ?? 'ws';
wss.on('connection', (ws, req) => {
  clientNames.set(ws, String(req.socket.remoteAddress ?? 'ws').replace(/^::ffff:/, ''));
  ws.send(JSON.stringify(snapshot()));
  if (!audioMap && state.zoneMain) queryAudioMap(0); // nobody was watching, so it may never have been read
  ws.on('close', () => rawSubscribers.delete(ws));
  ws.on('message', async (data) => {
    let msg: any;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (msg.type === 'cmd') {
      const cmds: string[] = Array.isArray(msg.cmd) ? msg.cmd : [msg.cmd];
      for (const c of cmds) {
        const r = sendCommand(c, clientName(ws));
        if (!r.ok) ws.send(JSON.stringify({ type: 'error', message: r.reason }));
      }
    } else if (msg.type === 'heos') {
      try { await heos.transport(msg.action); } catch (e) { ws.send(JSON.stringify({ type: 'error', message: (e as Error).message })); }
    } else if (msg.type === 'raw-subscribe') {
      if (msg.on) {
        rawSubscribers.add(ws);
        for (const line of lastLog) ws.send(JSON.stringify({ type: 'raw', line }));
      } else rawSubscribers.delete(ws);
    }
  });
});

// ---------- REST ----------
async function readBody(req: http.IncomingMessage): Promise<any> {
  let body = '';
  for await (const c of req) { body += c; if (body.length > 100_000) throw new HttpError(413, 'too large'); }
  if (!body) return {};
  try { return JSON.parse(body); } catch { throw new HttpError(400, 'invalid JSON'); }
}

function json(res: http.ServerResponse, status: number, obj: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/state' && req.method === 'GET') return json(res, 200, snapshot());
    if (p === '/api/cmd' && req.method === 'POST') {
      const { cmd } = await readBody(req);
      const r = sendCommand(cmd, req.socket.remoteAddress ?? 'http');
      return json(res, r.ok ? 200 : 400, r);
    }
    if (p === '/api/settings') {
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (typeof b.volumeCapDb === 'number') settings.volumeCapDb = Math.min(18, Math.max(-60, Math.round(b.volumeCapDb * 2) / 2));
        if (typeof b.volumeStep === 'number') settings.volumeStep = [0.5, 1, 2].includes(b.volumeStep) ? b.volumeStep : 0.5;
        if (typeof b.topVolume === 'boolean') settings.topVolume = b.topVolume;
        if (ACCENTS.includes(b.accent)) settings.accent = b.accent;
        if (b.panelOption && ID.test(String(b.panelOption.panel)) && /^[a-zA-Z]{1,30}$/.test(String(b.panelOption.key))) {
          const { panel, key, value } = b.panelOption;
          settings.panelOptions ??= {};
          // on/off options are booleans; multiple-choice options are short ids (e.g. dial color)
          const v = typeof value === 'string' && /^[a-z0-9-]{1,20}$/.test(value) ? value : !!value;
          settings.panelOptions[panel] = { ...(settings.panelOptions[panel] ?? {}), [key]: v };
        }
        if (b.layout && typeof b.layout === 'object' && ID.test(String(b.layout.page))) {
          const page = String(b.layout.page);
          settings.layouts ??= {};
          if (b.layout.reset) delete settings.layouts[page];
          else if (Array.isArray(b.layout.order) && Object.keys(settings.layouts).length < 40) {
            settings.layouts[page] = {
              order: [...new Set(b.layout.order.filter((x: unknown) => typeof x === 'string' && ID.test(x)))].slice(0, 60) as string[],
              lanes: intMap(b.layout.lanes, 0, 7),
              spans: intMap(b.layout.spans, 1, 4),
            };
          }
        }
        await saveSettings();
        scheduleBroadcast();
      }
      return json(res, 200, settings);
    }
    if (p === '/api/heos/favorites' && req.method === 'GET') return json(res, 200, await heos.favorites());
    if (p === '/api/heos/favorites/play' && req.method === 'POST') {
      const { index } = await readBody(req);
      await heos.playFavorite(Number(index));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/tuner/presets' && req.method === 'POST') {
      await presetAction(await readBody(req), req.socket.remoteAddress ?? 'http');
      return json(res, 200, { ok: true });
    }
    if (p === '/api/speaker-presets') {
      if (req.method === 'GET') return json(res, 200, speakerPresets.summary());
      if (req.method === 'POST') {
        const b = await readBody(req);
        try {
          switch (b?.action) {
            case 'apply': return json(res, 200, { ok: true, ...(await speakerPresets.apply(b.id, { confirmAmp: b.confirmAmp === true })) });
            case 'create': return json(res, 200, { ok: true, id: (await speakerPresets.create(b.name, b.from, b.slot)).id });
            case 'rename': await speakerPresets.rename(b.id, b.name); break;
            case 'slot': await speakerPresets.setSlot(b.id, b.slot); break;
            case 'delete': await speakerPresets.remove(b.id); break;
            default: throw new HttpError(400, 'unknown action');
          }
          return json(res, 200, { ok: true });
        } catch (e) {
          if (!(e instanceof PresetError)) throw e;
          if (!e.confirm) log(`speaker preset ${b?.action}: ${e.message}`);
          return json(res, e.status, { error: e.message, confirm: e.confirm });
        }
      }
    }
    if (p === '/api/setup/capabilities') return json(res, 200, { readable: READABLE, writable: WRITABLE });
    if (p === '/api/setup/backups') return json(res, 200, await setup.listBackups());
    let m = p.match(/^\/api\/setup\/backups\/([\w.\-]+\.xml)$/);
    if (m) { res.writeHead(200, { 'Content-Type': 'application/xml' }); return res.end(await setup.readBackup(m[1])); }
    m = p.match(/^\/api\/setup\/(\w+)\/(\d+)$/);
    if (m) {
      const extra = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'type' && k !== 'data'));
      if (req.method === 'GET') {
        const xml = await setup.get(m[1], Number(m[2]), extra);
        res.writeHead(200, { 'Content-Type': 'application/xml', 'Cache-Control': 'no-store' });
        return res.end(xml);
      }
      if (req.method === 'POST') {
        const { data } = await readBody(req);
        log(`setup write ${m[1]}/${m[2]}: ${String(data).slice(0, 200)}`);
        await setup.set(m[1], Number(m[2]), data, effectiveCap(settings.volumeCapDb, state), extra);
        // Telnet-visible values may have changed.
        setTimeout(() => telnet.sendMany(REFRESH_QUERIES), 800);
        if (m[1] === 'speakers') setTimeout(refreshInstalled, 1500);
        speakerPresets.noteWrite(m[1], Number(m[2])); // auto-save into the active speaker preset
        return json(res, 200, { ok: true });
      }
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });
    return serveStatic(p, res);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    log(`error ${p}: ${(e as Error).message}`);
    return json(res, status, { error: (e as Error).message });
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

async function serveStatic(p: string, res: http.ServerResponse) {
  if (!existsSync(DIST)) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('Frontend not built. Run `npm run build`, or use `npm run dev` and open the Vite URL.');
  }
  let file = path.normalize(path.join(DIST, decodeURIComponent(p)));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(DIST, 'index.html'); // SPA fallback
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

// ---------- start ----------
server.listen(PORT, () => {
  log(`Denon Remote on http://localhost:${PORT}  (receiver ${HOST}, telnet ${USE_TELNET ? 'on' : 'off'})`);
});
if (USE_TELNET) telnet.start();
heos.start();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { telnet.stop(); heos.stop(); server.close(); process.exit(0); });
}
