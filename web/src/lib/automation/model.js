// Pure helpers for the automation editor: new blocks, moving blocks around the tree, labels, the one-line
// summary, and a light completeness check. The server validates every save (server/automation.ts); the
// operator lists come from the same module the server uses, so the two can't drift apart.
import { OPS, argKind, RELATIVE_MAX_DB } from '../../../../server/automation-ops.ts';

export { OPS, argKind, RELATIVE_MAX_DB };

/** A volume action's "to" (a fixed value) or "by" (a change of at most RELATIVE_MAX_DB): switch it, with safe
 *  starting values (to: -40 dB, only lower; by: -3 dB). */
export const RELATIVE_START = -3;
export function setRelative(node, def, on) {
  if (on) { node.relative = true; node.value = RELATIVE_START; delete node.onlyLower; }
  else { delete node.relative; node.value = defaultValue(def, true); if (def.onlyLower) node.onlyLower = true; }
}
/** The field for a "change by" amount: the property, limited to ±RELATIVE_MAX_DB. */
export const changeDef = (def) => def && { ...def, min: -RELATIVE_MAX_DB, max: RELATIVE_MAX_DB };
const signed = (v) => (typeof v === 'number' && v > 0 ? `+${v}` : v);

export const OP_LABELS = {
  eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥', between: 'between',
  is: 'is', isNot: 'is not', in: 'is one of', notIn: 'is none of',
  isOn: 'is on', isOff: 'is off',
  contains: 'contains', notContains: "doesn't contain", startsWith: 'starts with',
  has: 'has', hasNot: "doesn't have", hasAny: 'has any of', hasAll: 'has all of', empty: 'is empty', notEmpty: 'is not empty',
  known: 'is known', unknown: 'is unknown',
};

/** Block categories (Scratch-style colors in Editor.svelte). */
export const CATEGORY = { change: 'event', becomes: 'event', set: 'action', findMode: 'sound', if: 'control', wait: 'control', waitUntil: 'control', stop: 'control' };

/** A sensible starting value for a property. Volumes start quiet (-40 dB), never at 0 dB. */
export const SAFE_VOLUME = -40;
export function defaultValue(def, forWrite = false) {
  if (!def) return null;
  switch (def.type) {
    case 'number': return def.onlyLower ? SAFE_VOLUME : Math.min(def.max ?? 0, Math.max(def.min ?? 0, 0));
    case 'enum': return def.options?.[0]?.value ?? null;
    case 'bool': return true;
    case 'text': return forWrite ? def.writeOptions?.[0]?.value ?? '' : '';
    default: return null;
  }
}

export function newBlock(type, catalog, prop) {
  switch (type) {
    case 'set': {
      const def = catalog.find((p) => p.id === prop) ?? catalog.find((p) => p.writable);
      // A new volume action starts quiet and with "only lower" on, so it can never turn things up by surprise.
      return { type: 'set', prop: def.id, ...(def.param ? { param: def.param.options[0]?.value } : {}), value: defaultValue(def, true), ...(def.onlyLower ? { onlyLower: true } : {}) };
    }
    case 'if': return { type: 'if', cond: null, then: [], else: [] };
    case 'wait': return { type: 'wait', ms: 2000 };
    case 'waitUntil': return { type: 'waitUntil', cond: null, timeoutMs: 10000, onTimeout: 'continue' };
    case 'findMode': return { type: 'findMode', text: 'Neural:X', onNotFound: 'back' };
    case 'stop': return { type: 'stop' };
  }
}

export function newCond(type, catalog) {
  switch (type) {
    case 'cmp': {
      const def = catalog.find((p) => p.id === 'volume') ?? catalog.find((p) => !p.writeOnly);
      return { type: 'cmp', prop: def.id, op: OPS[def.type][0], value: defaultValue(def) };
    }
    case 'channels': return { type: 'channels', of: 'input', present: [], absent: [] };
    case 'all': return { type: 'all', items: [] };
    case 'any': return { type: 'any', items: [] };
    case 'not': return { type: 'not', item: null };
  }
}

