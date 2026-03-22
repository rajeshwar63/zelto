import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('public/icons', { recursive: true });

// 192x192 standard
await sharp('public/zelto-icon-512.png')
  .resize(192, 192)
  .toFile('public/icons/icon-192.png');

// 512x512 standard (copy of source)
await sharp('public/zelto-icon-512.png')
  .resize(512, 512)
  .toFile('public/icons/icon-512.png');

// 512x512 maskable — adds 20% padding for Android adaptive icon safe zone
await sharp('public/zelto-icon-512.png')
  .resize(410, 410)
  .extend({
    top: 51, bottom: 51, left: 51, right: 51,
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  })
  .toFile('public/icons/icon-512-maskable.png');

console.log('Icons generated successfully');
