// Cross-platform part of the setup (called by setup.sh and setup.ps1, which make sure Node 22.18+ is used).
//   node scripts/setup.ts configure   find the receiver, pick a port, write .env (asks only what it can't work out)
//   node scripts/setup.ts summary     print the addresses to open
// When stdin is not a terminal, every question takes its default answer.

import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');
const EXAMPLE_FILE = path.join(ROOT, '.env.example');
const DEFAULT_PORT = 8787;
const TESTED_MODEL = 'AVR-X1700H';
const interactive = !!(process.stdin.isTTY && process.stdout.isTTY);

type Receiver = { host: string; model: string; name: string };

// ---------- .env ----------
function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/**
 * Set keys in .env (created from .env.example), keeping every other line and comment as it is.
 * A value of null comments the setting out (the app then uses its default). A setting that is only present
 * commented out (e.g. "# DATA_DIR=...") is set on that same line.
 */
function writeEnv(values: Record<string, string | null>) {
  const base = fs.existsSync(ENV_FILE) ? ENV_FILE : EXAMPLE_FILE;
  const lines = fs.existsSync(base) ? fs.readFileSync(base, 'utf8').replace(/\r?\n$/, '').split(/\r?\n/) : [];
  const find = (key: string, commented: boolean) =>
    lines.findIndex((l) => new RegExp(`^\\s*${commented ? '#\\s*' : ''}${key}\\s*=`).test(l));
  for (const [key, value] of Object.entries(values)) {
    const active = find(key, false);
    if (value === null) {
      if (active >= 0) lines[active] = `# ${lines[active].trim()}`;
      continue;
    }
    const i = active >= 0 ? active : find(key, true);
    if (i >= 0) lines[i] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n');
}

// ---------- questions ----------
let rl: readline.Interface | null = null;
async function ask(question: string, def = ''): Promise<string> {
  if (!interactive) { if (def) console.log(`  ${question}: ${def}`); return def; }
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`  ${question}${def ? ` [${def}]` : ''}: `)).trim();
  return a || def;
}
async function confirm(question: string, def = true): Promise<boolean> {
  if (!interactive) { console.log(`  ${question} ${def ? 'yes' : 'no'}`); return def; }
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`  ${question} ${def ? '[Y/n]' : '[y/N]'} `)).trim();
  return a ? /^y/i.test(a) : def;
}

// ---------- receiver ----------
const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1]?.trim() ?? '';

/** The receiver's own model info (HTTP port 8080). null = nothing that looks like a Denon/Marantz receiver answered. */
async function deviceInfo(host: string): Promise<{ model: string } | null> {
  try {
    const res = await fetch(`http://${host}:8080/goform/Deviceinfo.xml`, { signal: AbortSignal.timeout(3000) });
    const model = tag(await res.text(), 'ModelName');
    return res.ok && model ? { model } : null;
  } catch {
    return null;
  }
}

/** Find Denon and Marantz receivers with SSDP (UPnP discovery), on every network interface. */
async function discover(): Promise<Receiver[]> {
  const SEARCH = ['urn:schemas-denon-com:device:ACT-Denon:1', 'urn:schemas-upnp-org:device:MediaRenderer:1'];
  const locations = new Map<string, string>(); // description URL -> responder IP
  const addrs = Object.values(os.networkInterfaces()).flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === 'IPv4' && !a.internal);
  await Promise.all(addrs.map((a) => new Promise<void>((done) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('error', () => { try { sock.close(); } catch {} done(); });
    sock.on('message', (msg, rinfo) => {
      const loc = /^location:\s*(\S+)/im.exec(String(msg))?.[1];
      if (loc) locations.set(loc, rinfo.address);
    });
    sock.bind(0, a.address, () => {
      for (const st of SEARCH) {
        const m = `M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`;
        sock.send(m, 1900, '239.255.255.250', () => {});
      }
      setTimeout(() => { try { sock.close(); } catch {} done(); }, 3000);
    });
  })));

  const byHost = new Map<string, Receiver>();
  await Promise.all([...locations].map(async ([loc, ip]) => {
    try {
      const xml = await (await fetch(loc, { signal: AbortSignal.timeout(3000) })).text();
      if (!/denon|marantz/i.test(tag(xml, 'manufacturer')) || byHost.has(ip)) return;
      const info = await deviceInfo(ip); // only AV receivers answer this (not HEOS speakers)
      if (info && !byHost.has(ip)) byHost.set(ip, { host: ip, model: info.model, name: tag(xml, 'friendlyName') });
    } catch {}
  }));
  return [...byHost.values()].sort((a, b) => a.host.localeCompare(b.host, undefined, { numeric: true }));
}

