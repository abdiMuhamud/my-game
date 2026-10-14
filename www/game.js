import * as THREE from 'three';
import { buildChunk, buildObstacle, makeCoin, makeCup, makeNdara, makeSky, makeClouds, makeRoadTexture, makeSeaTexture, Lam, curveMat, CURVE, PAL } from './world.js';
import { loadPeople, makeHero, makeThief } from './people.js';
import { Sound } from './sound.js';

const Q = new URLSearchParams(location.search);
const DEMO = Q.has('demo');       // bot plays, video overlays
const CAPTURE = Q.has('capture'); // frames are stepped from outside (tools/record.mjs)

// seeded random so the demo run is repeatable
let seed = DEMO ? 20261012 : (Date.now() >>> 0);
function rnd() {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const pick = a => a[Math.floor(rnd() * a.length)];
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function show(id, on) { $(id).classList.toggle('hidden', !on); }

const LANE = 2.4, LANES = [-LANE, 0, LANE];
const CHUNK = 12, VIEW = 170;
const ZONE_LEN = DEMO ? 84 : 420;
const ZONES = [
  { name: 'LIKONI FERRY', L: 'sea', R: 'city' },
  { name: 'MOI AVENUE', L: 'city', R: 'city' },
  { name: 'MARIKITI', L: 'market', R: 'market' },
  { name: 'MJI WA KALE', L: 'old', R: 'old' },
  { name: 'FORT JESUS', L: 'sea', R: 'fort' },
  { name: 'NYALI BRIDGE', L: 'bridge', R: 'bridge' },
  { name: 'BAMBURI BEACH', L: 'beach', R: 'palms' },
];
const zoneIndex = wz => Math.floor(Math.max(0, wz) / ZONE_LEN);
const zoneAt = wz => ZONES[DEMO ? Math.min(zoneIndex(wz), ZONES.length - 1) : zoneIndex(wz) % ZONES.length]; // the video ends on the beach
const GAP_START = 16, GAP_CATCH = 1.7, GAP_LOST = 38;

// the canvas textures use the game font, so it has to be ready before anything is drawn
await Promise.all([document.fonts.load('20px "Lilita One"'), document.fonts.load('800 14px Nunito')]).catch(() => {});

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = makeSky();
scene.fog = new THREE.Fog(PAL.haze, 70, VIEW);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xdff3ff, 0xe8cf9a, 1.5));
const sun = new THREE.DirectionalLight(0xfff0d2, 2.3);
sun.position.set(-16, 26, 6); sun.target.position.set(0, 0, -22);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 38, bottom: -34, near: 1, far: 90 });
scene.add(sun, sun.target);

// the sea is always there; chunks simply leave it uncovered where the coast shows
const seaTex = makeSeaTexture(); seaTex.repeat.set(70, 50);
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(700, 500, 1, 60), Lam({ map: seaTex }));
ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -1.1, -170);
const roadTex = makeRoadTexture(); roadTex.repeat.set(1, 280 / 8);
const road = new THREE.Mesh(new THREE.PlaneGeometry(8, 280, 1, 70), Lam({ map: roadTex }));
road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -120); road.receiveShadow = true;
scene.add(ocean, road, makeClouds());

const world = new THREE.Group(); // everything is placed at z = -worldZ; the group slides toward the camera
scene.add(world);

await loadPeople(p => { $('loadFill').style.width = (10 + p * 90) + '%'; });
const hero = makeHero(), thief = makeThief();
hero.scale.setScalar(1.32); thief.scale.setScalar(1.25);
const flying = makeNdara(); flying.visible = false;
scene.add(hero, thief, flying);

// little bursts when coins are picked up or someone takes a knock
const SPARK_GEO = new THREE.OctahedronGeometry(0.07), sparkMats = {};
const sparks = Array.from({ length: 40 }, () => { const s = new THREE.Mesh(SPARK_GEO); s.visible = false; scene.add(s); return { mesh: s, life: 0, v: new THREE.Vector3() }; });
let sparkAt = 0;
function burst(x, y, z, color, n = 6, power = 4) {
  sparkMats[color] = sparkMats[color] || curveMat(new THREE.MeshBasicMaterial({ color }));
  for (let i = 0; i < n; i++) {
    const s = sparks[sparkAt++ % sparks.length];
    s.mesh.material = sparkMats[color]; s.mesh.visible = true; s.mesh.position.set(x, y, z); s.life = 0.45 + Math.random() * 0.2;
    s.v.set((Math.random() - 0.5) * power, 1.5 + Math.random() * power, (Math.random() - 0.5) * power - 2);
  }
}

