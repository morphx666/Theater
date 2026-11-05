// Tuner preset names and "skip" flags, which telnet can't change. They go through the receiver's AppCommand API
// (port 8080), found by probing; the device descriptor lists SetPresetName / SetPresetNameDefault / SetPresetSkip:
//
//   <cmd id="1">GetTunerPresetSkip</cmd>   <presetno>NN</presetno>                      -> <value>ON|OFF</value>
//   <cmd id="1">SetTunerPresetSkip</cmd>   <presetno>NN</presetno> <value>ON|OFF</value> -> <value>OK</value>
//   <cmd id="1">GetTunerPresetName</cmd>   <presetno>NN</presetno>                      -> <value>8 chars</value>
//   <cmd id="1">SetTunerPresetName</cmd>   <presetno>NN</presetno> <value>name</value>   -> <value>OK</value>
//   <cmd id="1">SetTunerPresetNameDefault</cmd> <presetno>NN</presetno>                 -> OK (blank name)
//
// One command per request (a second one in the same <tx> comes back empty). Writes take effect ~1 s later.
// The receiver has no "delete": a skipped preset is hidden from preset up/down and the on-screen list,
// which is what the app presents as an empty slot.

export const PRESET_COUNT = 56;
export const pad = (n: number) => String(n).padStart(2, '0');
export const validPreset = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= PRESET_COUNT;
/** Names: up to 8 printable ASCII characters (the receiver's limit), minus XML-special < > & to be safe on its display. */
export const validName = (s: unknown): s is string => typeof s === 'string' && /^[\x20-\x7E]{0,8}$/.test(s) && !/[<>&]/.test(s);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class TunerPresets {
  private chain: Promise<unknown> = Promise.resolve();
  private host: string;
  constructor(host: string) { this.host = host; }

  private call(cmd: string, n: number, value?: string): Promise<string | null> {
    const body = ['<?xml version="1.0" encoding="utf-8"?>', '<tx>', `<cmd id="1">${cmd}</cmd>`, `<presetno>${pad(n)}</presetno>`,
      ...(value !== undefined ? [`<value>${esc(value)}</value>`] : []), '</tx>', ''].join('\n'); // newline-separated, or the AVR ignores it
    const run = async () => {
      const res = await fetch(`http://${this.host}:8080/goform/AppCommand.xml`, {
        method: 'POST', headers: { 'Content-Type': 'text/xml' }, body, signal: AbortSignal.timeout(5000),
      });
      const text = await res.text();
      if (/<error>/.test(text)) throw new Error(`receiver rejected ${cmd}`);
      return text.match(/<value>([^<]*)<\/value>/)?.[1] ?? (/<cmd>OK<\/cmd>/.test(text) ? 'OK' : null);
    };
    const p = this.chain.then(run, run); // one request at a time
    this.chain = p.catch(() => {});
    return p;
  }

  /** Preset numbers ("01".."56") that are skipped. */
  async skipped(): Promise<string[]> {
    const out: string[] = [];
    for (let n = 1; n <= PRESET_COUNT; n++) if ((await this.call('GetTunerPresetSkip', n)) === 'ON') out.push(pad(n));
    return out;
  }

  async setSkip(n: number, on: boolean): Promise<void> {
    if (!validPreset(n)) throw new Error('bad preset');
    await this.call('SetTunerPresetSkip', n, on ? 'ON' : 'OFF');
  }

  async rename(n: number, name: string): Promise<void> {
    if (!validPreset(n) || !validName(name)) throw new Error('bad preset name');
    if (name.trim() === '') await this.call('SetTunerPresetNameDefault', n);
    else await this.call('SetTunerPresetName', n, name);
  }
}
