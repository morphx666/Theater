// Svelte action: "grid lanes" (masonry) layout for a container of panels.
//
// Each child goes into the currently shortest column, in DOM order, so there are no row gaps.
// Children with class "wide" span every column.
//
// Browsers that support CSS `display: grid-lanes` use it natively (pure CSS, see app.css).
// Elsewhere this action reproduces the same rule on a regular CSS grid: 1px rows, and every child gets an
// explicit grid-column / grid-row span computed from its measured height. Children stay in one container,
// so components are never re-mounted when the layout changes.

const NATIVE = typeof CSS !== 'undefined' && CSS.supports?.('display', 'grid-lanes');

export function lanes(node, { min = 340, gap = 16 } = {}) {
  if (NATIVE) {
    node.classList.add('lanes-native');
    return { destroy() { node.classList.remove('lanes-native'); } };
  }

  node.classList.add('lanes-js');
  let raf = 0;
  const heights = new Map();

  const ro = new ResizeObserver((entries) => {
    let changed = false;
    for (const e of entries) {
      if (e.target === node) { changed = true; continue; }
      const h = Math.ceil(e.borderBoxSize?.[0]?.blockSize ?? e.target.getBoundingClientRect().height);
      if (heights.get(e.target) !== h) { heights.set(e.target, h); changed = true; }
    }
    if (changed) schedule();
  });

  const mo = new MutationObserver(() => { observeChildren(); schedule(); });

  function observeChildren() {
    for (const c of node.children) {
      if (!heights.has(c)) { heights.set(c, -1); ro.observe(c); }
    }
    for (const c of heights.keys()) if (c.parentNode !== node) { ro.unobserve(c); heights.delete(c); }
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(layout);
  }

  function layout() {
    raf = 0;
    const width = node.clientWidth;
    if (!width) return;
    const cols = Math.max(1, Math.floor((width + gap) / (Math.min(min, width) + gap)));
    node.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    node.style.columnGap = `${gap}px`;
    const lane = new Array(cols).fill(0); // current height of each lane, in px
    for (const c of node.children) {
      const cs = getComputedStyle(c);
      if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'absolute') continue; // e.g. open dialogs
      const h = Math.max(1, c.getBoundingClientRect().height);
      if (c.classList.contains('wide') || cols === 1) {
        const top = Math.max(...lane);
        c.style.gridColumn = '1 / -1';
        c.style.gridRow = `${top + 1} / span ${Math.ceil(h)}`;
        lane.fill(top + Math.ceil(h) + gap);
      } else {
        let best = 0;
        for (let i = 1; i < cols; i++) if (lane[i] < lane[best] - 1) best = i; // shortest lane, earliest wins ties
        c.style.gridColumn = `${best + 1}`;
        c.style.gridRow = `${lane[best] + 1} / span ${Math.ceil(h)}`;
        lane[best] += Math.ceil(h) + gap;
      }
    }
  }

  ro.observe(node);
  mo.observe(node, { childList: true });
  observeChildren();
  layout();

  return {
    update(opts) { ({ min = 340, gap = 16 } = opts ?? {}); schedule(); },
    destroy() {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf);
      node.classList.remove('lanes-js');
      for (const c of node.children) { c.style.gridColumn = ''; c.style.gridRow = ''; }
    },
  };
}