// ---------- state ----------
const S = {
  mode: 'menu', t: 0, dist: 0, speed: 6, level: 1,
  lane: 1, x: 0, y: 0, vy: 0, slide: 0, invuln: 0, stumble: 0,
  gap: GAP_START, gapBonus: 0, boost: 0,
  hearts: 3, coins: 0, bounty: 0, catches: 0, ndara: 1, streak: 0,
  tLane: 1, tx: 0, ty: 0, tvy: 0, tSlide: 0, tStun: 0, tWander: 2, dropAt: 0,
  throwT: -1, shake: 0, nextRow: 40, nextChunk: 0, demoT: 0, lastZone: -1, shoutLeft: 0,
};
const chunks = [], obstacles = [], coins = [], pickups = [];
let best = +(localStorage.getItem('mwizi.best') || 0);
$('best').textContent = best.toLocaleString();

function clearWorld() {
  for (const c of chunks) world.remove(c.g);
  for (const list of [obstacles, coins, pickups]) for (const o of list) world.remove(o.mesh);
  chunks.length = obstacles.length = coins.length = pickups.length = 0;
}
function resetRun() {
  clearWorld();
  Object.assign(S, {
    t: 0, dist: 0, level: 1, lane: 1, x: 0, y: 0, vy: 0, slide: 0, invuln: 0, stumble: 0,
    gap: GAP_START, gapBonus: 0, boost: 0, hearts: 3, coins: 0, bounty: 0, catches: 0, ndara: 1, streak: 0,
    tLane: 1, tx: 0, ty: 0, tvy: 0, tSlide: 0, tStun: 0, tWander: 2, dropAt: 0,
    throwT: -1, shake: 0, nextRow: 40, nextChunk: 0, lastZone: -1,
  });
}

// ---------- spawning ----------
function fillWorld() {
  while (S.nextChunk * CHUNK < S.dist + VIEW + CHUNK) {
    const i = S.nextChunk++, mid = i * CHUNK + CHUNK / 2, zi = zoneIndex(mid);
    const g = buildChunk(i, zoneAt(mid), { first: (zoneIndex(mid - CHUNK) !== zi || i === 0) && !(DEMO && zi >= ZONES.length), zoneChunk: Math.floor((mid - zi * ZONE_LEN) / CHUNK) }, rnd);
    g.position.z = -mid;
    world.add(g);
    chunks.push({ g, end: mid + CHUNK / 2 });
  }
  while (chunks.length && chunks[0].end < S.dist - 14) world.remove(chunks.shift().g);
  if (S.mode === 'menu') return;
  while (S.nextRow < S.dist + VIEW - 30) { spawnRow(S.nextRow); S.nextRow += rowGap(); }
  for (const list of [obstacles, coins, pickups]) while (list.length && list[0].wz < S.dist - 8) world.remove(list.shift().mesh);
}
function difficulty() { return clamp(S.dist / 2600 + (S.level - 1) * 0.18, 0, 1); }
function rowGap() { return (DEMO ? 20 : 24) - difficulty() * 8 + rnd() * 7; }
function spawnRow(wz) {
  const d = difficulty();
  const lanes = [0, 1, 2].sort(() => rnd() - 0.5);
  const n = rnd() < 0.38 + d * 0.35 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const r = rnd();
    addObstacle(r < 0.30 ? 'tuktuk' : r < 0.46 ? 'matatu' : r < 0.62 ? 'cart' : r < 0.76 ? 'crates' : 'kanga', lanes[k], wz);
  }
  if (n === 2 && rnd() < d * 0.5) addObstacle(rnd() < 0.5 ? 'crates' : 'kanga', lanes[2], wz + 1);
  const free = lanes[2], r = rnd();
  if (n === 1 || r < 0.5) {
    if (r < 0.13) addPickup('cup', free, wz);
    else if (r < 0.3) addPickup('ndara', free, wz);
  }
}
function addObstacle(type, lane, wz) {
  const o = buildObstacle(type, rnd);
  o.mesh.position.set(LANES[lane], 0, -wz);
  world.add(o.mesh);
  obstacles.push({ type, kind: o.kind, half: o.half, lane, wz, mesh: o.mesh, hit: false });
}
function addPickup(type, lane, wz) {
  const mesh = type === 'cup' ? makeCup() : makeNdara();
  mesh.position.set(LANES[lane], 1.0, -wz);
  world.add(mesh);
  pickups.push({ type, wz, x: LANES[lane], mesh });
}
function dropCoin() {
  const wz = S.dist + S.gap - 0.8, mesh = makeCoin();
  mesh.position.set(S.tx, 0.95 + S.ty, -wz);
  world.add(mesh);
  coins.push({ wz, x: S.tx, y: 0.95 + S.ty, mesh });
}
// first obstacle in a lane between two world z values, for the bot and for Kibaka
function ahead(lane, from, to, kinds) {
  for (const o of obstacles) {
    if (o.wz + o.half < from || o.wz - o.half > to) continue;
    if (o.lane === lane && (!kinds || kinds.includes(o.kind))) return o;
  }
  return null;
}

