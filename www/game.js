import * as THREE from 'three';
import { RoomEnvironment } from './lib/environments/RoomEnvironment.js';
import { buildChunk, buildObstacle, makeCoin, makeCup, makeNdara, makeHelmet, makeHelmetModel, makeSky, makeClouds, makeRoadTexture, makeSeaTexture, Lam, curveMat, CURVE, PAL } from './world.js';
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
const ri = n => Math.floor(rnd() * n);
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
const BOOST_TIME = 4, MAGNET_TIME = 6, SHIELD_TIME = 10;

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
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // reflections for the metal tusks
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xd4ecff, 0xf0d29a, 1.45));
const sun = new THREE.DirectionalLight(0xffe2b0, 2.6); // warm afternoon sun over the coast
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
const helmet = makeHelmetModel(); helmet.scale.setScalar(0.62); helmet.visible = false; // worn while the shield lasts
const headBone = hero.userData.bone('Head');
scene.add(hero, thief, flying, helmet);

// little bursts when coins are picked up or someone takes a knock
const SPARK_GEO = new THREE.OctahedronGeometry(0.07), sparkMats = {};
const sparks = Array.from({ length: 48 }, () => { const s = new THREE.Mesh(SPARK_GEO); s.visible = false; scene.add(s); return { mesh: s, life: 0, v: new THREE.Vector3() }; });
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
const FRESH = () => ({
  t: 0, dist: 0, level: 1, lane: 1, x: 0, y: 0, vy: 0, slide: 0, invuln: 0, stumble: 0,
  gap: GAP_START, gapBonus: 0, boost: 0, magnet: 0, shield: 0, hearts: 3, coins: 0, bounty: 0, catches: 0, ndara: 1, streak: 0,
  tLane: 1, tx: 0, ty: 0, tvy: 0, tSlide: 0, tStun: 0, tWander: 2, dropAt: 0,
  throwT: -1, shake: 0, nextRow: 40, nextChunk: 0, lastZone: -1, camX: 0, camY: 0, trainShown: false,
});
const S = { mode: 'menu', speed: 6, demoT: 0, shoutLeft: 0, ...FRESH() };
const chunks = [], obstacles = [], coins = [], pickups = [];
const busy = [0, 0, 0]; // world z up to which a lane is taken by a line of parked matatus
let best = +(localStorage.getItem('mwizi.best') || 0);
$('best').textContent = best.toLocaleString();

function clearWorld() {
  for (const c of chunks) world.remove(c.g);
  for (const list of [obstacles, coins, pickups]) for (const o of list) world.remove(o.mesh);
  chunks.length = obstacles.length = coins.length = pickups.length = 0;
  busy.fill(0);
}
function resetRun() { clearWorld(); Object.assign(S, FRESH()); }

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
  for (const list of [obstacles, coins, pickups]) for (let i = list.length - 1; i >= 0; i--) if (list[i].wz < S.dist - 8) { world.remove(list[i].mesh); list.splice(i, 1); }
}
function difficulty() { return clamp(S.dist / 2600 + (S.level - 1) * 0.18, 0, 1); }
function rowGap() { return (DEMO ? 21 : 24) - difficulty() * 8 + rnd() * 7; }

