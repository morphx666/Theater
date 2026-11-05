// Decodes the receiver's HDMI signal info into display text.
//
// Resolution and HDR arrive as text over telnet (SYSDVIN 4K24, SSINFSIGHDR IHDR10). Color space and
// pixel depth arrive as undocumented one-digit codes per side (SSINFSIGCOS 99 = input 9, output 9).
// Only the Information web page (general type 12) shows them as text, and that page takes ~30 s and
// freezes the receiver's setup server while it loads. So we keep a code table, seeded with codes we
// have confirmed, and learn new codes by reading the Information page once when an unknown one shows up.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { VideoSignal } from './parse.ts';

export type CodeTable = { cos: Record<string, string>; pix: Record<string, string> };

// Confirmed on the AVR-X1700H by comparing telnet codes with the Information page.
const SEED: CodeTable = {
  cos: { '9': 'BT.2020' },
  pix: { '2': '10bits' },
};

export type Side = { res: string | null; hdr: string | null; color: string | null; depth: string | null; frl: string | null };
export type VideoInfo = { in: Side; out: Side; unknown: boolean } | null;

const blank = (v: string | null | undefined) => (!v || /^-+$/.test(v.trim()) ? null : v.trim());

export function decodeVideo(v: VideoSignal, codes: CodeTable): VideoInfo {
  if (!blank(v.resIn) && !blank(v.resOut)) return null; // no HDMI video
  let unknown = false;
  const look = (table: Record<string, string>, code: string | null, i: number) => {
    const c = code?.[i];
    if (c == null) return null;
    if (table[c] != null) return blank(table[c]);
    unknown = true;
    return null;
  };
  const side = (i: 0 | 1): Side => ({
    res: blank(i ? v.resOut : v.resIn),
    hdr: blank(i ? v.hdrOut : v.hdrIn),
    color: look(codes.cos, v.cos, i),
    depth: look(codes.pix, v.pix, i),
    frl: blank(i ? v.frlOut : v.frlIn),
  });
  const r = { in: side(0), out: side(1) };
  return { ...r, unknown };
}

/** "BT.2020 -> BT.2020" from the Information XML -> ["BT.2020", "BT.2020"] */
function pair(xml: string, tag: string): [string, string] | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  if (!m) return null;
  const parts = m[1].replace(/&gt;/g, '>').split('->').map((s) => s.trim());
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

/** Map each code digit to the label shown on the Information page. Returns true if anything was added. */
export function learnFromInformation(xml: string, v: VideoSignal, codes: CodeTable): boolean {
  let added = false;
  for (const [key, tag] of [['cos', 'ColorSpace'], ['pix', 'PixelDepth']] as const) {
    const code = v[key];
    const labels = pair(xml, tag);
    if (!code || code.length !== 2 || !labels) continue;
    for (const i of [0, 1]) {
      const c = code[i];
      if (codes[key][c] != null) continue;
      codes[key][c] = labels[i];
      added = true;
    }
  }
  return added;
}

export async function loadCodes(dataDir: string): Promise<CodeTable> {
  try {
    const f = JSON.parse(await fs.readFile(path.join(dataDir, 'signal-codes.json'), 'utf8'));
    return { cos: { ...SEED.cos, ...f.cos }, pix: { ...SEED.pix, ...f.pix } };
  } catch {
    return { cos: { ...SEED.cos }, pix: { ...SEED.pix } };
  }
}

export async function saveCodes(dataDir: string, codes: CodeTable): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'signal-codes.json'), JSON.stringify(codes, null, 2));
}
