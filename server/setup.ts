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
  audio: [1, 3, 4, 5, 7, 9, 10], // 1 = which audio menus are active (Restorer etc.)
  speakers: [2, 3, 4, 5, 6, 7, 8, 10, 11, 18],
  inputs: [2, 3, 4, 5, 6],
  video: [3, 4, 7, 8, 9, 11, 12, 13],
  network: [2, 4, 5, 6, 9, 10, 11, 12, 13],
  general: [2, 3, 4, 6, 7, 10, 14, 17],
  account: [9],
};

// Writes we expose. Anything that can brick, reset, lock, or knock the unit off the network is excluded.
export const WRITABLE: Record<string, number[]> = {
  globals: [3], // friendly name
  audio: [7, 10], // volume limit / power-on level / mute level, graphic EQ
  speakers: [2, 3, 4, 5, 6, 7, 8, 11], // amp assign (mode only), config, distances, levels, crossovers, bass, front A/B, preset
  inputs: [2, 3, 4, 5, 6], // assignment, rename, hide, source level, input mode
  general: [2, 3, 4, 6, 7, 10, 14], // language, ECO, zone 2 setup, zone rename, quick select names, display, usage data
  video: [3, 7, 8, 9, 11, 12, 13], // HDMI setup, OSD, 4K/8K format, TV format, HDCP, screensaver, upscaler
  network: [5, 9, 10, 11, 12, 13], // network control, AirPlay, Spotify, Roon, TIDAL, Qobuz (never IP settings)
};

// Allowed root element(s) of the XML payload for each writable page (exactly as the official UI sends them).
const ROOTS: Record<string, string[]> = {
  'globals/3': ['FriendlyName'],
  'audio/7': ['Limit', 'PowerOnLevel', 'MuteLevel'],
  'audio/10': ['GraphicEQ'],
  'speakers/2': ['AmpAssign'],
  'speakers/3': ['Speaker'],
  'speakers/4': ['Distances', 'Unit'],
  'speakers/5': ['List'],
  'speakers/6': ['Selection', 'All', 'Speaker'],
  'speakers/7': ['SubwooferMode', 'LPFforLFE'],
  'speakers/8': ['FrontSpeaker'],
  'speakers/11': ['SpeakerPreset'],
  'inputs/2': ['HDMI', 'Digital', 'Analog', 'Video', 'InputMode'],
  'inputs/3': ['Source'],
  'inputs/4': ['Hide'],
  'inputs/5': ['SourceLevel'],
  'inputs/6': ['InputMode'],
  'general/3': ['Mode', 'PowerOnDefault', 'OnScreenDisplay', 'AutoStandby'],
  'general/4': ['VolumeLevel', 'VolumeLimit', 'PowerOnVolume', 'MuteLevel', 'Bass', 'Treble', 'HighPassFilter', 'Channel', 'LchLevel', 'RchLevel'],
  'general/6': ['List'],
  'general/7': ['List'],
  'general/10': ['Dimmer', 'Channel'],
  'general/14': ['Send'],
  'general/2': ['Language'],
  'video/3': ['HDMIAudioOut', 'VerticalStretch', 'HDMIPassThrough', 'PassThroughSource', 'RCSelect', 'HDMIControl', 'ARC',
    'TVAudioSwitching', 'PowerOffControl', 'PowerSaving', 'SmartMenu'],
  'video/7': ['OnScreenDisplay'],
  'video/8': ['Format'],
  'video/9': ['TVFormat'],
  'video/11': ['Value'],
  'video/12': ['ScreenSaver'],
  'video/13': ['HDMIScaler'],
  'network/5': ['Control'],
  'network/9': ['AirPlay'],
  'network/10': ['SpotifyConnect'],
  'network/11': ['RoonReady'],
  'network/12': ['TidalConnect'],
  'network/13': ['QobuzConnect'],
};

// Never pass these anywhere in a payload.
const FORBIDDEN_TAGS = /<\s*\/?\s*(SetDefaults|Reboot|SetupLock|Update|ExecuteUpdate|FirmwareUpdate|CurveCopy|MenuLock|PanelLock|RemoteLock)\b/i;

/**
 * Validate an XML payload before it reaches the receiver. `capDb` = app volume cap, used to refuse a
 * "power-on volume" louder than the cap (avoids a loud surprise at the next power-on).
 */
