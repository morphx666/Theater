// Reactive loader for one receiver setup page: { doc, loading, error, reload(), write(xml) }.
import { getXml, setXml } from './setup.js';
import { toast } from './avr.svelte.js';

export function useSetup(section, type, { reloadDelay = 700 } = {}) {
  const s = $state({ doc: null, loading: true, error: null, saving: false });

  async function reload(extra) {
    s.loading = true;
    try {
      s.doc = await getXml(section, type, extra);
      s.error = null;
    } catch (e) {
      s.error = e.message;
    } finally {
      s.loading = false;
    }
  }

  /** Write a payload, then re-read (the receiver may change dependent fields). */
  async function write(xml, { quiet = false, delay = reloadDelay } = {}) {
    s.saving = true;
    try {
      await setXml(section, type, xml);
      if (!quiet) toast('Saved to receiver');
      await new Promise((r) => setTimeout(r, delay));
      await reload();
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    } finally {
      s.saving = false;
    }
  }

  reload();
  return Object.assign(s, { reload, write });
}
