// Persistent telnet connection to the receiver with a paced command queue.
// Falls back to HTTP (port 8080) for sending when telnet is unavailable.

import net from 'node:net';
import { EventEmitter } from 'node:events';

const GAP_MS = 80; // receiver needs >= 50 ms between commands
const KEEPALIVE_MS = 30_000;

export class AvrTelnet extends EventEmitter {
  connected = false;
  private sock: net.Socket | null = null;
  private buf = '';
  private queue: string[] = [];
  private sending = false;
  private lastRx = Date.now();
  private retryMs = 1000;
  private stopped = false;
  private keepalive: NodeJS.Timeout | null = null;
  private host: string;
  private port: number;
  private httpPort: number;

  constructor(host: string, port = 23, httpPort = 8080) {
    super();
    this.host = host;
    this.port = port;
    this.httpPort = httpPort;
  }

  start(): void {
    this.stopped = false;
    this.connect();
    this.keepalive = setInterval(() => {
      if (this.connected && Date.now() - this.lastRx > KEEPALIVE_MS) this.send('PW?');
      if (this.connected && Date.now() - this.lastRx > KEEPALIVE_MS * 3) this.sock?.destroy(); // dead link
    }, 10_000);
  }

  stop(): void {
    this.stopped = true;
    if (this.keepalive) clearInterval(this.keepalive);
    this.sock?.destroy();
  }

  private connect(): void {
    const sock = net.createConnection({ host: this.host, port: this.port });
    this.sock = sock;
    sock.setNoDelay(true);
    sock.setTimeout(8000, () => { if (!this.connected) sock.destroy(); });
    sock.on('connect', () => {
      sock.setTimeout(0);
      this.connected = true;
      this.retryMs = 1000;
      this.lastRx = Date.now();
      this.emit('status', true);
      this.pump();
    });
    sock.on('data', (d) => {
      this.lastRx = Date.now();
      this.buf += d.toString('latin1');
      let i: number;
      while ((i = this.buf.indexOf('\r')) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        if (line.trim()) this.emit('line', line);
      }
    });
    const onDown = () => {
      if (this.sock !== sock) return;
      const was = this.connected;
      this.connected = false;
      this.sock = null;
      if (was) this.emit('status', false);
      if (!this.stopped) {
        setTimeout(() => this.connect(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 30_000);
      }
    };
    sock.on('error', () => {});
    sock.on('close', onDown);
  }

  /** Queue a command. Duplicate queued queries are collapsed. */
  send(cmd: string): void {
    if (cmd.endsWith('?') && this.queue.includes(cmd)) return;
    // Collapse consecutive absolute volume sets: only the latest matters.
    if (/^(MV|Z2)\d{2,3}$/.test(cmd)) {
      const pre = cmd.slice(0, 2);
      this.queue = this.queue.filter((q) => !(q.startsWith(pre) && /^\d{2,3}$/.test(q.slice(2))));
    }
    this.queue.push(cmd);
    this.pump();
  }

  sendMany(cmds: string[]): void {
    for (const c of cmds) this.send(c);
  }

  private async pump(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.queue.length) {
        const cmd = this.queue.shift()!;
        if (this.connected && this.sock) {
          this.sock.write(cmd + '\r', 'latin1');
        } else if (!cmd.endsWith('?')) {
          await this.sendHttp(cmd); // queries are useless over HTTP (empty reply)
        }
        await new Promise((r) => setTimeout(r, GAP_MS));
      }
    } finally {
      this.sending = false;
    }
  }

  private async sendHttp(cmd: string): Promise<void> {
    const url = `http://${this.host}:${this.httpPort}/goform/formiPhoneAppDirect.xml?${encodeURIComponent(cmd).replace(/%2F/g, '/')}`;
    try {
      await fetch(url, { signal: AbortSignal.timeout(4000) });
    } catch (e) {
      this.emit('warn', `HTTP send failed for ${cmd}: ${(e as Error).message}`);
    }
  }
}