const LOW = ['cart', 'crates', 'barrier', 'cones'], HIGH = ['kanga', 'sign'];
function pickObstacle() {
  const r = rnd();
  return r < 0.22 ? 'tuktuk' : r < 0.34 ? 'matatu' : r < 0.67 ? pick(LOW) : pick(HIGH);
}
function spawnRow(wz) {
  const d = difficulty();
  const open = [0, 1, 2].filter(l => busy[l] < wz - 2).sort(() => rnd() - 0.5);
  if (!open.length) return;
  // a line of parked matatus, usually with a ramp at the back: run up and along the roofs
  const wantTrain = DEMO ? (!S.trainShown && wz > 55) || rnd() < 0.16 : rnd() < 0.22;
  if (open.length === 3 && wantTrain) {
    const l = DEMO && !S.trainShown ? 1 : open[open.length - 1], withRamp = (DEMO && !S.trainShown) || rnd() < 0.75, n = 2 + ri(2);
    open.splice(open.indexOf(l), 1);
    S.trainShown = true;
    let z = wz;
    if (withRamp) { addObstacle('ramp', l, z + 2.5, { climb: true, start: wz }); z += 5; }
    for (let k = 0; k < n; k++) { addObstacle('matatu', l, z + 2.2, { climb: withRamp, start: wz }); z += 4.6; }
    busy[l] = z + 1;
    if (withRamp) for (let c = wz + 1; c < z - 0.5; c += 1.6) addCoin(l, c, (c < wz + 5 ? 2.5 * (c - wz) / 5 : 2.5) + 1.0);
  }
  // the rest of the row: up to all-but-one of the open lanes get an obstacle; one lane always stays passable
  const safe = open.shift();
  const n = open.length ? (rnd() < 0.4 + d * 0.35 ? open.length : 1) : 0;
  for (let k = 0; k < n; k++) {
    const type = pickObstacle(), l = open[k];
    addObstacle(type, l, wz);
    if (LOW.includes(type) && rnd() < 0.45) for (let c = -5; c <= 5; c += 1.25) addCoin(l, wz + c, 1.0 + 1.55 * (1 - (c / 5) ** 2)); // jump arc
  }
  if (safe !== undefined) {
    const r = rnd();
    if (r < 0.1) addPickup('cup', safe, wz);
    else if (r < 0.22) addPickup('ndara', safe, wz);
    else if (r < 0.29) addPickup('helmet', safe, wz);
    else if (r < 0.75) for (let c = 0; c < 6; c++) addCoin(safe, wz - 6 + c * 2.2, 1.0);
  }
  if (rnd() < 0.2 + d * 0.15) addMover(wz + 10);
}
function addObstacle(type, lane, wz, extra) {
  const o = buildObstacle(type, rnd);
  o.mesh.position.set(LANES[lane], 0, -wz);
  world.add(o.mesh);
  obstacles.push({ type, kind: o.kind, half: o.half, top: o.top, lane, x: LANES[lane], wz, v: 0, mesh: o.mesh, hit: false, ...extra });
}
// oncoming matatu or tuk-tuk: only placed where it meets the runner on an otherwise empty stretch of road
function addMover(w0) {
  const v = 6 + rnd() * 4, sp = Math.max(S.speed, 12), meet = S.dist + (w0 - S.dist) * sp / (sp + v);
  if (meet < S.dist + 30 || obstacles.some(o => o.v && Math.abs(o.meet - meet) < 16)) return;
  const solidNear = m => obstacles.some(o => o.lane === m && !o.v && (o.kind === 'block' || o.kind === 'ramp') && Math.abs(o.wz - meet) < o.half + 6);
  // its lane must be clear all the way, and at the meeting point one of the other lanes must still be open
  const lanes = [0, 1, 2].filter(l => busy[l] < meet - 8
    && !obstacles.some(o => o.lane === l && !o.v && o.wz + o.half > meet - 8 && o.wz - o.half < w0 + 4)
    && [0, 1, 2].filter(m => m !== l && solidNear(m)).length < 2);
  if (!lanes.length) return;
  const l = pick(lanes), type = rnd() < 0.55 ? 'tuktuk' : 'matatu';
  addObstacle(type, l, w0, { v, meet });
  const o = obstacles[obstacles.length - 1]; o.mesh.rotation.y = Math.PI; o.top = 0; S.movers = (S.movers || 0) + 1; // facing the runner, headlights on
}
function addPickup(type, lane, wz) {
  const mesh = type === 'cup' ? makeCup() : type === 'helmet' ? makeHelmet() : makeNdara();
  mesh.position.set(LANES[lane], 1.0, -wz);
  world.add(mesh);
  pickups.push({ type, wz, x: LANES[lane], mesh });
}
function addCoin(lane, wz, y, x = LANES[lane]) {
  const mesh = makeCoin(); mesh.position.set(x, y, -wz);
  world.add(mesh);
  coins.push({ wz, x, y, mesh });
}
// height of whatever the runner would stand on here: the road, a ramp, or a matatu roof
function groundAt(x, z) {
  let h = 0;
  for (const o of obstacles) {
    if (!o.top || o.v || Math.abs(x - o.x) > 0.9) continue;
    const a = o.wz - o.half, b = o.wz + o.half;
    if (z < a - 0.3 || z > b + 0.3) continue;
    h = Math.max(h, o.kind === 'ramp' ? o.top * clamp((z - a) / (b - a), 0, 1) : o.top);
  }
  return h;
}
// where an obstacle will be when someone moving at `speed` from `from` reaches it (oncoming traffic closes in)
const meetAt = (o, from, speed) => o.v ? from + (o.wz - from) * speed / (speed + o.v) : o.wz;
// first obstacle in a lane between two world z values, for Kibaka
function ahead(lane, from, to, kinds) {
  for (const o of obstacles) {
    const w = meetAt(o, from, Math.max(S.speed, 1));
    if (o.lane !== lane || w + o.half < from || w - o.half > to) continue;
    if (!kinds || kinds.includes(o.kind)) return o;
  }
  return null;
}

