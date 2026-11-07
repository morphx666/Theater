// Input signal channels and active speakers, as the receiver's on-screen "Information" bar shows them.
// AppCommand0300 on HTTP 8080 returns both as a 5x4 grid of named cells (columns a-e, rows 1-4):
//   <param name="inputsiga1" control="1">FHL</param>   control 0 = empty cell, 1 = present but not in
//   <param name="activespb2" control="2">FL</param>    the signal / not playing, 2 = active.
// The telnet push for this (OPINFASP / OPINFINS) is undocumented, so the server reads it over HTTP.

export type Cell = { ch: string; on: boolean } | null;
export type Grid = Cell[][]; // rows, each 5 cells
export type AudioMap = { input: Grid; output: Grid } | null;

const BODY = [
  '<?xml version="1.0" encoding="utf-8"?>', '<tx>',
  '<cmd id="3">', '<name>GetInputSignal</name>', '<list>', '<param name="inputsigall"/>', '</list>', '</cmd>',
  '<cmd id="3">', '<name>GetActiveSpeaker</name>', '<list>', '<param name="activespall"/>', '</list>', '</cmd>',
  '</tx>', '', // the body must be newline-separated
].join('\n');

/** Reads the grid for one prefix ("inputsig" or "activesp"). Trailing empty rows are dropped. */
export function parseGrid(xml: string, prefix: string): Grid {
  const rows: Cell[][] = [1, 2, 3, 4].map(() => [null, null, null, null, null]);
  const re = new RegExp(`<param name="${prefix}([a-e])([1-4])" control="(\\d)">([^<]*)</param>`, 'g');
  for (const m of xml.matchAll(re)) {
    const ch = m[4].trim();
    if (m[3] === '0' || !ch) continue;
    rows[Number(m[2]) - 1][m[1].charCodeAt(0) - 97] = { ch, on: m[3] === '2' };
  }
  while (rows.length && rows[rows.length - 1].every((c) => !c)) rows.pop();
  return rows;
}

export function parseAudioMap(xml: string): AudioMap {
  const input = parseGrid(xml, 'inputsig'), output = parseGrid(xml, 'activesp');
  return input.length || output.length ? { input, output } : null;
}

export async function fetchAudioMap(host: string, port = 8080): Promise<AudioMap> {
  const res = await fetch(`http://${host}:${port}/goform/AppCommand0300.xml`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: BODY, signal: AbortSignal.timeout(5000),
  });
  return parseAudioMap(await res.text());
}
