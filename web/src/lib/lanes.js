// Svelte action: "grid lanes" (masonry) layout for a container of panels.
//
// Each child goes into the currently shortest column, in DOM order, so there are no row gaps.
// Children with class "wide" span every column.
//
// Browsers that support CSS `display: grid-lanes` use it natively (pure CSS, see app.css).
// Elsewhere this action reproduces the same rule on a regular CSS grid: 1px rows, and every child gets an
// explicit grid-column / grid-row span computed from its measured height. Children stay in one container,
// so components are never re-mounted when the layout changes.
//
// Option `animate`: when true, children glide to their new spots (FLIP animation) whenever the layout
// changes — used while customizing Home so re-ordering is easy to follow.

const NATIVE = typeof CSS !== 'undefined' && CSS.supports?.('display', 'grid-lanes');
const DURATION = 280;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function lanes(node, opts = {}) {
  let { min = 340, gap = 16, animate = false, hints = null, spans = null } = opts;
  let raf = 0;
  const heights = new Map();
  const lastPos = new WeakMap(); // child -> {x, y} relative to container (native mode only)
  const target = new WeakMap(); // child -> settled position it is currently animating towards

  // ---- FLIP helpers ----
  const children = () => [...node.children].filter((c) => {
    const cs = getComputedStyle(c);
    return cs.display !== 'none' && cs.position !== 'fixed' && cs.position !== 'absolute'; // skip open dialogs
  });

  function snapshot() {
    // Visual positions (include any running animation's transform), viewport coordinates.
    return new Map(children().map((c) => [c, c.getBoundingClientRect()]));
  }

  function play(first, fresh = new Set()) {
    if (!animate || reducedMotion()) return;
    const moving = [];
    for (const c of children()) {
      if (c.classList.contains('dragging')) continue; // follows the pointer instead
      if (fresh.has(c)) {
        c.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: DURATION, easing: EASING });
        continue;
      }
      const a = first.get(c);
      if (!a) continue;
      // Destination unchanged and already sliding there? Let it finish instead of restarting (prevents jitter).
      const dest = `${c.offsetLeft},${c.offsetTop},${c.offsetWidth}`;
      const running = c.getAnimations().length > 0;
      if (running && target.get(c) === dest) continue;
      target.set(c, dest);
      c.getAnimations().forEach((x) => x.cancel()); // measure the true new spot
      const b = c.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      moving.push({ c, dx, dy, dist: Math.hypot(dx, dy) });
    }
    // Draw the panel the user is moving (class "active") on top, then the ones that travel furthest.
    const rank = (m) => (m.c.classList.contains('active') ? 1e9 : 0) + m.dist;
    moving.sort((x, y) => rank(x) - rank(y)).forEach(({ c, dx, dy }, i) => {
      c.style.position = 'relative';
      c.style.zIndex = String(i + 1);
      const anim = c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: DURATION, easing: EASING });
      anim.onfinish = anim.oncancel = () => { c.style.zIndex = ''; };
    });
  }

  // ---- native grid-lanes ----
  // (Column hints need the JS engine: it assigns explicit lanes and reports them back via data-lane.)
  if (NATIVE && !('hints' in opts)) {
    node.classList.add('lanes-native');
    const rel = (c) => {
      const r = c.getBoundingClientRect();
      const p = node.getBoundingClientRect();
      return { left: r.left - p.left, top: r.top - p.top };
    };
    const record = () => { for (const c of node.children) lastPos.set(c, rel(c)); };
    const mo = new MutationObserver(() => {
      // DOM already moved: use the positions recorded before the change as "first".
      const p = node.getBoundingClientRect();
      const first = new Map();
      for (const c of children()) {
        const old = lastPos.get(c);
        if (old) first.set(c, { left: old.left + p.left, top: old.top + p.top });
      }
      play(first);
      record();
    });
    mo.observe(node, { childList: true });
    requestAnimationFrame(record);
    return {
      update(o) { ({ min = 340, gap = 16, animate = false, hints = null, spans = null } = o ?? {}); },
      destroy() { mo.disconnect(); node.classList.remove('lanes-native'); },
    };
  }

  // ---- JS fallback ----
  node.classList.add('lanes-js');

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
    // Moved DOM nodes keep their old explicit grid placement until we re-assign it below,
    // so this snapshot is exactly where everything currently appears on screen.
    const first = animate ? snapshot() : null;

    const cols = Math.max(1, Math.floor((width + gap) / (Math.min(min, width) + gap)));
    node.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    node.style.columnGap = `${gap}px`;
    const lane = new Array(cols).fill(0); // current height of each lane, in px
    const fresh = new Set(children().filter((c) => !c.style.gridRow)); // just added: nothing to glide from
    for (const c of children()) {
      const h = Math.ceil(Math.max(1, c.offsetHeight)); // offsetHeight ignores transforms
      const id = c.dataset.slot;
      // Width in columns: the user's choice, else full width for "wide" panels, else 1.
      const want = spans?.[id] ?? (c.classList.contains('wide') ? cols : 1);
      const span = Math.max(1, Math.min(cols, Number(want) || 1));
      // Start column: the user's choice (clamped so the panel fits), else wherever it sits highest.
      const hint = hints?.[id];
      let start = 0;
      if (Number.isInteger(hint) && hint >= 0 && hint < cols) start = Math.min(hint, cols - span);
      else {
        let bestTop = Infinity;
        for (let i = 0; i <= cols - span; i++) {
          const t = Math.max(...lane.slice(i, i + span));
          if (t < bestTop - 1) { bestTop = t; start = i; } // earliest wins ties
        }
      }
      const top = Math.max(...lane.slice(start, start + span));
      c.dataset.lane = String(start);
      c.dataset.span = String(span);
      c.style.gridColumn = `${start + 1} / span ${span}`;
      c.style.gridRow = `${top + 1} / span ${h}`;
      for (let i = start; i < start + span; i++) lane[i] = top + h + gap;
    }
    if (first) play(first, fresh);
    node.dispatchEvent(new CustomEvent('laneslayout', { detail: { cols } })); // lets a dragged panel re-anchor in the same frame
  }

  ro.observe(node);
  mo.observe(node, { childList: true });
  observeChildren();
  layout();

  return {
    update(o) { ({ min = 340, gap = 16, animate = false, hints = null, spans = null } = o ?? {}); schedule(); },
    destroy() {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf);
      node.classList.remove('lanes-js');
      for (const c of node.children) { c.style.gridColumn = ''; c.style.gridRow = ''; }
    },
  };
}
