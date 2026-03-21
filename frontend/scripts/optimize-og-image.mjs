/**
 * Resize/compress public/og-image.png for Open Graph (Facebook, Telegram, WhatsApp, X).
 * Run from frontend/: npm run optimize-og
 *
 * Outputs:
 * - og-image.jpg — primary for og:image / twitter:image (target < ~500KB, 1200×630 canvas)
 * - og-image.png — replaced with a lighter PNG for the same canvas
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(__dirname, '..', 'public');
const input = path.join(pub, 'og-image.png');

const OG_W = 1200;
const OG_H = 630;
const bg = { r: 7, g: 8, b: 16, alpha: 1 };

const resizeOpts = {
  fit: 'contain',
  position: 'centre',
  background: bg
};

async function main() {
  if (!fs.existsSync(input)) {
    console.error('Missing', input);
    process.exit(1);
  }

  const jpgOut = path.join(pub, 'og-image.jpg');
  const pngOut = path.join(pub, 'og-image.png');
  const tmpPng = path.join(pub, 'og-image.png.tmp');

  const pipeline = () => sharp(input).rotate().resize(OG_W, OG_H, resizeOpts);

  await pipeline()
    .jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toFile(jpgOut);

  const jpgStat = fs.statSync(jpgOut);
  console.log('Wrote', jpgOut, `(${(jpgStat.size / 1024).toFixed(0)} KB)`);

  await pipeline().png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toFile(tmpPng);

  fs.renameSync(tmpPng, pngOut);
  const pngStat = fs.statSync(pngOut);
  console.log('Wrote', pngOut, `(${(pngStat.size / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
