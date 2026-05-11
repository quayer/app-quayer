/**
 * Generate public/logo.png from the V3 brand SVG used in login (auth-shell).
 *
 * Source of truth: src/client/components/ds/logo.tsx
 * We replicate the SVG markup here (server-side, no React.useId) and rasterize
 * via sharp. Output PNG is what emails reference at ${APP_URL}/logo.png.
 *
 * Run: npx tsx scripts/generate-email-logo.ts
 */

import sharp from 'sharp';
import * as path from 'node:path';

// Final email logo size — wordmark + icon. Width is large for retina,
// HTML img tag downscales to width=140.
const ICON_VIEWBOX_W = 200;
const ICON_VIEWBOX_H = 248;
const ICON_HEIGHT = 96; // px of rendered icon (3x of 32 for retina)
const ICON_WIDTH = Math.round(ICON_HEIGHT * (ICON_VIEWBOX_W / ICON_VIEWBOX_H));
const GAP = Math.round(ICON_HEIGHT * 0.25);
const WORDMARK_SIZE = Math.round(ICON_HEIGHT * 1.125);

// Total canvas — width = icon + gap + wordmark.
// Empirically the rendered "Quayer" needs ~4.2x WORDMARK_SIZE; we add padding.
const CANVAS_W = ICON_WIDTH + GAP + Math.round(WORDMARK_SIZE * 4.5);
const CANVAS_H = Math.round(ICON_HEIGHT * 1.3); // breathing room for shadow

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
  <defs>
    <linearGradient id="gMain" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#FFFDE0"/>
      <stop offset="12%" stop-color="#FFD60A"/>
      <stop offset="28%" stop-color="#FF9200"/>
      <stop offset="44%" stop-color="#E84000"/>
      <stop offset="60%" stop-color="#B82000"/>
      <stop offset="78%" stop-color="#881400"/>
      <stop offset="100%" stop-color="#580800"/>
    </linearGradient>
    <linearGradient id="gVol" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#000" stop-opacity=".48"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gRef" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".65"/>
      <stop offset="35%" stop-color="#ffe8b0" stop-opacity=".28"/>
      <stop offset="70%" stop-color="#fff" stop-opacity=".06"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gEdgeL" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fffde0"/>
      <stop offset="30%" stop-color="#FFD60A"/>
      <stop offset="65%" stop-color="#cc5500"/>
      <stop offset="100%" stop-color="#661100"/>
    </linearGradient>
    <linearGradient id="gEdgeR" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ff9200"/>
      <stop offset="45%" stop-color="#bb2800"/>
      <stop offset="100%" stop-color="#550800"/>
    </linearGradient>
    <radialGradient id="gShadow" cx="45%" cy="100%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity=".45"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="iconShadow" x="-20%" y="-10%" width="140%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#8B1400" flood-opacity=".40"/>
    </filter>
  </defs>

  <!-- ICON: scaled into top-left, vertically centered -->
  <g transform="translate(0, ${(CANVAS_H - ICON_HEIGHT) / 2}) scale(${ICON_WIDTH / ICON_VIEWBOX_W})" filter="url(#iconShadow)">
    <ellipse cx="91" cy="244" rx="46" ry="5" fill="url(#gShadow)" opacity=".4"/>
    <path d="M 92 6 L 158 6 L 116 122 L 170 122 L 38 242 L 4 242 L 74 118 L 20 118 Z" fill="url(#gMain)"/>
    <path d="M 92 6 L 158 6 L 116 122 L 170 122 L 38 242 L 4 242 L 74 118 L 20 118 Z" fill="url(#gVol)" opacity=".38"/>
    <path d="M 92 6 L 112 6 L 38 118 L 20 118 Z" fill="url(#gRef)" opacity=".65"/>
    <line x1="92" y1="6" x2="20" y2="118" stroke="url(#gEdgeL)" stroke-width="2" stroke-linecap="round" opacity=".9"/>
    <line x1="92" y1="6" x2="158" y2="6" stroke="url(#gEdgeL)" stroke-width="1.5" stroke-linecap="round" opacity=".4"/>
    <line x1="158" y1="6" x2="116" y2="118" stroke="url(#gEdgeR)" stroke-width="2" stroke-linecap="round" opacity=".72"/>
    <line x1="170" y1="122" x2="38" y2="242" stroke="url(#gEdgeR)" stroke-width="2" stroke-linecap="round" opacity=".7"/>
  </g>

  <!-- WORDMARK: "Quayer" in DM Sans-like sans-serif (sharp uses fontconfig + freetype). -->
  <text
    x="${ICON_WIDTH + GAP}"
    y="${CANVAS_H / 2 + WORDMARK_SIZE * 0.34}"
    font-family="DM Sans, Inter, Segoe UI, Helvetica Neue, Arial, sans-serif"
    font-size="${WORDMARK_SIZE}"
    font-weight="900"
    letter-spacing="-0.02em"
    fill="#1a0800"
  >Quayer</text>
</svg>`;

async function main() {
  const outPath = path.resolve(process.cwd(), 'public/logo.png');

  console.log(`\n🎨 Rendering V3 brand logo to PNG`);
  console.log(`   Canvas: ${CANVAS_W} x ${CANVAS_H}`);
  console.log(`   Output: ${outPath}\n`);

  await sharp(Buffer.from(svg), { density: 288 })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log('✅ Logo regenerated at public/logo.png');
}

main().catch((err) => {
  console.error('❌ Logo generation failed:', err);
  process.exit(1);
});
