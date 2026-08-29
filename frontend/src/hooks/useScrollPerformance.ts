import { useEffect } from 'react';

/**
 * Intentionally idle. Toggling document classes or pausing cinematic
 * animations during scroll made the landing page flash/reload on macOS Chrome.
 */
export function useScrollPerformance() {
  useEffect(() => {
    document.documentElement.classList.remove('is-scrolling');
  }, []);
}
