// Draws the launcher icon (Moi Avenue tusks over the sea) into the Android project: node tools/icon.mjs
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const res = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res');
const art = `
  <path d="M24 86 Q25 38 66 25 Q41 46 39 86 Z" fill="#fffdf6" stroke="#0d1b2a" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M84 86 Q83 38 42 25 Q67 46 69 86 Z" fill="#fffdf6" stroke="#0d1b2a" stroke-width="2.5" stroke-linejoin="round"/>
  <text x="54" y="88" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-style="italic" font-size="30"
        fill="#ffc21a" stroke="#0d1b2a" stroke-width="5" paint-order="stroke" stroke-linejoin="round">M!</text>`;
const bg = shape => `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1546b8"/><stop offset="1" stop-color="#12b5b0"/></linearGradient></defs>${shape}`;
const svg = (inner, box) => `<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="100%" height="100%" style="display:block">${inner}</svg></body></html>`;
const variants = {
  ic_launcher_foreground: [108, svg(art, '0 0 108 108')],
  ic_launcher: [48, svg(bg('<rect x="18" y="18" width="72" height="72" rx="14" fill="url(#g)"/>') + art, '16 16 76 76')],
  ic_launcher_round: [48, svg(bg('<circle cx="54" cy="54" r="38" fill="url(#g)"/>') + art, '16 16 76 76')],
};
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
for (const [name, [size, html]] of Object.entries(variants)) {
  for (const [d, k] of Object.entries(densities)) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: k });
    await page.setContent(html);
    await page.screenshot({ path: join(res, `mipmap-${d}`, `${name}.png`), omitBackground: true });
  }
}
await browser.close();
console.log('icons written');