export function newTrigger(type, catalog) {
  if (type === 'becomes') return { type: 'becomes', cond: null };
  const def = catalog.find((p) => p.id === 'input') ?? catalog[0];
  return { type: 'change', prop: def.id };
}

export function blankRule(catalog) {
  return { name: 'New automation', enabled: true, when: [newTrigger('change', catalog)], script: [] };
}

/** Make a comparison / set / trigger fit a newly picked property: keep the operator and value when they still fit. */
export function fitToProp(node, def, kind) {
  if (def.param) node.param = def.param.options.some((o) => o.value === node.param) ? node.param : def.param.options[0]?.value;
  else delete node.param;
  if (kind === 'cmp') {
    if (!OPS[def.type].includes(node.op)) node.op = OPS[def.type][0];
    fitValue(node, def);
  } else if (kind === 'set') {
    delete node.relative;
    node.value = defaultValue(def, true);
    if (def.onlyLower) node.onlyLower = true; else delete node.onlyLower;
  } else if (kind === 'change') {
    delete node.from; delete node.to;
  }
}

/** The value a comparison needs for its operator: nothing, one value, a pair or a list. */
export function fitValue(node, def) {
  const kind = argKind(node.op);
  const one = defaultValue(def);
  if (kind === 'none') delete node.value;
  else if (kind === 'pair') node.value = Array.isArray(node.value) && node.value.length === 2 ? node.value : [one, def.max ?? one];
  else if (kind === 'list') node.value = Array.isArray(node.value) ? node.value : one != null ? [one] : [];
  else if (Array.isArray(node.value) || node.value === undefined) node.value = def.type === 'set' ? 'C' : one;
}

// ---------- paths: a list is addressed by keys from the rule (['script'], ['script', 2, 'then']) ----------

export function listAt(rule, path) {
  let x = rule;
  for (const k of path) x = x[k];
  return x;
}

const startsWith = (a, b) => b.every((k, i) => a[i] === k);

/** Move the block at (fromList, fromIndex) to (toList, toIndex). Refuses to drop a block inside itself. */
export function moveBlock(rule, fromList, fromIndex, toList, toIndex) {
  if (startsWith(toList, [...fromList, fromIndex])) return false;
  const src = listAt(rule, fromList);
  const [b] = src.splice(fromIndex, 1);
  let at = toIndex;
  if (fromList.length === toList.length && startsWith(toList, fromList) && fromIndex < toIndex) at--;
  listAt(rule, toList).splice(at, 0, b);
  return true;
}

export function insertBlock(rule, toList, toIndex, block) {
  listAt(rule, toList).splice(toIndex, 0, block);
}

// ---------- words ----------

export const fmtMs = (ms) => `${Math.round(ms / 100) / 10} s`;

export function valueText(def, v) {
  if (v === undefined || v === null || v === '') return '…';
  if (Array.isArray(v)) return v.map((x) => valueText(def, x)).join(', ');
  if (def?.type === 'bool') return v ? 'on' : 'off';
  const opt = def?.options?.find((o) => o.value === v) ?? def?.writeOptions?.find((o) => o.value === v);
  if (opt) return opt.label;
  return def?.unit ? `${v} ${def.unit}` : String(v);
}

function propText(def, param) {
  return def ? `${def.label}${param ? ` ${param}` : ''}` : '?';
}

