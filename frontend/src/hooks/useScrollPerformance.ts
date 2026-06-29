import { useEffect } from 'react';

/**
 * Pauses heavy cinematic backdrop animations while the user scrolls to reduce jank.
 */
export function useScrollPerformance() {
  useEffect(() => {
    const root = document.documentElement;
    let idleTimer = 0;

    const onScroll = () => {
      if (!root.classList.contains('is-scrolling')) {
        root.classList.add('is-scrolling');
      }
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        root.classList.remove('is-scrolling');
      }, 140);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(idleTimer);
      root.classList.remove('is-scrolling');
    };
  }, []);
}
