// Master volume, shared by the Volume panel's dial and the compact control in the top bar.
// Holds the optimistic value shown while dragging (until the receiver reports back), never asks
// for more than the cap or the receiver's own maximum, and throttles what is sent.
import { avr, send, vol2 } from './avr.svelte.js';
import { throttle } from './controls.svelte.js';

export const MIN = -80;

const s = $state({ local: null, dragging: false });
let clearTimer;
const sendVol = throttle((db) => send('MV' + vol2(db)), 130);

// Show the value we asked for until the receiver catches up (or for 0.9 s after the last change).
function holdLocal() {
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => { if (!s.dragging) s.local = null; }, 900);
}

let repeat;

export const volume = {
  /** Top of the scale: the receiver's maximum for the current signal (manual p.69), at most +18 dB. */
  get max() { return Math.min(18, avr.state?.volumeMax ?? 18); },
  get cap() { return avr.cap; },
  /** Highest value the app will ask for. */
  get top() { return Math.min(avr.cap, this.max); },
  get value() { return s.local ?? avr.state?.volume ?? MIN; },
  get dragging() { return s.dragging; },
  set dragging(d) { s.dragging = d; if (!d) holdLocal(); },

  set(db) {
    db = Math.round(db * 2) / 2;
    db = Math.max(MIN, Math.min(this.top, db));
    s.local = db;
    holdLocal();
    sendVol(db);
  },
  step(dir) {
    this.set(this.value + dir * (avr.settings?.volumeStep ?? 0.5));
  },
  /** Hold-to-repeat for −/+ buttons: one step now, then faster and faster until release(). */
  hold(dir) {
    clearTimeout(repeat);
    this.step(dir);
    let delay = 350;
    const tick = () => { this.step(dir); delay = Math.max(90, delay * 0.75); repeat = setTimeout(tick, delay); };
    repeat = setTimeout(tick, delay);
  },
  release() { clearTimeout(repeat); },
};