// ---------- actions ----------
function moveLane(d) { if (S.mode !== 'run') return; const n = clamp(S.lane + d, 0, 2); if (n !== S.lane) { S.lane = n; Sound.sfx('swish'); } }
function jump() { if (S.mode === 'run' && S.y <= 0.01 && S.slide <= 0.25) { S.vy = 8.6; S.slide = 0; Sound.sfx('jump'); } }
function slide() { if (S.mode !== 'run') return; if (S.y > 0.01) S.vy = -14; S.slide = 0.72; Sound.sfx('swish'); }
function throwNdara() {
  if (S.mode !== 'run' || S.ndara <= 0 || S.throwT >= 0) return;
  S.ndara--; S.throwT = 0; flying.visible = true; Sound.sfx('throw');
}
function shout(text, ms = 1100) { const el = $('shout'); el.textContent = text; el.classList.add('on'); S.shoutLeft = ms / 1000; }
function hitObstacle(o) {
  o.hit = true; S.hearts--; S.invuln = 1.5; S.stumble = 0.6; S.gap += 7; S.streak = 0; S.shake = 0.35; S.boost = 0;
  Sound.sfx('hit'); burst(S.x, 1.2, -0.6, 0xffffff, 10, 5);
  if (navigator.vibrate) navigator.vibrate(120);
  if (S.hearts <= 0) return gameOver('fall');
  shout(pick(['POLE!', 'AISEE!', 'CHUNGA!']), 700);
}
function startRun() {
  resetRun(); S.mode = 'run';
  show('menu', false); show('over', false); show('caught', false); show('hud', true); show('tag', true); show('btnThrow', true);
  Sound.start();
  shout('MWIZI! MWIZI!', 1400);
}
function caught() {
  S.mode = 'caught'; S.catches++; show('tag', false); S.bounty += 1000 * S.level;
  Sound.sfx('win'); burst(S.tx, 1.4, -S.gap, PAL.sun, 16, 6);
  if (DEMO) { shout('UMEMSHIKA!', 2200); return; }
  $('caughtZone').textContent = zoneAt(S.dist).name;
  $('caughtCash').textContent = (S.coins + S.bounty).toLocaleString();
  show('caught', true); show('tag', false);
}
function chaseAgain() {
  S.level++; S.gap = GAP_START + 2; S.gapBonus = 0; S.tStun = 0; S.hearts = Math.min(3, S.hearts + 1); S.mode = 'run';
  show('caught', false); show('tag', true);
  shout('AMETOROKA TENA!', 1200);
}
function gameOver(why) {
  const banked = why === 'bank', total = S.coins + (banked ? S.bounty : 0), zn = zoneAt(S.dist).name;
  S.mode = 'over';
  if (total > best) { best = total; localStorage.setItem('mwizi.best', best); }
  $('overBand').textContent = banked ? 'SHUJAA!' : why === 'fall' ? 'UMEANGUKA!' : why === 'quit' ? 'MBIO ZIMEISHA' : 'AMETOROKA!';
  $('overBand').className = 'band' + (banked ? ' win' : '');
  $('overHead').textContent = banked ? `Mama Fatuma amerudishiwa kikapu chake pale ${zn}. Mombasa raha!` : why === 'lost' ? `Kibaka ametoroka pale ${zn}. Wananchi wamebaki wakipiga kelele!` : `Mbio zako zimeishia ${zn}.`;
  $('overCash').textContent = total.toLocaleString();
  $('overDist').textContent = Math.round(S.dist) + ' m';
  $('overCatch').textContent = S.catches;
  $('overBest').textContent = best.toLocaleString();
  $('best').textContent = best.toLocaleString();
  S.lastTotal = total;
  show('caught', false); show('hud', false); show('tag', false); show('btnThrow', false); show('over', true);
  if (!banked) Sound.sfx('lose');
}
function setPaused(p) {
  if (p && S.mode === 'run') { S.mode = 'paused'; show('pause', true); Sound.mute(true); }
  else if (!p && S.mode === 'paused') { S.mode = 'run'; show('pause', false); Sound.mute(!Sound.enabled); }
}
const mult = () => 1 + Math.min(4, Math.floor(S.streak / 12)) + (S.level - 1);

