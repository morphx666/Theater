// Dims the whole UI after a while without input (see IdleDimmer.svelte); the next input wakes it.
// Per device on purpose (localStorage): a screen by the TV wants it, a phone may not.

const KEY = 'theater.idle';
const DEFAULTS = { minutes: 5, level: 'dim' }; // minutes 0 = never; level: dim | dark | black

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS }; // storage blocked (private mode etc.)
  }
}

export const idle = $state({ dimmed: false, ...load() });

let timer;
let lastArm = 0;

/** (Re)start the countdown. */
function arm() {
  clearTimeout(timer);
  lastArm = Date.now();
  if (idle.minutes > 0) timer = setTimeout(() => (idle.dimmed = true), idle.minutes * 60_000);
}

/** Any input while awake: restart the countdown (at most once a second; input events come in bursts). */
export function activity() {
  if (!idle.dimmed && Date.now() - lastArm > 1000) arm();
}

export function wake() {
  idle.dimmed = false;
  arm();
}

/** Change this device's settings, e.g. setIdle({ minutes: 15 }). */
export function setIdle(patch) {
  Object.assign(idle, patch);
  try { localStorage.setItem(KEY, JSON.stringify({ minutes: idle.minutes, level: idle.level })); } catch {}
  wake();
}
