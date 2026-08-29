import { useEffect } from 'react';

const SCROLL_IDLE_MS = 280;

/**
 * Toggles `html.is-scrolling` so CSS can pause cinematic animations while the user scrolls.
 * Do not restyle glass, transforms, or visibility here — that flashes the page on every scroll.
 */
export function useScrollPerformance() {
  useEffect(() => {
    const root = document.documentElement;
    let idleTimer = 0;
    let rafId = 0;

    const markScrolling = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        if (!root.classList.contains('is-scrolling')) {
          root.classList.add('is-scrolling');
        }
      });
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        root.classList.remove('is-scrolling');
      }, SCROLL_IDLE_MS);
    };

    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('scroll', markScrolling, opts);
    window.addEventListener('wheel', markScrolling, opts);
    window.addEventListener('touchmove', markScrolling, opts);

    return () => {
      window.removeEventListener('scroll', markScrolling, opts);
      window.removeEventListener('wheel', markScrolling, opts);
      window.removeEventListener('touchmove', markScrolling, opts);
      window.clearTimeout(idleTimer);
      if (rafId) window.cancelAnimationFrame(rafId);
      root.classList.remove('is-scrolling');
    };
  }, []);
}
