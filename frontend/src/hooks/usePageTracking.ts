import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Matches index.html gtag config; override with VITE_GA4_MEASUREMENT_ID in .env if needed. */
const GA4_MEASUREMENT_ID =
  (import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined)?.trim() || 'G-P02EPD7EDB';

/**
 * GA4 virtual page views on every React Router navigation (SPA).
 * Relies on gtag.js + dataLayer from index.html (or analytics.ts bootstrap).
 */
export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

    const pagePath = `${location.pathname}${location.search}`;

    window.gtag('config', GA4_MEASUREMENT_ID, {
      page_path: pagePath
    });
  }, [location.pathname, location.search]);
}