export function condText(c, catalog) {
  if (!c) return '…';
  switch (c.type) {
    case 'cmp': {
      const def = catalog.find((p) => p.id === c.prop);
      const v = argKind(c.op) === 'pair' ? `${valueText(def, c.value?.[0])} and ${valueText(def, c.value?.[1])}` : argKind(c.op) === 'none' ? '' : ` ${valueText(def, c.value)}`;
      return `${propText(def, c.param)} ${OP_LABELS[c.op] ?? c.op}${argKind(c.op) === 'pair' ? ` ${v}` : v}`;
    }
    case 'channels': {
      const parts = [c.present.length && `${c.present.join(' ')} present`, c.absent.length && `${c.absent.join(' ')} absent`].filter(Boolean);
      return `${c.of === 'input' ? 'input' : 'speakers'} ${parts.join(', ') || '…'}`;
    }
    case 'all': case 'any': return c.items.map((x) => condText(x, catalog)).join(c.type === 'all' ? ' and ' : ' or ') || '…';
    case 'not': return `not (${condText(c.item, catalog)})`;
  }
  return '?';
}

export function triggerText(t, catalog) {
  if (t.type === 'becomes') return `${condText(t.cond, catalog)} becomes true`;
  const def = catalog.find((p) => p.id === t.prop);
  return `${propText(def, t.param)} changes${t.from !== undefined ? ` from ${valueText(def, t.from)}` : ''}${t.to !== undefined ? ` to ${valueText(def, t.to)}` : ''}`;
}

function blocksText(list, catalog, out) {
  for (const b of list) {
    if (out.length > 4) return;
    const def = catalog.find((p) => p.id === b.prop);
    switch (b.type) {
      case 'set': out.push(b.relative ? `change ${propText(def, b.param)} by ${valueText(def, signed(b.value))}` : `set ${propText(def, b.param)} to ${valueText(def, b.value)}`); break;
      case 'findMode': out.push(`find sound mode "${b.text}"`); break;
      case 'if': out.push(`if ${condText(b.cond, catalog)}`); blocksText(b.then, catalog, out); break;
      case 'wait': out.push(`wait ${fmtMs(b.ms)}`); break;
      case 'waitUntil': out.push(`wait until ${condText(b.cond, catalog)}`); break;
      case 'stop': out.push('stop'); break;
    }
  }
}

/** "When Input changes to Blu-ray · wait until … · set Dialog Enhancer to Medium" */
export function summary(rule, catalog) {
  if (!catalog?.length) return '';
  const when = rule.when.map((t) => triggerText(t, catalog)).join(' or ');
  const steps = [];
  blocksText(rule.script, catalog, steps);
  return [`When ${when}`, ...steps.slice(0, 4)].join(' · ') + (steps.length > 4 ? ' …' : '');
}

// ---------- completeness (the server has the final word) ----------

function condProblems(c, catalog) {
  if (!c) return ['a condition is missing'];
  switch (c.type) {
    case 'cmp': return catalog.some((p) => p.id === c.prop) ? [] : ['unknown property'];
    case 'channels': return c.present.length || c.absent.length ? [] : ['mark at least one channel'];
    case 'all': case 'any': return c.items.length ? c.items.flatMap((x) => condProblems(x, catalog)) : ['an "all of" / "any of" is empty'];
    case 'not': return condProblems(c.item, catalog);
  }
  return [];
}

/** Problems that keep the rule from saving, as plain sentences. */
export function problems(rule, catalog) {
  const out = [];
  if (!rule.name?.trim()) out.push('Give it a name');
  if (!rule.when.length) out.push('Add a "when" trigger');
  for (const t of rule.when) if (t.type === 'becomes') out.push(...condProblems(t.cond, catalog));
  if (!rule.script.length) out.push('Add at least one block under "when"');
  const walk = (list) => {
    for (const b of list) {
      if (b.type === 'if') { out.push(...condProblems(b.cond, catalog)); walk(b.then); walk(b.else); }
      if (b.type === 'waitUntil') out.push(...condProblems(b.cond, catalog));
      if (b.type === 'findMode' && !b.text?.trim()) out.push('"find sound mode" needs some text');
    }
  };
  walk(rule.script);
  return [...new Set(out)];
}

/** True when a condition slot is incomplete (outlined red in the editor). */
export const condMissing = (c, catalog) => condProblems(c, catalog).length > 0;
