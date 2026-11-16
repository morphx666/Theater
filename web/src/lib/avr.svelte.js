// Live receiver state over WebSocket, shared by every component.

export const avr = $state({
  online: false, // websocket to our server
  state: null,
  nowPlaying: null,
  progress: { position: null, duration: null },
  conn: { telnet: false, heos: false, http: false },
  settings: { volumeCapDb: -10, volumeStep: 0.5 },
  speakerPresets: null, // { supported, list: [{id, name, slot, captured, layout}], active, incomplete, busy: {id, step}, rev }
  soundModes: null, // { signal, signalName, family, native, current, label, available: [{mode, label, group}], canLearn, busy }
  automations: [], // [{ id, name, enabled, disabled, running, lastRun: {at, status, error} }] (server/automation.ts)
  cap: -10,
  toast: null,
});

let ws;
let retry = 500;
const rawListeners = new Set();

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    avr.online = true;
    retry = 500;
    if (rawListeners.size) ws.send(JSON.stringify({ type: 'raw-subscribe', on: true }));
  };
  ws.onclose = () => {
    avr.online = false;
    setTimeout(connect, retry);
    retry = Math.min(retry * 2, 8000);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'state') {
      avr.state = msg.state;
      avr.nowPlaying = msg.nowPlaying;
      avr.progress = msg.progress;
      avr.conn = msg.conn;
      avr.settings = msg.settings;
      avr.speakerPresets = msg.speakerPresets ?? null;
      avr.soundModes = msg.soundModes ?? null;
      avr.automations = msg.automations ?? [];
      avr.cap = msg.cap;
    } else if (msg.type === 'progress') {
      avr.progress = { position: msg.position, duration: msg.duration };
    } else if (msg.type === 'error') {
      toast(msg.message, 'error');
    } else if (msg.type === 'raw') {
      for (const fn of rawListeners) fn(msg.line);
    }
  };
}

function wsSend(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  else toast('Not connected to the server', 'error');
}

/** Send one or more (guarded) telnet commands. */
export function send(cmd) {
  wsSend({ type: 'cmd', cmd });
}

export function heos(action) {
  wsSend({ type: 'heos', action });
}

export function onRaw(fn) {
  rawListeners.add(fn);
  if (rawListeners.size === 1) wsSend({ type: 'raw-subscribe', on: true });
  return () => {
    rawListeners.delete(fn);
    if (!rawListeners.size) wsSend({ type: 'raw-subscribe', on: false });
  };
}

let toastTimer;
export function toast(text, kind = 'info') {
  avr.toast = { text, kind };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (avr.toast = null), 3500);
}

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

// ---------- formatting helpers ----------
export const fmtDb = (v, digits = 1) =>
  v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(v % 1 ? 1 : digits === 0 ? 0 : 1)}`;

export const level2 = (db) => {
  // dB -> 2/3 digit level code (50 = 0 dB)
  const n = Math.min(62, Math.max(38, Math.round((db + 50) * 2) / 2));
  const two = String(Math.floor(n)).padStart(2, '0');
  return n % 1 ? `${two}5` : two;
};

export const vol2 = (db) => {
  const n = Math.min(98, Math.max(0, Math.round((db + 80) * 2) / 2));
  const two = String(Math.floor(n)).padStart(2, '0');
  return n % 1 ? `${two}5` : two;
};

export const SOURCE_ORDER = ['SAT/CBL', 'MPLAY', 'BD', 'GAME', 'TV', 'DVD', 'AUX1', 'AUX2', 'CD', 'PHONO', 'TUNER', 'NET', 'BT', 'USB'];
export const SOURCE_ICONS = {
  'SAT/CBL': 'tv', MPLAY: 'play', BD: 'disc', GAME: 'game', TV: 'tv', DVD: 'disc', AUX1: 'plug', AUX2: 'plug',
  CD: 'disc', PHONO: 'vinyl', TUNER: 'radio', NET: 'cloud', BT: 'bt', USB: 'usb',
};

/** Full names for speaker / input channel codes. */
export const CHANNELS = {
  FL: 'Front Left', FR: 'Front Right', C: 'Center', LFE: 'Low Frequency Effects',
  SW: 'Subwoofer', SW2: 'Subwoofer 2', SW3: 'Subwoofer 3', SW4: 'Subwoofer 4', SL: 'Surround Left', SR: 'Surround Right',
  SBL: 'Surround Back Left', SBR: 'Surround Back Right', SB: 'Surround Back', FWL: 'Front Wide Left', FWR: 'Front Wide Right',
  FHL: 'Front Height Left', FHR: 'Front Height Right', TFL: 'Top Front Left', TFR: 'Top Front Right',
  TML: 'Top Middle Left', TMR: 'Top Middle Right', TRL: 'Top Rear Left', TRR: 'Top Rear Right',
  RHL: 'Rear Height Left', RHR: 'Rear Height Right', FDL: 'Front Dolby Left', FDR: 'Front Dolby Right',
  SDL: 'Surround Dolby Left', SDR: 'Surround Dolby Right', BDL: 'Back Dolby Left', BDR: 'Back Dolby Right',
  SHL: 'Surround Height Left', SHR: 'Surround Height Right', TS: 'Top Surround', CH: 'Center Height',
};
