/** Global augmentations (gtag from index.html or analytics bootstrap). */
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export {};
