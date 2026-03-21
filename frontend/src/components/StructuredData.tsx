import { useEffect } from 'react';

const SCRIPT_ID = 'yb-seo-jsonld-graph';

/**
 * Injects a single JSON-LD @graph script (replaces on route change).
 */
export function StructuredData({ graph }: { graph: Record<string, unknown>[] }) {
  useEffect(() => {
    let el = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!graph.length) {
      el?.remove();
      return;
    }
    const payload = {
      '@context': 'https://schema.org',
      '@graph': graph
    };
    if (!el) {
      el = document.createElement('script');
      el.id = SCRIPT_ID;
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(payload);
  }, [graph]);

  return null;
}
