// Minimal rAF tween, enough for the four transitions the anatomy viewer runs
// (organ fade-in, cross-section sweep, camera framing, wireframe cross-fade).
//
// The explorer this page is ported from uses gsap for these. gsap is ~50 kB and
// Mwalimu carries no animation dependency; four eased interpolations do not
// justify adding one to a platform that ships over a school LAN.

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Runs `onUpdate(value)` from `from` to `to` over `duration` seconds.
 * Returns a cancel function; calling it stops the tween where it stands.
 */
export function tween({ from, to, duration = 0.5, ease = easeOutCubic, onUpdate, onComplete }) {
  let raf = 0;
  let cancelled = false;
  const start = performance.now();
  const span = Math.max(duration * 1000, 1);

  const step = (now) => {
    if (cancelled) return;
    const t = Math.min((now - start) / span, 1);
    onUpdate?.(from + (to - from) * ease(t));
    if (t < 1) {
      raf = requestAnimationFrame(step);
      return;
    }
    onComplete?.();
  };
  raf = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}