// ---------- update ----------
function update(dt) {
  S.t += dt;
  if (S.shoutLeft > 0 && (S.shoutLeft -= dt) <= 0) $('shout').classList.remove('on');
  const running = S.mode === 'run';
  const target = S.mode === 'menu' ? 5 : running ? (DEMO ? 17 : 12.5 + S.level * 1.4 + Math.min(S.t * 0.045, 4.5)) : 0;
  S.speed += (target * (S.stumble > 0 ? 0.55 : 1) * (S.boost > 0 ? 1.18 : 1) - S.speed) * Math.min(1, dt * 4);
  S.dist += S.speed * dt;
  fillWorld();

  if (running) {
    if (DEMO) bot();
    S.x += clamp(LANES[S.lane] - S.x, -15 * dt, 15 * dt);
    S.vy -= 25 * dt; S.y += S.vy * dt;
    if (S.y <= 0) { S.y = 0; S.vy = 0; }
    S.slide = Math.max(0, S.slide - dt);
    S.invuln = Math.max(0, S.invuln - dt);
    S.stumble = Math.max(0, S.stumble - dt);
    S.boost = Math.max(0, S.boost - dt);

    // the gap: Kibaka tires slowly, kahawa and ndara close it faster
    let close = 0.48 - (S.level - 1) * 0.04 + (S.boost > 0 ? 2.6 : 0);
    if (S.gapBonus > 0) { const b = Math.min(S.gapBonus, 7 * dt); S.gapBonus -= b; S.gap -= b; }
    if (DEMO) close = demoClose();
    S.gap -= close * dt;

    thiefAI(dt);
    if (S.dist + S.gap - S.dropAt > 2.6) { S.dropAt = S.dist + S.gap; if (S.tStun <= 0 && S.gap > 4) dropCoin(); }

    if (S.invuln <= 0) for (const o of obstacles) {
      if (o.hit || Math.abs(o.wz - S.dist) > o.half + 0.35 || Math.abs(S.x - LANES[o.lane]) > 1.05) continue;
      if (o.kind === 'block' || (o.kind === 'low' && S.y < 0.7) || (o.kind === 'high' && S.slide <= 0)) { hitObstacle(o); break; }
    }
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (Math.abs(c.wz - S.dist) < 0.9 && Math.abs(c.x - S.x) < 0.95 && Math.abs(c.y - (S.y + 0.95)) < 1.4) {
        world.remove(c.mesh); coins.splice(i, 1);
        S.streak++; S.coins += 10 * mult(); Sound.sfx('coin', S.streak); burst(c.x, c.y, -0.4, 0xffe07a, 4, 3);
      }
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (Math.abs(p.wz - S.dist) < 1 && Math.abs(p.x - S.x) < 1 && S.y < 1.6) {
        world.remove(p.mesh); pickups.splice(i, 1); burst(p.x, 1.2, -0.4, p.type === 'cup' ? 0xff7a3d : 0xff5c8a, 8, 4);
        if (p.type === 'cup') { S.boost = 3.6; shout('KAHAWA TUNGU!', 900); Sound.sfx('boost'); }
        else { S.ndara = Math.min(9, S.ndara + 1); Sound.sfx('pick'); }
      }
    }
    if (S.throwT >= 0) {
      S.throwT += dt / 0.42;
      if (S.throwT >= 1) {
        S.throwT = -1; flying.visible = false; S.tStun = 1.1; S.gapBonus += DEMO ? clamp(S.gap - demoFloor(), 0, 5.5) : 5.5; S.shake = 0.2;
        burst(S.tx, 1.5, -S.gap, 0xff5c8a, 10, 5);
        shout(pick(['PAAP!', 'NDARA!', 'SHIKA HUYO!']), 800); Sound.sfx('hit');
      }
    }
    if (S.mode === 'run') {
      if (S.gap <= GAP_CATCH) caught();
      else if (S.gap >= GAP_LOST) gameOver('lost');
    }
    const zi = zoneIndex(S.dist);
    if (zi !== S.lastZone) { if (S.lastZone >= 0 && !DEMO) shout(zoneAt(S.dist).name, 1300); S.lastZone = zi; }
  }
  if (DEMO) demoTimeline(dt);
  place(dt);
  hud();
}

