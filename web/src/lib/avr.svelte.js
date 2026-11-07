// Live receiver state over WebSocket, shared by every component.

export const avr = $state({
  online: false, // websocket to our server
  state: null,
  nowPlaying: null,
  progress: { position: null, duration: null },
  conn: { telnet: false, heos: false, http: false },
  settings: { volumeCapDb: -10, volumeStep: 0.5 },
  speakerPresets: null, // { supported, list: [{id, name, slot, captured, layout}], active, incomplete, busy: {id, step}, rev }
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

/** Readable labels for speaker channel codes. */
export const CHANNELS = {
  FL: 'Front L', FR: 'Front R', C: 'Center', SW: 'Subwoofer', SW2: 'Sub 2', SL: 'Surround L', SR: 'Surround R',
  SBL: 'Surr. Back L', SBR: 'Surr. Back R', SB: 'Surr. Back', FHL: 'Front Height L', FHR: 'Front Height R',
  TFL: 'Top Front L', TFR: 'Top Front R', TML: 'Top Middle L', TMR: 'Top Middle R', TRL: 'Top Rear L', TRR: 'Top Rear R',
  FDL: 'Front Dolby L', FDR: 'Front Dolby R', SDL: 'Surr. Dolby L', SDR: 'Surr. Dolby R', BDL: 'Back Dolby L', BDR: 'Back Dolby R',
};
