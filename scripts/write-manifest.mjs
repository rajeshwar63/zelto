import { writeFileSync } from 'fs';

const manifest = {
  id: "/",
  name: "Zelto",
  short_name: "Zelto",
  description: "B2B Trade Management for Indian SMEs",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  theme_color: "#ffffff",
  background_color: "#ffffff",
  icons: [
    {
      src: "icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "icons/icon-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable"
    }
  ]
};

writeFileSync('dist/manifest.webmanifest', JSON.stringify(manifest, null, 2));
console.log('✓ manifest.webmanifest written to dist/');