export function validateWrite(section: string, type: number, xml: string, capDb: number): string | null {
  if (FORBIDDEN_TAGS.test(xml)) return 'payload contains a blocked element (reset/lock/firmware)';
  const roots = ROOTS[`${section}/${type}`];
  if (!roots) return `write not allowed: ${section}/${type}`;
  const m = xml.trim().match(/^<([A-Za-z][\w]*)[\s>][\s\S]*<\/\1>$/);
  if (!m || !roots.includes(m[1])) return `unexpected payload for ${section}/${type}`;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(xml)) return 'control characters not allowed';
  // Amp Assign re-routes the power amps: allow only the X1700H's Assign Mode values, nothing else on that page.
  if (section === 'speakers' && type === 2 && !/^<AmpAssign><AssignMode>(1|2|5|6|7|8|9|10|11)<\/AssignMode><\/AmpAssign>$/.test(xml.trim()))
    return 'only Assign Mode can be changed';
  if (section === 'speakers' && type === 8 && !/^<FrontSpeaker>[123]<\/FrontSpeaker>$/.test(xml.trim())) return 'front speaker must be A, B or A+B';
  const pon = xml.match(/<(PowerOnLevel|PowerOnVolume)>(\d+)</);
  if (pon) {
    const n = Number(pon[2]);
    if (n !== 0 && n !== 99 && n - 80 > capDb) return `power-on volume above the safety cap (${capDb} dB)`;
  }
  return null;
}

// Explicitly never allowed, regardless of the lists above.
const NEVER: Record<string, number[]> = {
  globals: [8], // setup lock
  general: [11, 15, 16], // firmware, setup lock, reset
  network: [3, 4, 7], // connection, IP settings (shown read-only), diagnostics
  advanced: [4, 5, 6, 7, 8, 9],
  account: [2, 3, 4, 5, 6, 7, 8],
};

// Pages whose mere GET does something (runs a test, starts an action): never even read them.
// (Everything in NEVER is still never written.)
const NEVER_READ: Record<string, number[]> = {
  globals: [8],
  general: [11, 15, 16],
  network: [3, 7],
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
    return !!READABLE[section]?.includes(type) && !NEVER_READ[section]?.includes(type);
  }
  canWrite(section: string, type: number): boolean {
    return !!WRITABLE[section]?.includes(type) && !NEVER[section]?.includes(type);
  }

  get(section: string, type: number, extra: Record<string, string> = {}): Promise<string> {
    if (!this.canRead(section, type)) return Promise.reject(new HttpError(403, `read not allowed: ${section}/${type}`));
    const qs = new URLSearchParams({ type: String(type), ...safeExtra(section, type, extra), _: String(Date.now()) });
    return this.serial(() => this.request(`/ajax/${section}/get_config?${qs}`));
  }

  async set(section: string, type: number, dataXml: string, capDb: number, extra: Record<string, string> = {}): Promise<string> {
    if (!this.canWrite(section, type)) throw new HttpError(403, `write not allowed: ${section}/${type}`);
    if (typeof dataXml !== 'string' || dataXml.length > 20_000) throw new HttpError(400, 'data must be an XML fragment');
    const problem = validateWrite(section, type, dataXml, capDb);
    if (problem) throw new HttpError(400, problem);
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

  /**
   * The Information page (general type 12). Read-only, but it takes ~30 s and the receiver's setup server
   * answers nothing else meanwhile, so it is not in READABLE: only the server calls this, and rarely.
   */
  information(): Promise<string> {
    return this.serial(() => this.request(`/ajax/general/get_config?type=12&_=${Date.now()}`, 45_000));
  }

  private request(pathAndQuery: string, timeout = 20_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        { host: this.host, port: 10443, path: pathAndQuery, agent: this.agent, timeout },
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

/**
 * Extra query params are dangerous: e.g. `general` type 11 with `opt1=2` STARTS A FIRMWARE UPDATE.
 * The only legitimate use is the Graphic EQ per-channel view (audio type 10: opt1=<channel code>, opt2=0).
 * Everything else is dropped.
 */
export function safeExtra(section: string, type: number, extra: Record<string, string>): Record<string, string> {
  if (section === 'audio' && type === 10 && /^\d{1,2}$/.test(extra.opt1 ?? '')) {
    return { opt1: extra.opt1, opt2: '0' };
  }
  return {};
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}
