import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = path.join(ROOT_DIR, 'icons');
const SIZES = [192, 512];

function renderIconSvg(size = 512) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="96" y1="48" x2="416" y2="464" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3a3329"/>
      <stop offset="1" stop-color="#171310"/>
    </linearGradient>
    <linearGradient id="mark" x1="168" y1="130" x2="344" y2="382" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f7e5c9"/>
      <stop offset="1" stop-color="#b97a52"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="104" fill="url(#bg)"/>
  <rect x="36" y="36" width="440" height="440" rx="82" fill="none" stroke="#6a443b" stroke-width="18"/>
  <path d="M258 96c74 0 128 52 128 122 0 58-36 101-91 116l91 82h-74l-83-76h-38v76h-60V96h127Zm-67 55v136h64c42 0 70-27 70-68 0-40-28-68-70-68h-64Z" fill="url(#mark)"/>
  <circle cx="381" cy="130" r="20" fill="#c2a36a"/>
</svg>`;
}

await mkdir(ICON_DIR, { recursive: true });

const svg = renderIconSvg();
await writeFile(path.join(ICON_DIR, 'pwa-icon.svg'), `${svg}\n`, 'utf8');

await Promise.all(
  SIZES.map(size =>
    sharp(Buffer.from(svg))
      .resize(size, size, { fit: 'cover' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(ICON_DIR, `icon-${size}.png`))
  )
);

console.log(`Generated PWA icons: ${SIZES.map(size => `icons/icon-${size}.png`).join(', ')}`);