function thiefAI(dt) {
  const tz = S.dist + S.gap;
  S.tStun = Math.max(0, S.tStun - dt);
  const danger = ahead(S.tLane, tz - 0.5, tz + 9);
  if (danger && danger.kind === 'block') {
    const opts = [S.tLane - 1, S.tLane + 1].filter(l => l >= 0 && l <= 2);
    const clear = opts.filter(l => !ahead(l, tz - 2, tz + 12)).concat(opts.filter(l => !ahead(l, tz - 2, tz + 12, ['block'])));
    if (clear.length) S.tLane = clear[0];
  } else if (danger && danger.kind === 'low' && danger.wz - tz < 3.6 && S.ty <= 0) S.tvy = 8.6;
  else if (danger && danger.kind === 'high' && danger.wz - tz < 4) S.tSlide = 0.6;
  else if ((S.tWander -= dt) < 0) {
    S.tWander = 1.6 + rnd() * 2.4;
    const opts = [S.tLane - 1, S.tLane + 1].filter(l => l >= 0 && l <= 2 && !ahead(l, tz - 2, tz + 16));
    if (opts.length) S.tLane = pick(opts);
  }
  S.tx += clamp(LANES[S.tLane] - S.tx, -13 * dt, 13 * dt);
  S.tvy -= 25 * dt; S.ty = Math.max(0, S.ty + S.tvy * dt); if (S.ty === 0) S.tvy = 0;
  S.tSlide = Math.max(0, S.tSlide - dt);
}

// ---------- demo bot ----------
function bot() {
  const z = S.dist, look = 3 + S.speed * 0.6;
  const free = l => !ahead(l, z - 1.5, z + look + 6);
  const o = ahead(S.lane, z, z + look);
  if (o && o.kind === 'block') {
    const opts = [S.lane - 1, S.lane + 1].filter(l => l >= 0 && l <= 2);
    const good = opts.filter(free);
    if (good.length) moveLane((good.includes(S.tLane) ? S.tLane : good[0]) - S.lane);
    else if (S.lane !== 1 && free(2 - S.lane)) moveLane(1 - S.lane); // cut across the middle to the far lane
    else moveLane(opts.find(l => !ahead(l, z - 1.5, z + look, ['block'])) - S.lane || 0);
  } else if (o && o.kind === 'low') { if (o.wz - o.half - z < 3.4) jump(); }
  else if (o && o.kind === 'high') { if (o.wz - o.half - z < 4.2 && S.slide <= 0.2) slide(); }
  else if (S.tLane !== S.lane && S.y === 0 && Math.abs(S.x - LANES[S.lane]) < 0.1) {
    const step = Math.sign(S.tLane - S.lane);
    if (free(S.lane + step)) moveLane(step);
  }
  if (S.ndara > 0 && S.gap - demoFloor() > 2.2 && S.demoT > 7 && Math.abs(S.tx - S.x) < 0.6 && !ahead(S.lane, z, z + S.gap)) throwNdara();
}
const DEMO_CATCH = 35.5; // seconds: where the video's catch lands
function demoFloor() { return 3 + Math.max(0, DEMO_CATCH - S.demoT) * 0.3; }
function demoClose() { return S.demoT < 6 ? 0.1 : Math.max(0.15, (S.gap - GAP_CATCH) / Math.max(0.6, DEMO_CATCH - S.demoT)); }
let demoEnd = 0;
function demoTimeline(dt) {
  S.demoT += dt;
  const t = S.demoT;
  show('demoTitle', t < 2.6);
  if (S.mode === 'menu' && t >= 2.6) { startRun(); S.ndara = 2; }
  const into = S.dist - zoneIndex(S.dist) * ZONE_LEN;
  show('demoZone', S.mode === 'run' && into < 46 && t > 2.7);
  $('demoZoneName').textContent = zoneAt(S.dist).name;
  if (S.mode === 'caught' && (demoEnd += dt) > 2.6) { show('demoEnd', true); show('hud', false); show('tag', false); show('btnThrow', false); $('shout').classList.remove('on'); }
  window.__done = demoEnd > 6.2;
}

