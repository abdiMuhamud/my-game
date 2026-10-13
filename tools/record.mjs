// Renders the share video: npm run video
// The game is opened in demo mode and stepped one frame at a time, so the result is smooth
// 30 fps at 1080x1920 no matter how fast this machine is.  Pass --stills to dump preview frames only.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import ffmpeg from 'ffmpeg-static';
import { serve } from './serve.mjs';

const FPS = 30, PORT = +process.env.PORT || 5199, MAX_SECONDS = 60;
const stills = process.argv.includes('--stills');
const out = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'video');
await mkdir(join(out, 'stills'), { recursive: true });

const server = await serve(PORT);
const browser = await puppeteer.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 540, height: 960, deviceScaleFactor: stills ? 1 : 2 });
page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
await page.goto(`http://127.0.0.1:${PORT}/?demo&capture`);
await page.waitForFunction('window.__ready === true', { timeout: 60000 });

const silent = join(out, 'silent.mp4'), wav = join(out, 'music.wav'), final = join(out, 'mwizi-mombasa.mp4');
const run = (args, stdin) => new Promise((ok, fail) => {
  const p = spawn(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: [stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
  p.on('exit', c => c === 0 ? ok() : fail(new Error('ffmpeg exited ' + c)));
  if (stdin) stdin(p.stdin);
});

let frames = 0, enc, encDone;
if (!stills) encDone = run(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], s => { enc = s; });

while (frames < MAX_SECONDS * FPS) {
  const done = await page.evaluate(dt => { window.__step(dt); return window.__done === true; }, 1 / FPS);
  if (stills) {
    if (frames % 45 === 20) await page.screenshot({ path: join(out, 'stills', `f${String(frames).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 80 });
  } else {
    const jpg = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!enc.write(jpg)) await new Promise(r => enc.once('drain', r));
  }
  frames++;
  if (frames % 150 === 0) console.log(`${(frames / FPS).toFixed(0)} s`, JSON.stringify(await page.evaluate('window.__state()')));
  if (done) break;
}
const seconds = frames / FPS;
console.log(`captured ${frames} frames (${seconds.toFixed(1)} s)`);

if (!stills) {
  enc.end(); await encDone;
  await writeFile(wav, Buffer.from(await page.evaluate(s => window.__music(s), seconds), 'base64'));
  await run(['-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-af', `afade=t=out:st=${(seconds - 1.5).toFixed(2)}:d=1.5`, '-shortest', '-movflags', '+faststart', final]);
  await rm(silent); await rm(wav);
  console.log('wrote', final);
}
await browser.close();
server.close();
