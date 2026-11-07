// Svelte action for a panel card: when its height or width changes, the card's box glides to the new
// size instead of jumping. The card's content sits in a single inner wrapper (display: flow-root) whose
// natural size is observed; the card's own height/width then runs from the old value to the new one
// with its content clipped. The masonry layout observes the slots every frame, so neighbours follow.
//
// Not animated: the first measurement, window resizes (those are already continuous), hidden cards,
// and prefers-reduced-motion. While the width animates, the height simply follows the reflowed content.

const DURATION = 220;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function smoothSize(node) {
  const inner = node.firstElementChild; // the content wrapper
  const host = node.parentElement; // the layout gives the card this element's width
  let h = null, w = null, vw = window.innerWidth;
  let hAnim = null, wAnim = null;

  const frame = () => {
    const cs = getComputedStyle(node);
    return parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  };

  function run(prop, from, to, prev) {
    prev?.cancel();
    const a = node.animate(
      [{ [prop]: `${from}px`, overflow: 'clip' }, { [prop]: `${to}px`, overflow: 'clip' }],
      { duration: DURATION, easing: EASING },
    );
    a.onfinish = a.oncancel = () => {
      if (hAnim === a) hAnim = null;
      if (wAnim === a) wAnim = null;
    };
    return a;
  }

  const ro = new ResizeObserver(() => {
    const nh = inner.offsetHeight + frame();
    const nw = host.clientWidth;
    const resized = window.innerWidth !== vw;
    vw = window.innerWidth;
    const still = h === null || resized || reducedMotion() || node.offsetParent === null;

    if (w !== null && Math.abs(nw - w) >= 1) {
      if (still) wAnim?.cancel();
      else wAnim = run('width', wAnim ? node.offsetWidth : w, nw, wAnim);
    }
    w = nw;

    if (h !== null && Math.abs(nh - h) >= 1) {
      if (still || wAnim) hAnim?.cancel();
      else hAnim = run('height', hAnim ? node.offsetHeight : h, nh, hAnim);
    }
    h = nh;
  });
  ro.observe(inner);
  if (host) ro.observe(host);

  return {
    destroy() {
      ro.disconnect();
      hAnim?.cancel();
      wAnim?.cancel();
    },
  };
}