const label = (r: Receiver) => `${r.model}${r.name && r.name !== r.model ? ` "${r.name}"` : ''} at ${r.host}`;

async function askHost(): Promise<string> {
  if (!interactive) {
    console.error('  No receiver found. Set AVR_HOST in .env to your receiver\'s IP address and run setup again.');
    process.exit(1);
  }
  console.log('  You can find the IP address on the receiver under Setup > Network > Information.');
  for (;;) {
    const host = await ask('Receiver IP address');
    if (!host) continue;
    if (await deviceInfo(host)) return host;
    console.log(`  No answer from ${host}. Check that the receiver is plugged in and that`);
    console.log('  Setup > Network > Network Control is set to "Always On".');
    if (await confirm('Use this address anyway?', false)) return host;
  }
}

async function chooseReceiver(env: Record<string, string>): Promise<string> {
  if (env.AVR_HOST) {
    const info = await deviceInfo(env.AVR_HOST);
    if (info) {
      if (await confirm(`Found ${info.model} at ${env.AVR_HOST} (from .env). Keep using it?`)) return env.AVR_HOST;
    } else {
      console.log(`  The receiver in .env (${env.AVR_HOST}) isn't answering.`);
    }
  }
  console.log('  Searching your network for Denon and Marantz receivers...');
  const found = await discover();
  if (found.length === 1) {
    if (await confirm(`Found ${label(found[0])}. Use it?`)) return found[0].host;
  } else if (found.length > 1) {
    console.log('  Found these receivers:');
    found.forEach((r, i) => console.log(`    ${i + 1}. ${label(r)}`));
    console.log(`    ${found.length + 1}. Another one (type its IP address)`);
    for (;;) {
      const n = Number(await ask('Which one?', '1'));
      if (n >= 1 && n <= found.length) return found[n - 1].host;
      if (n === found.length + 1) break;
    }
  } else {
    console.log('  No receiver found automatically.');
  }
  return askHost();
}

// ---------- port ----------
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, () => s.close(() => resolve(true)));
  });
}

