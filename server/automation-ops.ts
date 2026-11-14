// Comparison operators for automation conditions. Pure and dependency-free, so the editor can reuse it for its
// live ✔ / ✘ (see docs/AUTOMATION.md §3).

export type PropType = 'number' | 'enum' | 'bool' | 'text' | 'set';
export type Value = number | string | boolean | string[] | null;

/** Operators allowed for each property type. `known` / `unknown` work for every type. */
export const OPS: Record<PropType, string[]> = {
  number: ['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'between', 'known', 'unknown'],
  enum: ['is', 'isNot', 'in', 'notIn', 'known', 'unknown'],
  bool: ['isOn', 'isOff', 'known', 'unknown'],
  text: ['is', 'isNot', 'contains', 'notContains', 'startsWith', 'known', 'unknown'],
  set: ['has', 'hasNot', 'hasAny', 'hasAll', 'empty', 'notEmpty', 'known', 'unknown'],
};

/** What kind of argument an operator takes: nothing, one value, a [lo, hi] pair, or a list. */
export function argKind(op: string): 'none' | 'one' | 'pair' | 'list' {
  if (['known', 'unknown', 'isOn', 'isOff', 'empty', 'notEmpty'].includes(op)) return 'none';
  if (op === 'between') return 'pair';
  if (['in', 'notIn', 'hasAny', 'hasAll'].includes(op)) return 'list';
  return 'one';
}

const EPS = 1e-6;
const lc = (s: unknown) => String(s).toLowerCase();

/** Equal values: numbers within rounding, sets regardless of order. */
export function sameValue(a: Value | undefined, b: Value | undefined): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const s = new Set(a);
    return b.every((x) => s.has(x));
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < EPS;
  return a === b;
}

/** Evaluate `value <op> arg`. An unknown value (null) is false for everything except `unknown`. */
export function compare(type: PropType, value: Value, op: string, arg?: unknown): boolean {
  if (op === 'unknown') return value === null || value === undefined;
  if (value === null || value === undefined) return false;
  if (op === 'known') return true;
  switch (type) {
    case 'number': {
      const v = Number(value);
      const a = Number(arg);
      switch (op) {
        case 'eq': return Math.abs(v - a) < EPS;
        case 'ne': return Math.abs(v - a) >= EPS;
        case 'lt': return v < a - EPS;
        case 'le': return v <= a + EPS;
        case 'gt': return v > a + EPS;
        case 'ge': return v >= a - EPS;
        case 'between': {
          const [lo, hi] = (arg as number[]).map(Number);
          return v >= Math.min(lo, hi) - EPS && v <= Math.max(lo, hi) + EPS;
        }
      }
      return false;
    }
    case 'enum':
      switch (op) {
        case 'is': return value === arg;
        case 'isNot': return value !== arg;
        case 'in': return (arg as string[]).includes(value as string);
        case 'notIn': return !(arg as string[]).includes(value as string);
      }
      return false;
    case 'bool':
      return op === 'isOn' ? value === true : op === 'isOff' ? value === false : false;
    case 'text': {
      const v = lc(value), a = lc(arg);
      switch (op) {
        case 'is': return v === a;
        case 'isNot': return v !== a;
        case 'contains': return v.includes(a);
        case 'notContains': return !v.includes(a);
        case 'startsWith': return v.startsWith(a);
      }
      return false;
    }
    case 'set': {
      const v = value as string[];
      switch (op) {
        case 'has': return v.includes(arg as string);
        case 'hasNot': return !v.includes(arg as string);
        case 'hasAny': return (arg as string[]).some((x) => v.includes(x));
        case 'hasAll': return (arg as string[]).every((x) => v.includes(x));
        case 'empty': return v.length === 0;
        case 'notEmpty': return v.length > 0;
      }
      return false;
    }
  }
  return false;
}
