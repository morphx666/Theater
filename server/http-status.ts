// HTTP (port 8080) status polling, used only when telnet is unavailable.
// Note: AppCommand.xml requires newline-separated XML; a one-line body returns an empty <rx>.

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

export async function appCommand(host: string, cmds: string[], port = 8080): Promise<any[]> {
  const body = ['<?xml version="1.0" encoding="utf-8"?>', '<tx>', ...cmds.map((c) => `<cmd id="1">${c}</cmd>`), '</tx>', ''].join('\n');
  const res = await fetch(`http://${host}:${port}/goform/AppCommand.xml`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body, signal: AbortSignal.timeout(5000),
  });
  const xml = parser.parse(await res.text());
  const c = xml?.rx?.cmd;
  return Array.isArray(c) ? c : c ? [c] : [];
}

/** Returns telnet-style lines so the same parser can be reused. */
export async function pollAsTelnetLines(host: string): Promise<string[]> {
  const [power, vol, mute, src, sur] = await appCommand(host, [
    'GetAllZonePowerStatus', 'GetAllZoneVolume', 'GetAllZoneMuteStatus', 'GetAllZoneSource', 'GetSurroundModeStatus',
  ]);
  const lines: string[] = [];
  const v = (x: unknown) => (x == null ? '' : String(x).trim());
  if (power) {
    lines.push(v(power.zone1) === 'ON' ? 'ZMON' : 'ZMOFF');
    lines.push(v(power.zone1) === 'ON' || v(power.zone2) === 'ON' ? 'PWON' : 'PWSTANDBY');
    lines.push(v(power.zone2) === 'ON' ? 'Z2ON' : 'Z2OFF');
  }
  const toVol = (db: string) => {
    const n = Number(db);
    if (Number.isNaN(n)) return null;
    const s = n + 80;
    return s % 1 ? String(Math.floor(s)).padStart(2, '0') + '5' : String(s).padStart(2, '0');
  };
  if (vol?.zone1) { const t = toVol(v(vol.zone1.volume)); if (t) lines.push('MV' + t); }
  if (vol?.zone2) { const t = toVol(v(vol.zone2.volume)); if (t) lines.push('Z2' + t); }
  if (mute) {
    lines.push(v(mute.zone1).toLowerCase() === 'on' ? 'MUON' : 'MUOFF');
    lines.push(v(mute.zone2).toLowerCase() === 'on' ? 'Z2MUON' : 'Z2MUOFF');
  }
  if (src?.zone1?.source) lines.push('SI' + v(src.zone1.source));
  if (src?.zone2?.source) lines.push('Z2' + v(src.zone2.source));
  if (sur?.surround) lines.push('SYSMI ' + v(sur.surround));
  return lines;
}