// ---------- placing meshes / camera ----------
const v3 = new THREE.Vector3();
function place(dt) {
  world.position.z = S.dist;
  roadTex.offset.y = (S.dist / 8) % 1;
  seaTex.offset.y = (S.dist / 10) % 1; seaTex.offset.x = S.t * 0.02;
  CURVE.x = Math.sin(S.dist * 0.0045) * 0.00042 + Math.sin(S.dist * 0.0017 + 1) * 0.00022; // the road sways gently left and right

  const menu = S.mode === 'menu', gz = menu ? 13 : S.gap;
  if (menu) S.tx = Math.sin(S.t * 0.7) * 1.4;
  hero.visible = !(S.invuln > 0 && Math.floor(S.t * 14) % 2 === 0);
  hero.position.set(menu ? -0.65 : S.x, S.y, menu ? 1.4 : 0);
  hero.rotation.z = clamp((LANES[S.lane] - S.x) * -0.14, -0.28, 0.28);
  hero.rotation.y = menu ? Math.PI - .3 : clamp((LANES[S.lane] - S.x) * -0.25, -0.4, 0.4);
  hero.userData.pose(menu ? 'cheer' : S.mode === 'caught' ? 'cheer' : S.mode === 'over' ? 'idle' : S.slide > 0 ? 'slide' : S.y > 0.05 ? 'jump' : 'run', S.speed, dt);
  thief.position.set(S.mode === 'caught' ? S.x + 0.9 : S.tx, S.ty, -gz);
  thief.rotation.y = clamp((LANES[S.tLane] - S.tx) * -0.25, -0.4, 0.4);
  thief.userData.pose(S.mode === 'caught' ? 'caught' : S.mode === 'over' ? 'idle' : S.tStun > 0 ? 'stun' : S.tSlide > 0 ? 'slide' : S.ty > 0.05 ? 'jump' : 'run', S.speed * 1.05, dt);

  for (const c of coins) c.mesh.rotation.y = S.t * 5 + c.wz;
  for (const p of pickups) { p.mesh.rotation.y = S.t * 2.5; p.mesh.position.y = 1.0 + Math.sin(S.t * 4 + p.wz) * 0.12; }
  if (S.throwT >= 0) {
    const k = S.throwT;
    flying.position.set(S.x + (S.tx - S.x) * k, 1.4 + S.y * (1 - k) + Math.sin(k * Math.PI) * 1.3, -S.gap * k);
    flying.rotation.set(S.t * 22, S.t * 9, 0);
  }
  for (const s of sparks) {
    if (!s.mesh.visible) continue;
    s.life -= dt; s.v.y -= 12 * dt; s.mesh.position.addScaledVector(s.v, dt); s.mesh.position.z += S.speed * dt;
    s.mesh.rotation.x += dt * 9; s.mesh.scale.setScalar(Math.max(0.01, s.life * 2.2));
    if (s.life <= 0) s.mesh.visible = false;
  }

  S.shake = Math.max(0, S.shake - dt);
  // Small, inexpensive gestures bring the posed crowd to life without extra skeletons.
  for (const chunk of chunks) {
    for (const p of chunk.g.children) {
      if (p.userData.streetPerson) p.rotation.z = Math.sin(S.t * 2.2 + p.userData.phase) * .025;
    }
  }
  const sh = S.shake * 0.5, portrait = camera.aspect < 1;
  camera.position.set(S.x * 0.6 + (Math.random() - 0.5) * sh, (menu ? 2.8 : portrait ? 3.4 : 3.1) + S.y * 0.3 + (Math.random() - 0.5) * sh, menu ? 6.4 : portrait ? 5.5 : 5.2);
  camera.lookAt(S.x * 0.45, menu ? 1.8 : 1.6, menu ? -2 : -10);
  const fov = (portrait ? 64 : 55) + (S.boost > 0 ? 8 : 0) + (menu ? -6 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
}

const H = {};
function set(id, v) { if (H[id] !== v) { H[id] = v; $(id).textContent = v; } }
const heartEls = [...$('hearts').children];
function hud() {
  if (S.mode === 'menu' || S.mode === 'over') return;
  set('cash', (S.coins + S.bounty).toLocaleString());
  const zi = zoneIndex(S.dist);
  set('zoneName', ZONES[(zi + 1) % ZONES.length].name);
  set('zoneDist', Math.max(0, Math.round((zi + 1) * ZONE_LEN - S.dist)) + ' m');
  heartEls.forEach((el, i) => el.classList.toggle('off', i >= S.hearts));
  set('mult', 'x' + mult());
  set('throwN', S.ndara);
  $('btnThrow').classList.toggle('empty', S.ndara <= 0);
  const g = Math.max(0, Math.round(S.gap)), pct = clamp(S.gap / GAP_LOST, 0.05, 0.97) * 100;
  $('gapFill').style.width = `calc(${pct}% - 2px)`; $('gapHim').style.left = pct + '%';
  set('gapText', g + ' m');
  set('tagDist', S.tStun > 0 ? 'Amejikwaa!' : S.gap < 6 ? 'Amechoka!' : g + 'm');
  show('boost', S.boost > 0); $('boostFill').style.width = (S.boost / 3.6 * 100) + '%';
  // name tag above Kibaka; it has to follow the same bend as the world
  camera.updateMatrixWorld();
  v3.set(thief.position.x, 2.7 + S.ty, -S.gap).applyMatrix4(camera.matrixWorldInverse);
  v3.x += v3.z * v3.z * CURVE.x; v3.y -= v3.z * v3.z * CURVE.y;
  v3.applyMatrix4(camera.projectionMatrix);
  const tag = $('tag');
  tag.style.left = ((v3.x + 1) / 2 * innerWidth) + 'px';
  tag.style.top = ((1 - v3.y) / 2 * innerHeight) + 'px';
}

// ---------- input ----------
let touch = null;
canvas.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY, done: false }; Sound.unlock(); });
canvas.addEventListener('pointermove', e => {
  if (!touch || touch.done) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  touch.done = true;
  if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1); else if (dy < 0) jump(); else slide();
});
addEventListener('pointerup', () => { touch = null; });
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') moveLane(-1);
  else if (k === 'arrowright' || k === 'd') moveLane(1);
  else if (k === 'arrowup' || k === 'w' || k === ' ') { jump(); e.preventDefault(); }
  else if (k === 'arrowdown' || k === 's') slide();
  else if (k === 'f') throwNdara();
  else if (k === 'p' || k === 'escape') setPaused(S.mode === 'run');
  else if (k === 'enter' && S.mode === 'menu') startRun();
});
$('btnThrow').addEventListener('pointerdown', e => { e.preventDefault(); throwNdara(); });
$('btnStart').onclick = () => { Sound.unlock(); startRun(); };
$('btnRetry').onclick = startRun;
$('btnAgain').onclick = chaseAgain;
$('btnBank').onclick = () => gameOver('bank');
$('btnPause').onclick = () => setPaused(true);
$('btnResume').onclick = () => setPaused(false);
$('btnQuit').onclick = () => { show('pause', false); Sound.mute(!Sound.enabled); gameOver('quit'); };
$('btnSound').onclick = () => {
  Sound.enabled = !Sound.enabled;
  $('soundIcon').setAttribute('href', Sound.enabled ? '#i-sound' : '#i-mute');
  $('soundText').textContent = Sound.enabled ? 'Sauti: imewashwa' : 'Sauti: imezimwa';
};
$('btnShare').onclick = () => {
  const text = `Nimepata KSh ${(S.lastTotal || 0).toLocaleString()} nikimfukuza Kibaka kwenye MWIZI! Mombasa. Unaweza kunishinda?`;
  if (navigator.share) navigator.share({ title: 'Mwizi! Mombasa', text }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { $('btnShare').textContent = 'Imenakiliwa!'; });
};
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- loop ----------
function frame(dt) { if (S.mode !== 'paused') update(dt); renderer.render(scene, camera); }
show('loading', false); show('menu', !DEMO);
if (CAPTURE) {
  window.__step = dt => frame(dt);
  window.__state = () => ({ mode: S.mode, t: S.demoT, dist: S.dist, gap: S.gap, hearts: S.hearts });
  window.__music = secs => Sound.renderWav(secs);
  frame(1 / 30);
  window.__ready = true;
} else {
  let last = performance.now();
  const loop = now => { const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
