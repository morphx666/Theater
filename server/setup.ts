// Guarded proxy to the receiver's Setup web API (https://<avr>:10443/ajax/<section>/get_config|set_config).
//  - Only allow-listed (section, type) pairs; unsupported types hang the receiver's web server for ~30 s.
//  - Requests are serialised (one at a time).
//  - Every write first snapshots the current value to data/backups/ so it can be restored.

import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';

// type numbers verified to respond on the AVR-X1700H (see docs/PROTOCOL.md)
export const READABLE: Record<string, number[]> = {
  globals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  home: [1],
  audio: [3, 4, 5, 7, 9, 10],
  speakers: [2, 3, 4, 5, 6, 7, 8, 10, 11, 18],
  inputs: [2, 3, 4, 5, 6],
  video: [3, 4, 7, 8, 9, 11, 12, 13],
  network: [2, 4, 5, 6, 9, 10, 11, 12, 13],
  general: [2, 3, 4, 6, 7, 10, 14, 17],
  account: [9],
};

// Writes we expose. Anything that can brick, reset, lock, or knock the unit off the network is excluded.
export const WRITABLE: Record<string, number[]> = {
  globals: [3, 4, 6, 7, 10], // friendly name, zone power, zone rename, source select, speaker preset
  audio: [3, 4, 5, 7, 9, 10],
  speakers: [3, 4, 5, 6, 7, 8, 10, 11],
  inputs: [2, 3, 4, 5, 6],
  video: [],
  general: [],
};

// Explicitly never allowed, regardless of the lists above.
const NEVER: Record<string, number[]> = {
  globals: [8], // setup lock
  general: [11, 15, 16], // firmware, setup lock, reset
  network: [3, 4, 7], // connection, IP settings, diagnostics
  advanced: [4, 5, 6, 7, 8, 9],
  account: [2, 3, 4, 5, 6, 7, 8],
};

export function setReadable(section: string, types: number[]): void {
  READABLE[section] = types;
}
export function setWritable(section: string, types: number[]): void {
  WRITABLE[section] = types.filter((t) => !NEVER[section]?.includes(t));
}

export class SetupApi {
  private host: string;
  private backupDir: string;
  private chain: Promise<unknown> = Promise.resolve();
  private agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 1 });

  constructor(host: string, dataDir: string) {
    this.host = host;
    this.backupDir = path.join(dataDir, 'backups');
  }

  canRead(section: string, type: number): boolean {
    return !!READABLE[section]?.includes(type) && !NEVER[section]?.includes(type);
  }
  canWrite(section: string, type: number): boolean {
    return !!WRITABLE[section]?.includes(type) && !NEVER[section]?.includes(type);
  }

  get(section: string, type: number, extra: Record<string, string> = {}): Promise<string> {
    if (!this.canRead(section, type)) return Promise.reject(new HttpError(403, `read not allowed: ${section}/${type}`));
    const qs = new URLSearchParams({ type: String(type), ...extra, _: String(Date.now()) });
    return this.serial(() => this.request(`/ajax/${section}/get_config?${qs}`));
  }

  async set(section: string, type: number, dataXml: string, extra: Record<string, string> = {}): Promise<string> {
    if (!this.canWrite(section, type)) throw new HttpError(403, `write not allowed: ${section}/${type}`);
    if (typeof dataXml !== 'string' || dataXml.length > 20_000 || !dataXml.trim().startsWith('<')) {
      throw new HttpError(400, 'data must be an XML fragment');
    }
    await this.backup(section, type, extra);
    const qs = `type=${type}&data=${encodeURIComponent(dataXml)}`;
    return this.serial(() => this.request(`/ajax/${section}/set_config?${qs}`));
  }

  async listBackups(): Promise<string[]> {
    try {
      return (await fs.readdir(this.backupDir)).filter((f) => f.endsWith('.xml')).sort().reverse();
    } catch {
      return [];
    }
  }

  async readBackup(name: string): Promise<string> {
    if (!/^[\w.\-]+\.xml$/.test(name)) throw new HttpError(400, 'bad name');
    return fs.readFile(path.join(this.backupDir, name), 'utf8');
  }

  private async backup(section: string, type: number, extra: Record<string, string>): Promise<void> {
    if (!this.canRead(section, type)) return;
    const xml = await this.get(section, type, extra);
    await fs.mkdir(this.backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.writeFile(path.join(this.backupDir, `${ts}_${section}_${type}.xml`), xml);
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => {});
    return p;
  }

  private request(pathAndQuery: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        { host: this.host, port: 10443, path: pathAndQuery, agent: this.agent, timeout: 20_000 },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            if (res.statusCode === 423) reject(new HttpError(423, 'Receiver setup is locked'));
            else if ((res.statusCode ?? 500) >= 400) reject(new HttpError(502, `receiver returned ${res.statusCode}`));
            else resolve(body);
          });
        },
      );
      req.on('timeout', () => req.destroy(new HttpError(504, 'receiver did not answer')));
      req.on('error', reject);
    });
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}
