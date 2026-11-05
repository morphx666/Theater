// Small helpers shared by pages.

/** Returns a function that calls `fn` at most every `ms`, always delivering the last value. */
export function throttle(fn, ms = 120) {
  let last = 0, timer = null, pendingArgs = null;
  return (...args) => {
    pendingArgs = args;
    const now = Date.now();
    const run = () => { last = Date.now(); timer = null; fn(...pendingArgs); };
    if (now - last >= ms) run();
    else if (!timer) timer = setTimeout(run, ms - (now - last));
  };
}

/** CSS fill percentage for a range input. */
export const fill = (v, min, max) => `${((v - min) / (max - min)) * 100}%`;
