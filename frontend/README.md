# Frontend (Vite + React)

## Social / Open Graph image

Share previews (Facebook, Telegram, WhatsApp, X, LinkedIn) use **`/og-image.jpg`** (1200×630 canvas, **JPEG** for small file size).

1. **Replace** the artwork source: **`public/og-image.png`** (your design export).
2. **Regenerate** optimized assets:

```bash
npm run optimize-og
```

This overwrites **`public/og-image.jpg`** and **`public/og-image.png`** with 1200×630 versions (letterboxed on dark `#070810` if needed).

- **`npm run build`** does **not** run this automatically; run **`optimize-og`** after changing the source PNG.

Meta tags live in **`index.html`** (canonical domain `youtubebooster.com`) and **`SeoHead.tsx`** (updates on navigation using `window.location.origin`).
