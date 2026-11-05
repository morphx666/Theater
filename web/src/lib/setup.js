// Client helpers for the receiver's setup API (proxied & guarded by our server).

export async function getXml(section, type, extra = {}) {
  const qs = new URLSearchParams(extra).toString();
  const res = await fetch(`/api/setup/${section}/${type}${qs ? '?' + qs : ''}`);
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).error; } catch {}
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse receiver response');
  return doc.documentElement;
}

export async function setXml(section, type, data, extra = {}) {
  const qs = new URLSearchParams(extra).toString();
  const res = await fetch(`/api/setup/${section}/${type}${qs ? '?' + qs : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

/** Escape text for inclusion in XML. */
export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Build <tag attr="v">inner</tag>. */
export function el(tag, inner = '', attrs = {}) {
  const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  return `<${tag}${a}>${inner}</${tag}>`;
}

/** Text of a child element (or null). */
export const txt = (node, sel) => node?.querySelector(sel)?.textContent?.trim() ?? null;

/** display attribute: "1" hidden, "2" greyed/locked, "3" visible+editable (per the official UI). */
export const shown = (node) => node && node.getAttribute('display') !== '1';
export const editable = (node) => node && (node.getAttribute('display') ?? '3') === '3';