// ---------- actions ----------
function moveLane(d) { if (S.mode !== 'run') return; const n = clamp(S.lane + d, 0, 2); if (n !== S.lane) { S.lane = n; Sound.sfx('swish'); } }
function onGround() { return S.y <= groundAt(S.x, S.dist) + 0.02; }
function jump() { if (S.mode === 'run' && onGround() && S.slide <= 0.25) { S.vy = 8.6; S.slide = 0; Sound.sfx('jump'); } }
function slide() { if (S.mode !== 'run') return; if (!onGround()) S.vy = -14; S.slide = 0.72; Sound.sfx('swish'); }
function throwNdara() {
  if (S.mode !== 'run' || S.ndara <= 0 || S.throwT >= 0) return;
  S.ndara--; S.throwT = 0; flying.visible = true; Sound.sfx('throw');
}
function shout(text, ms = 1100) { const el = $('shout'); el.textContent = text; el.classList.add('on'); S.shoutLeft = ms / 1000; }
function hitObstacle(o) {
  o.hit = true;
  if (S.shield > 0) { // the helmet takes the knock
    S.shield = 0; S.invuln = 1.0; S.shake = 0.2; burst(S.x, 2.2, -0.4, 0x3ee6c4, 14, 5); Sound.sfx('pick'); shout('KOFIA IMEOKOA!', 900);
    return;
  }
  S.hearts--; S.invuln = 1.5; S.stumble = 0.6; S.gap += 7; S.streak = 0; S.shake = 0.35; S.boost = 0;
  Sound.sfx('hit'); burst(S.x, 1.2 + S.y, -0.6, 0xffffff, 10, 5);
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
  show('caught', true);
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
  for (const o of obstacles) if (o.v && running) { o.wz -= o.v * dt; o.mesh.position.z = -o.wz; }
  fillWorld();

  if (running) {
    if (DEMO) bot();
    S.x += clamp(LANES[S.lane] - S.x, -15 * dt, 15 * dt);
    // gravity, with the ground being the road, a ramp or a matatu roof
    const ground = groundAt(S.x, S.dist);
    S.vy -= 25 * dt; S.y += S.vy * dt;
    if (S.y < ground && ground - S.y < 0.75) { S.y = ground; S.vy = Math.max(0, S.vy); }
    if (S.y < 0) { S.y = 0; S.vy = 0; }
    if (S.y > 2) S.roofT = (S.roofT || 0) + dt;
    for (const k of ['slide', 'invuln', 'stumble', 'boost', 'magnet', 'shield']) S[k] = Math.max(0, S[k] - dt);

    // the gap: Kibaka tires slowly, kahawa and ndara close it faster
    let close = 0.48 - (S.level - 1) * 0.04 + (S.boost > 0 ? 2.6 : 0);
    if (S.gapBonus > 0) { const b = Math.min(S.gapBonus, 7 * dt); S.gapBonus -= b; S.gap -= b; }
    if (DEMO) close = demoClose();
    S.gap -= close * dt;

    thiefAI(dt);
    if (S.dist + S.gap - S.dropAt > 4) { S.dropAt = S.dist + S.gap; if (S.tStun <= 0 && S.gap > 4) addCoin(0, S.dist + S.gap - 0.8, 0.95 + S.ty, S.tx); }

    if (S.invuln <= 0) for (const o of obstacles) {
      if (o.hit || Math.abs(o.wz - S.dist) > o.half + 0.35 || Math.abs(S.x - o.x) > 1.05) continue;
      let hit = false;
      if (o.kind === 'ramp') hit = S.y < o.top * clamp((S.dist - o.wz + o.half) / (2 * o.half), 0, 1) - 0.8; // only from the side
      else if (o.kind === 'block') hit = !(o.top && S.y >= o.top - 0.55);
      else if (o.kind === 'low') hit = S.y < 0.7;
      else if (o.kind === 'high') hit = S.slide <= 0 && S.y < 1.6;
      if (hit) { hitObstacle(o); break; }
    }
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (S.magnet > 0 && c.wz - S.dist < 16 && c.wz - S.dist > -1) { // kahawa pulls the money in
        const k = Math.min(1, dt * 7);
        c.x += (S.x - c.x) * k; c.y += (S.y + 1 - c.y) * k; c.wz += (S.dist - c.wz) * k;
        c.mesh.position.set(c.x, c.y, -c.wz);
      }
      if (Math.abs(c.wz - S.dist) < 0.9 && Math.abs(c.x - S.x) < 0.95 && Math.abs(c.y - (S.y + 0.95)) < 1.4) {
        world.remove(c.mesh); coins.splice(i, 1);
        S.streak++; S.coins += 10 * mult(); Sound.sfx('coin', S.streak); burst(c.x, c.y, -0.4, 0xffe07a, 3, 3);
      }
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (Math.abs(p.wz - S.dist) < 1 && Math.abs(p.x - S.x) < 1 && S.y < 1.6) {
        world.remove(p.mesh); pickups.splice(i, 1);
        burst(p.x, 1.2, -0.4, p.type === 'cup' ? 0xff7a3d : p.type === 'helmet' ? 0x3ee6c4 : 0xff5c8a, 8, 4);
        if (p.type === 'cup') { S.boost = BOOST_TIME; S.magnet = MAGNET_TIME; shout('KAHAWA TUNGU!', 900); Sound.sfx('boost'); }
        else if (p.type === 'helmet') { S.shield = SHIELD_TIME; shout('KOFIA YA BODA!', 900); Sound.sfx('boost'); }
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
  else if (S.mode === 'caught') { S.vy -= 25 * dt; S.y = Math.max(groundAt(S.x, S.dist), S.y + S.vy * dt); } // land after the catch
  if (DEMO) demoTimeline(dt);
  place(dt);
  hud();
}

function thiefAI(dt) {
  const tz = S.dist + S.gap, solid = ['block', 'ramp'];
  S.tStun = Math.max(0, S.tStun - dt);
  const danger = ahead(S.tLane, tz - 0.5, tz + 10);
  if (danger && solid.includes(danger.kind)) {
    const opts = [S.tLane - 1, S.tLane + 1].filter(l => l >= 0 && l <= 2);
    const clear = opts.filter(l => !ahead(l, tz - 2, tz + 14)).concat(opts.filter(l => !ahead(l, tz - 2, tz + 14, solid)));
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
// the first obstacle in lane l between a and b that the runner cannot just run through
function blocking(l, a, b) {
  let first = null;
  for (const o of obstacles) {
    if (o.lane !== l || o.hit) continue;
    const w = meetAt(o, S.dist, Math.max(S.speed, 1));
    if (w + o.half < a || w - o.half > b) continue;
    if (o.kind === 'ramp' && S.lane === l) continue;
    if (o.top && !o.v && (S.y >= o.top - 0.6 || (o.climb && S.lane === l && (S.dist < o.start + 5 || S.y > 0.2)))) continue; // on, or heading up, the ramp
    if (!first || w < meetAt(first, S.dist, S.speed)) first = o;
  }
  return first;
}
function bot() {
  const z = S.dist, look = 3 + S.speed * 0.6;
  const free = l => {
    for (const o of obstacles) {
      if (o.lane !== l || o.hit || (o.top && !o.v && S.y >= o.top - 0.6)) continue;
      if ((o.kind === 'ramp' || o.climb) && z < o.start - 1) continue; // still in time to run up the ramp
      const w = meetAt(o, z, S.speed);
      if (w + o.half > z - 1.5 && w - o.half < z + look + 6) return false;
    }
    return true;
  };
  const o = blocking(S.lane, z, z + look);
  if (o && (o.kind === 'block' || o.kind === 'ramp')) {
    const opts = [S.lane - 1, S.lane + 1].filter(l => l >= 0 && l <= 2);
    const good = opts.filter(free);
    if (good.length) moveLane((good.includes(S.tLane) ? S.tLane : good[0]) - S.lane);
    else if (S.lane !== 1 && free(2 - S.lane)) moveLane(1 - S.lane); // cut across the middle to the far lane
    else moveLane(opts.find(l => !blocking(l, z - 1.5, z + look)) - S.lane || 0);
  } else if (o && o.kind === 'low') { if (meetAt(o, z, S.speed) - o.half - z < 3.4) jump(); }
  else if (o && o.kind === 'high') { if (meetAt(o, z, S.speed) - o.half - z < 4.2 && S.slide <= 0.2) slide(); }
  else if (onGround() && Math.abs(S.x - LANES[S.lane]) < 0.1) {
    // head for a ramp when one is close: the roof run is the best bit
    const ramp = obstacles.find(r => r.kind === 'ramp' && r.wz + r.half > z && r.wz - z < 40 && (r.lane === S.lane || r.wz - r.half - z > 3));
    const want = ramp ? ramp.lane : S.y < 0.5 ? S.tLane : S.lane;
    if (want !== S.lane) { const step = Math.sign(want - S.lane); if (free(S.lane + step)) moveLane(step); }
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

  const menu = S.mode === 'menu', gz = menu ? 13 : S.gap, lean = LANES[S.lane] - S.x;
  if (menu) S.tx = Math.sin(S.t * 0.7) * 1.4;
  hero.visible = !(S.invuln > 0 && Math.floor(S.t * 14) % 2 === 0);
  hero.position.set(menu ? -0.65 : S.x, S.y, menu ? 1.4 : 0);
  hero.rotation.z = clamp(lean * -0.16, -0.32, 0.32); // bank into lane changes
  hero.rotation.y = menu ? Math.PI - .3 : clamp(lean * -0.28, -0.45, 0.45);
  hero.userData.pose(menu ? 'cheer' : S.mode === 'caught' ? 'cheer' : S.mode === 'over' ? 'idle' : S.slide > 0 ? 'slide' : !onGround() ? 'jump' : 'run', S.speed, dt);
  thief.position.set(S.mode === 'caught' ? S.x + 0.9 : S.tx, S.mode === 'caught' ? S.y : S.ty, -gz);
  thief.rotation.y = clamp((LANES[S.tLane] - S.tx) * -0.25, -0.4, 0.4);
  thief.userData.pose(S.mode === 'caught' ? 'caught' : S.mode === 'over' ? 'idle' : S.tStun > 0 ? 'stun' : S.tSlide > 0 ? 'slide' : S.ty > 0.05 ? 'jump' : 'run', S.speed * 1.05, dt);
  // the bodaboda helmet sits on the runner's head while the shield lasts
  helmet.visible = hero.visible && S.shield > 0 && !(S.shield < 2 && Math.floor(S.t * 8) % 2 === 0);
  if (helmet.visible) { hero.updateMatrixWorld(true); headBone.getWorldPosition(helmet.position); helmet.position.y += 0.3; helmet.rotation.set(0, hero.rotation.y, hero.rotation.z); }

  for (const c of coins) { c.mesh.visible = c.wz - S.dist < 85; c.mesh.rotation.y = S.t * 5 + c.wz; } // far coins are specks
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
  // Far-off people are a few pixels tall, so they are skipped to keep the frame cheap on phones.
  for (const chunk of chunks) {
    const near = chunk.end - S.dist < 95;
    for (const p of chunk.g.children) {
      if (!p.userData.streetPerson) continue;
      p.visible = near;
      if (near) p.rotation.z = Math.sin(S.t * 2.2 + p.userData.phase) * .025;
    }
  }
  // over-the-shoulder camera that eases after the runner, rises onto the roofs and widens with speed
  const k = Math.min(1, dt * 6), portrait = camera.aspect < 1, sh = S.shake * 0.5;
  S.camX += (S.x * 0.6 - S.camX) * k; S.camY += (S.y * 0.85 - S.camY) * Math.min(1, dt * 4);
  camera.position.set(S.camX + (Math.random() - 0.5) * sh, (menu ? 2.8 : portrait ? 3.4 : 3.1) + S.camY + (Math.random() - 0.5) * sh, menu ? 6.4 : portrait ? 5.5 : 5.2);
  camera.lookAt(S.camX * 0.75, (menu ? 1.8 : 1.6) + S.camY * 0.9, menu ? -2 : -10);
  const fov = (portrait ? 64 : 55) + (menu ? -6 : clamp((S.speed - 12) * 0.45, 0, 6)) + (S.boost > 0 ? 8 : 0);
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
  show('boost', S.magnet > 0); $('boostFill').style.width = (S.magnet / MAGNET_TIME * 100) + '%';
  show('shieldBar', S.shield > 0); $('shieldFill').style.width = (S.shield / SHIELD_TIME * 100) + '%';
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
  window.__state = () => ({ mode: S.mode, t: +S.demoT.toFixed(1), dist: Math.round(S.dist), gap: +S.gap.toFixed(1), y: +S.y.toFixed(2), hearts: S.hearts, shield: +S.shield.toFixed(1), movers: S.movers || 0, roof: +(S.roofT || 0).toFixed(1) });
  window.__music = secs => Sound.renderWav(secs);
  window.__debug = () => ({ S, obstacles: obstacles.map(o => ({ type: o.type, lane: o.lane, wz: +o.wz.toFixed(1), v: o.v, climb: o.climb })) });
  frame(1 / 30);
  window.__ready = true;
} else {
  let last = performance.now();
  const loop = now => { const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
