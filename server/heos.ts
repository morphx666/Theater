// HEOS CLI client (TCP 1255): now-playing metadata, album art and transport for the NET source.

import net from 'node:net';
import { EventEmitter } from 'node:events';

export type NowPlaying = {
  state: 'play' | 'pause' | 'stop' | null;
  type: string | null;
  song: string; artist: string; album: string; station: string; image: string;
  source: string | null;
  position: number | null; duration: number | null; // ms
};

export const emptyNowPlaying = (): NowPlaying => ({
  state: null, type: null, song: '', artist: '', album: '', station: '', image: '', source: null, position: null, duration: null,
});

// Never expose these.
const FORBIDDEN = /reboot|check_update|update|sign_out|delete|factory/i;

export class Heos extends EventEmitter {
  connected = false;
  pid: number | null = null;
  now: NowPlaying = emptyNowPlaying();
  private sock: net.Socket | null = null;
  private buf = '';
  private host: string;
  private stopped = false;
  private retryMs = 2000;
  private hb: NodeJS.Timeout | null = null;
  private pending = new Map<string, Array<(r: any) => void>>();

  constructor(host: string) {
    super();
    this.host = host;
  }

  start(): void {
    this.connect();
    this.hb = setInterval(() => { if (this.connected) this.raw('system/heart_beat'); }, 30_000);
  }

  stop(): void {
    this.stopped = true;
    if (this.hb) clearInterval(this.hb);
    this.sock?.destroy();
  }

  private connect(): void {
    const sock = net.createConnection({ host: this.host, port: 1255 });
    this.sock = sock;
    sock.on('connect', async () => {
      this.connected = true;
      this.retryMs = 2000;
      this.emit('status', true);
      try {
        const players = await this.request('player/get_players');
        const me = (players?.payload ?? []).find((p: any) => p.ip === this.host) ?? players?.payload?.[0];
        this.pid = me?.pid ?? null;
        await this.request('system/register_for_change_events', { enable: 'on' });
        await this.refresh();
      } catch (e) {
        this.emit('warn', `HEOS init failed: ${(e as Error).message}`);
      }
    });
    sock.on('data', (d) => {
      this.buf += d.toString('utf8');
      let i: number;
      while ((i = this.buf.indexOf('\r\n')) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 2);
        if (line.trim()) this.onLine(line);
      }
    });
    sock.on('error', () => {});
    sock.on('close', () => {
      if (this.sock !== sock) return;
      if (this.connected) this.emit('status', false);
      this.connected = false;
      this.sock = null;
      for (const [, cbs] of this.pending) cbs.forEach((cb) => cb(null));
      this.pending.clear();
      if (!this.stopped) {
        setTimeout(() => this.connect(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 60_000);
      }
    });
  }

  private raw(cmd: string, params: Record<string, string | number> = {}): void {
    const q = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    this.sock?.write(`heos://${cmd}${q ? '?' + q : ''}\r\n`);
  }

  request(cmd: string, params: Record<string, string | number> = {}, timeoutMs = 8000): Promise<any> {
    if (FORBIDDEN.test(cmd)) return Promise.reject(new Error('forbidden HEOS command'));
    if (!this.connected) return Promise.reject(new Error('HEOS not connected'));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { done(null); reject(new Error(`HEOS timeout: ${cmd}`)); }, timeoutMs);
      const done = (r: any) => {
        clearTimeout(t);
        const list = this.pending.get(cmd);
        if (list) { const i = list.indexOf(done); if (i >= 0) list.splice(i, 1); }
        if (r) resolve(r);
      };
      const list = this.pending.get(cmd) ?? [];
      list.push(done);
      this.pending.set(cmd, list);
      this.raw(cmd, params);
    });
  }

  private onLine(line: string): void {
    let msg: any;
    try { msg = JSON.parse(line); } catch { return; }
    const cmd: string = msg?.heos?.command ?? '';
    const message: string = msg?.heos?.message ?? '';
    if (cmd.startsWith('event/')) { this.onEvent(cmd.slice(6), parseMessage(message)); return; }
    if (message.includes('command under process')) return; // real answer follows
    const cbs = this.pending.get(cmd);
    if (cbs?.length) cbs[0](msg);
  }

  private onEvent(ev: string, m: Record<string, string>): void {
    if (m.pid && this.pid && Number(m.pid) !== this.pid) return;
    switch (ev) {
      case 'player_state_changed':
        this.now.state = (m.state as NowPlaying['state']) ?? null;
        this.emit('nowPlaying', this.now);
        break;
      case 'player_now_playing_changed':
        this.refresh().catch(() => {});
        break;
      case 'player_now_playing_progress':
        this.now.position = Number(m.cur_pos) || 0;
        this.now.duration = Number(m.duration) || null;
        this.emit('progress', { position: this.now.position, duration: this.now.duration });
        break;
    }
  }

  async refresh(): Promise<void> {
    if (!this.pid) return;
    const [media, ps] = await Promise.all([
      this.request('player/get_now_playing_media', { pid: this.pid }),
      this.request('player/get_play_state', { pid: this.pid }),
    ]);
    const p = media?.payload ?? {};
    this.now = {
      ...this.now,
      state: (parseMessage(ps?.heos?.message ?? '').state as NowPlaying['state']) ?? this.now.state,
      type: p.type ?? null,
      song: p.song ?? '', artist: p.artist ?? '', album: p.album ?? '', station: p.station ?? '',
      image: p.image_url ?? '', source: p.sid != null ? String(p.sid) : null,
    };
    this.emit('nowPlaying', this.now);
  }

  async transport(action: 'play' | 'pause' | 'stop' | 'next' | 'previous'): Promise<void> {
    if (!this.pid) throw new Error('No HEOS player');
    if (action === 'next') await this.request('player/play_next', { pid: this.pid });
    else if (action === 'previous') await this.request('player/play_previous', { pid: this.pid });
    else await this.request('player/set_play_state', { pid: this.pid, state: action });
  }

  async favorites(): Promise<Array<{ name: string; image: string; mid: string }>> {
    // HEOS Favorites live under source id 1028.
    const r = await this.request('browse/browse', { sid: 1028 }, 15000);
    return (r?.payload ?? []).map((x: any) => ({ name: x.name, image: x.image_url ?? '', mid: x.mid ?? '' }));
  }

  async playFavorite(index: number): Promise<void> {
    if (!this.pid) throw new Error('No HEOS player');
    await this.request('browse/play_preset', { pid: this.pid, preset: index }, 15000);
  }
}

// "pid=1&state=play" -> { pid: '1', state: 'play' }  (values are %-encoded)
function parseMessage(m: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of m.split('&')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
    else if (part) out[part] = '';
  }
  return out;
}