/** Is Theater itself already running on this port? (Re-running setup to update.) */
async function isTheater(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`, { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.json())?.type === 'state';
  } catch {
    return false;
  }
}

async function choosePort(env: Record<string, string>): Promise<number> {
  const port = Number(env.PORT) || DEFAULT_PORT;
  if ((await portFree(port)) || (await isTheater(port))) return port;
  let alt = port + 1;
  while (!(await portFree(alt))) alt++;
  console.log(`  Port ${port} is already used by another program.`);
  for (;;) {
    const n = Number(await ask('Port for Theater', String(alt)));
    if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  }
}

// ---------- telnet ----------
async function chooseTelnet(env: Record<string, string>): Promise<'on' | 'off'> {
  console.log('  Telnet gives Theater instant updates, but it can keep other apps from connecting to the receiver.');
  console.log('  Keep it on unless another app stops working. Without it, Theater updates a little more slowly.');
  return (await confirm('Use the telnet connection?', env.AVR_TELNET !== 'off')) ? 'on' : 'off';
}

// ---------- data folder ----------
const DEFAULT_DATA = path.join(ROOT, 'data');

/** "~/x" -> home, relative -> inside the app's folder (an absolute path never depends on the working directory). */
function resolveDir(p: string): string {
  const home = p === '~' || p.startsWith('~/') || p.startsWith('~\\') ? path.join(os.homedir(), p.slice(1)) : p;
  return path.resolve(ROOT, home);
}

function usable(dir: string): string | null {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const hasFiles = (dir: string) => { try { return fs.readdirSync(dir).length > 0; } catch { return false; } };

/** Returns the absolute folder, or null for the default (data/ inside the app's folder). */
async function chooseDataDir(env: Record<string, string>): Promise<string | null> {
  const current = env.DATA_DIR ? resolveDir(env.DATA_DIR) : DEFAULT_DATA;
  console.log('  Theater keeps its settings, layouts and setup backups in a data folder.');
  console.log(`  Press Enter to keep ${current === DEFAULT_DATA ? 'the default (data/ in the app\'s folder)' : 'the current one'}` +
    `${current === DEFAULT_DATA ? '' : ', or type "default" to go back to data/ in the app\'s folder'}.`);
  let dir: string;
  for (;;) {
    const a = await ask('Data folder', current);
    dir = a.toLowerCase() === 'default' ? DEFAULT_DATA : resolveDir(a);
    const problem = usable(dir);
    if (!problem) break;
    console.log(`  Can't use ${dir}: ${problem}`);
    if (!interactive) process.exit(1);
  }
  if (path.relative(dir, current) !== '' && hasFiles(current) && !hasFiles(dir)) {
    if (await confirm(`Copy your current settings and backups from ${current}?`)) {
      fs.cpSync(current, dir, { recursive: true });
      console.log('  Copied.');
    }
  }
  return path.relative(dir, DEFAULT_DATA) === '' ? null : dir;
}

// ---------- addresses ----------
const ipNum = (ip: string) => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);

/** This computer's LAN addresses, preferring the one on the receiver's subnet. */
function lanAddresses(avrHost?: string): string[] {
  const all = Object.values(os.networkInterfaces()).flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
  if (avrHost && /^\d+\.\d+\.\d+\.\d+$/.test(avrHost)) {
    const same = all.filter((a) => {
      const mask = ipNum(a.netmask);
      return mask !== 0xffffffff && (ipNum(a.address) & mask) >>> 0 === (ipNum(avrHost) & mask) >>> 0;
    });
    if (same.length) return same.map((a) => a.address);
  }
  return all.map((a) => a.address);
}

// ---------- commands ----------
async function configure() {
  const env = readEnv(ENV_FILE);
  const host = await chooseReceiver(env);
  const info = await deviceInfo(host);
  if (info && info.model !== TESTED_MODEL) {
    console.log(`  Note: Theater has only been tested on the ${TESTED_MODEL}. On the ${info.model}, some panels may not work.`);
  }
  const port = await choosePort(env);
  console.log('');
  const telnet = await chooseTelnet(env);
  console.log('');
  const dataDir = await chooseDataDir(env);
  writeEnv({ AVR_HOST: host, PORT: String(port), AVR_TELNET: telnet, DATA_DIR: dataDir });
  console.log('');
  console.log(`  Saved to .env: receiver ${host}, port ${port}, telnet ${telnet}, data in ${dataDir ?? DEFAULT_DATA}.`);
  rl?.close();
}

function summary() {
  const env = readEnv(ENV_FILE);
  const port = Number(env.PORT) || DEFAULT_PORT;
  console.log(`  On this computer:          http://localhost:${port}`);
  for (const ip of lanAddresses(env.AVR_HOST)) console.log(`  From your phone or tablet: http://${ip}:${port}`);
}

const cmd = process.argv[2];
if (cmd === 'configure') await configure();
else if (cmd === 'summary') summary();
else {
  console.error('usage: node scripts/setup.ts configure | summary');
  process.exit(2);
}
