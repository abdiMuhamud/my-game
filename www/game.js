import * as THREE from 'three';
import { RoomEnvironment } from './lib/environments/RoomEnvironment.js';
import { buildChunk, buildObstacle, makeCoin, makeCup, makeNdara, makeHelmet, makeHelmetModel, makeTuktuk, makeRideToken, makeCraneLoad, makeClouds, makeRoadTexture, makeSeaNormal, loadReal, REAL, Lam, curveMat, CURVE, PAL, hooks, WIND } from './world.js';
import { loadPeople, makeHero, makeThief } from './people.js';
import { LEVELS, DEMO_ROUTE, makeRoute } from './levels.js';
import { T, TS, applyI18n, setLang, getLang } from './i18n.js';
import { Sound } from './sound.js';
import { createFX, Settings, saveSettings, haptic } from './fx.js';

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
const GAP_START = 16, GAP_CATCH = 1.7, GAP_LOST = 38;
const BOOST_TIME = 4, MAGNET_TIME = 6, SHIELD_TIME = 10, RIDE_TIME = 7;
const CROWD_ZONES = ['marikiti', 'oldtown', 'digo'], CROSS_ZONES = ['digo', 'stage'];
const DEMO_LEVEL = { id: 0, route: DEMO_ROUTE, pace: 1, coins: 0 };

// level being played (null = endless) and the street layout it implies
let level = null, route = makeRoute(DEMO ? DEMO_LEVEL : null);
const segAt = wz => route.at(wz);
const zoneAt = wz => segAt(wz).zone;
const label = z => z[getLang()] || z.name;

// the canvas textures use the game font, so it has to be ready before anything is drawn
await Promise.all([document.fonts.load('20px "Lilita One"'), document.fonts.load('800 14px Nunito')]).catch(() => {});
applyI18n();
$('loadTip').textContent = T('tip' + (1 + Math.floor(Math.random() * 5)));
await loadReal(p => { $('loadFill').style.width = (5 + p * 35) + '%'; }); // photo surfaces first: the road and walls are painted with them

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.haze, 120, VIEW + 40); // clear coastal air
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // reflections for the metal tusks
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
const hemi = new THREE.HemisphereLight(0xd4ecff, 0xf0d29a, 1.45);
const sun = new THREE.DirectionalLight(0xffe2b0, 2.6); // warm afternoon sun over the coast
sun.position.set(-16, 26, 6); sun.target.position.set(0, 0, -22);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 38, bottom: -34, near: 1, far: 90 });
scene.add(hemi, sun, sun.target);

// the sea is always there; chunks simply leave it uncovered where the coast shows
// the Indian Ocean: dark water with moving ripples that mirror the sky
const seaTex = makeSeaNormal(); seaTex.repeat.set(90, 64);
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(700, 500, 1, 60), Lam({ color: 0x0b4f60, roughness: 0.06, metalness: 0.25, normalMap: seaTex, normalScale: new THREE.Vector2(0.45, 0.45) }));
ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -1.1, -170);
const roadTex = makeRoadTexture(); roadTex.repeat.set(1, 280 / 8);
const roadN = REAL.asphaltN.clone(), roadR = REAL.asphaltR.clone(); // asphalt bumps and wear, tiled every 2.7 m
for (const t of [roadN, roadR]) { t.needsUpdate = true; t.repeat.set(3, 280 / 8 * 3); }
const road = new THREE.Mesh(new THREE.PlaneGeometry(8, 280, 1, 70), Lam({ map: roadTex, normalMap: roadN, roughnessMap: roadR, roughness: 1 }));
road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -120); road.receiveShadow = true;
const clouds = makeClouds();
scene.add(ocean, road, clouds);
const fx = createFX({ renderer, scene, camera, hemi, sun, clouds, capture: CAPTURE });
await fx.load(p => { $('loadFill').style.width = (40 + p * 20) + '%'; }); fx.light('day');
Sound.volumes(Settings.music, Settings.sfx); Sound.init();
// lighting mood: night for Nyali, golden hour for the Bamburi finale, otherwise a bright coastal day
const levelMood = () => level?.night ? 'night' : level?.id === 6 ? 'sunset' : 'day';

const world = new THREE.Group(); // everything is placed at z = -worldZ; the group slides toward the camera
scene.add(world);

await loadPeople(p => { $('loadFill').style.width = (60 + p * 40) + '%'; });
const hero = makeHero(), thief = makeThief();
hero.scale.setScalar(1.32); thief.scale.setScalar(1.25);
const flying = makeNdara(); flying.visible = false;
const helmet = makeHelmetModel(); helmet.scale.setScalar(0.8); helmet.visible = false; // worn while the shield lasts
const headBone = hero.userData.bone('Head');
scene.add(hero, thief, flying, helmet);
// a few neighbours cheering the runner on, on the home screen
const fans = new THREE.Group();
scene.add(fans);
let rideMesh = null; // the tuk-tuk the runner is hanging on to

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
  t: 0, dist: 0, level: 1, lane: 1, x: 0, y: 0, vy: 0, slide: 0, invuln: 0, stumble: 0, hits: 0,
  gap: GAP_START, gapBonus: 0, boost: 0, magnet: 0, shield: 0, ride: 0, hearts: 3, coins: 0, bounty: 0, catches: 0, ndara: 1, streak: 0,
  tLane: 1, tx: 0, ty: 0, tvy: 0, tSlide: 0, tStun: 0, tWander: 2, dropAt: 0, nextCrowd: 60,
  throwT: -1, shake: 0, slowT: 0, punch: 0, nearCd: 0, stepT: 0, stepN: 0, introT: 0, introSaid: 0, tutOn: null, tutT: 0, nextRow: 40, nextChunk: 0, lastSeg: -1, camX: 0, camY: 0, trainShown: false, rideShown: false,
});
const S = { mode: 'menu', speed: 6, demoT: 0, shoutLeft: 0, timeScale: 1, sunsetT: -1, ...FRESH() };
const chunks = [], obstacles = [], coins = [], pickups = [], crowds = [];
const busy = [0, 0, 0]; // world z up to which a lane is taken by a line of parked matatus or containers
let best = 0, progress = {};
try { best = +(localStorage.getItem('mwizi.best') || 0); progress = JSON.parse(localStorage.getItem('mwizi.progress') || '{}'); } catch { /* fresh start */ }
const saveProgress = () => { try { localStorage.setItem('mwizi.progress', JSON.stringify(progress)); localStorage.setItem('mwizi.best', best); } catch { /* not saved */ } };
$('best').textContent = best.toLocaleString();
if (DEMO) progress = { 1: 3 }; // the video shows level 2 ready to play (nothing is saved)

function clearWorld() {
  for (const c of chunks) world.remove(c.g);
  for (const list of [obstacles, coins, pickups]) for (const o of list) world.remove(o.mesh);
  for (const c of crowds) world.remove(c.g);
  chunks.length = obstacles.length = coins.length = pickups.length = crowds.length = 0;
  busy.fill(0);
  if (rideMesh) { scene.remove(rideMesh); rideMesh = null; }
}
function resetRun() { clearWorld(); Object.assign(S, FRESH()); }

// ---------- spawning ----------
function fillWorld() {
  while (S.nextChunk * CHUNK < S.dist + VIEW + CHUNK) {
    const i = S.nextChunk++, mid = i * CHUNK + CHUNK / 2, s = segAt(mid);
    const zone = { ...s.zone, label: label(s.zone) };
    const g = buildChunk(i, zone, { first: segAt(mid - CHUNK).index !== s.index || i === 0, zoneChunk: Math.floor((mid - s.start) / CHUNK) }, rnd);
    g.position.z = -mid;
    world.add(g);
    chunks.push({ g, end: mid + CHUNK / 2 });
  }
  while (chunks.length && chunks[0].end < S.dist - 14) world.remove(chunks.shift().g);
  if (S.mode === 'menu') return;
  while (S.nextRow < S.dist + VIEW - 30) { spawnRow(S.nextRow); S.nextRow += rowGap(); }
  for (const list of [obstacles, coins, pickups]) for (let i = list.length - 1; i >= 0; i--) if (list[i].wz < S.dist - 8) { world.remove(list[i].mesh); list.splice(i, 1); }
}
function difficulty() { return clamp(S.dist / 2600 + (S.level - 1) * 0.18 + (level ? (level.id - 1) * 0.08 : 0), 0, 1); }
function rowGap() { return (DEMO ? 21 : 24) - difficulty() * 8 + rnd() * 7; }

const LOW = ['cart', 'crates', 'barrier', 'cones'], HIGH = ['kanga', 'sign'];
function pickObstacle() {
  const r = rnd();
  return r < 0.22 ? 'tuktuk' : r < 0.34 ? 'matatu' : r < 0.67 ? pick(LOW) : pick(HIGH);
}
function spawnRow(wz) {
  const d = difficulty(), zid = zoneAt(wz).id, port = zid === 'port';
  if (level && !DEMO && wz > route.length + 20) return; // nothing past the end of the level
  // street specials: bodabodas cutting across, crane loads swinging over the quay
  if (CROSS_ZONES.includes(zid) && wz > 60 && rnd() < 0.38) { addCrosser(wz); return; }
  if (port && wz > 60 && rnd() < 0.3) { addCrane(wz); return; }
  const open = [0, 1, 2].filter(l => busy[l] < wz - 2).sort(() => rnd() - 0.5);
  if (!open.length) return;
  // a line of parked matatus (containers at the port), usually with a ramp at the back: run up and along the roofs
  const forced = DEMO && !S.trainShown && (zid === 'port' || zid === 'stage');
  const wantTrain = forced || (!DEMO && rnd() < (port ? 0.34 : 0.2)) || (DEMO && rnd() < 0.12);
  if (open.length === 3 && wantTrain) {
    const l = forced ? 1 : open[open.length - 1], withRamp = forced || rnd() < 0.75, n = 2 + ri(2), type = port ? 'container' : 'matatu';
    open.splice(open.indexOf(l), 1);
    S.trainShown = S.trainShown || forced;
    let z = wz;
    if (withRamp) { addObstacle('ramp', l, z + 2.5, { climb: true, start: wz }); z += 5; }
    const len = port ? 6.1 : 4.6, top = port ? 2.6 : 2.5;
    for (let k = 0; k < n; k++) { addObstacle(type, l, z + len / 2 - 0.1, { climb: withRamp, start: wz }); z += len; }
    busy[l] = z + 1;
    if (withRamp) for (let c = wz + 1; c < z - 0.5; c += 1.6) addCoin(l, c, (c < wz + 5 ? 2.5 * (c - wz) / 5 : top) + 1.0);
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
    const r = rnd(), rideZone = zid === 'centre' || zid === 'nyali' || zid === 'fort';
    if (DEMO && !S.rideShown && zid === 'centre') { addPickup('ride', safe, wz); S.rideShown = true; }
    else if (r < 0.1) addPickup('cup', safe, wz);
    else if (r < 0.2) addPickup('ndara', safe, wz);
    else if (r < 0.26) addPickup('helmet', safe, wz);
    else if (!DEMO && r < (rideZone ? 0.4 : 0.31)) addPickup('ride', safe, wz); // the video shows just the one ride
    else if (r < 0.78) for (let c = 0; c < 6; c++) addCoin(safe, wz - 6 + c * 2.2, 1.0);
  }
  if (zid !== 'oldtown' && rnd() < 0.2 + d * 0.15) addMover(wz + 10);
}
function addObstacle(type, lane, wz, extra) {
  const o = buildObstacle(type, rnd);
  o.mesh.position.set(LANES[lane], 0, -wz);
  world.add(o.mesh);
  const ob = { type, kind: o.kind, half: o.half, top: o.top, lane, x: LANES[lane], wz, v: 0, mesh: o.mesh, hit: false, ...extra };
  obstacles.push(ob);
  return ob;
}
// a bodaboda waiting on the sidewalk that cuts across the road just as the runner arrives
function addCrosser(wz) {
  const dir = rnd() < 0.5 ? 1 : -1, x0 = -dir * 5.4;
  const o = addObstacle('boda', 1, wz, { lane: -1, cross: { dir, vx: 6 + rnd() * 2, x0, target: ri(3), active: false, done: false } });
  o.x = x0; o.mesh.position.x = x0; o.mesh.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  if (hooks.rider) { const r = hooks.rider(rnd); r.rotation.y = Math.PI; r.position.set(0, 0.02, 0.18); o.mesh.add(r); }
  for (let c = 0; c < 5; c++) addCoin(ri(3), wz + 8 + c * 2.2, 1.0);
}
// a Kilindini crane swinging a container from one side of the road to the other
function addCrane(wz) {
  const o = addObstacle('crane', 1, wz, { lane: -1, swing: { A: 3.0, w: 1.3 + rnd() * 0.5, ph: rnd() * 6.28 } });
  o.load = makeCraneLoad(); o.mesh.add(o.load);
  for (let c = 0; c < 6; c++) addCoin(ri(3), wz - 12 + c * 2.2, 1.0);
}
// oncoming matatu or tuk-tuk: only placed where it meets the runner on an otherwise empty stretch of road
function addMover(w0) {
  const v = 6 + rnd() * 4, sp = Math.max(S.speed, 12), meet = S.dist + (w0 - S.dist) * sp / (sp + v);
  if (meet < S.dist + 30 || obstacles.some(o => o.v && Math.abs(o.meet - meet) < 16)) return;
  const solidNear = m => obstacles.some(o => (o.lane === m || o.lane < 0) && !o.v && (o.kind === 'block' || o.kind === 'ramp') && Math.abs(o.wz - meet) < o.half + 6);
  // its lane must be clear all the way, and at the meeting point one of the other lanes must still be open
  const lanes = [0, 1, 2].filter(l => busy[l] < meet - 8
    && !obstacles.some(o => (o.lane === l || o.lane < 0) && !o.v && o.wz + o.half > meet - 8 && o.wz - o.half < w0 + 4)
    && [0, 1, 2].filter(m => m !== l && solidNear(m)).length < 2);
  if (!lanes.length) return;
  const o = addObstacle(rnd() < 0.55 ? 'tuktuk' : 'matatu', pick(lanes), w0, { v, meet });
  o.mesh.rotation.y = Math.PI; o.top = 0; // facing the runner, headlights on
}
function addPickup(type, lane, wz) {
  const mesh = type === 'cup' ? makeCup() : type === 'helmet' ? makeHelmet() : type === 'ride' ? makeRideToken() : makeNdara();
  mesh.position.set(LANES[lane], 1.0, -wz);
  world.add(mesh);
  pickups.push({ type, wz, x: LANES[lane], mesh });
}
function addCoin(lane, wz, y, x = LANES[lane]) {
  const mesh = makeCoin(); mesh.position.set(x, y, -wz);
  world.add(mesh);
  coins.push({ wz, x, y, mesh });
}
// the crowd steps into the road in front of Kibaka; if you are in his lane, they block him
function crowdEvent() {
  const wz = S.dist + S.gap + 7, lane = S.tLane, block = S.lane === S.tLane, g = new THREE.Group();
  for (let k = 0; k < 3; k++) { const p = hooks.bystander(rnd); p.position.set(LANES[lane] + (k - 1) * 0.75, 0, 0); p.rotation.y = (rnd() - 0.5) * 0.6; g.add(p); }
  g.position.z = -wz; world.add(g);
  crowds.push({ g, wz, lane, block, done: false, t: 0 });
  shout(T('sh_crowd'), 900); Sound.sfx('crowd');
  if (!block) { const opts = [lane - 1, lane + 1].filter(l => l >= 0 && l <= 2); S.tLane = pick(opts); } // he swerves round them
}
// height of whatever the runner would stand on here: the road, a ramp, or a roof
function groundAt(x, z) {
  let h = 0;
  for (const o of obstacles) {
    if (!o.top || o.v || o.hit || Math.abs(x - o.x) > 0.9) continue;
    const a = o.wz - o.half, b = o.wz + o.half;
    if (z < a - 0.3 || z > b + 0.3) continue;
    h = Math.max(h, o.kind === 'ramp' ? o.top * clamp((z - a) / (b - a), 0, 1) : o.top);
  }
  return h;
}
// where an obstacle will be when someone moving at `speed` from `from` reaches it (oncoming traffic closes in)
const meetAt = (o, from, speed) => o.v ? from + (o.wz - from) * speed / (speed + o.v) : o.wz;
// where a sideways mover will be in tA seconds
function xAt(o, tA) {
  if (o.cross) return o.cross.active ? o.x + o.cross.dir * o.cross.vx * tA : o.cross.done ? o.x : LANES[o.cross.target];
  if (o.swing) return o.swing.A * Math.sin(o.swing.w * (S.t + tA) + o.swing.ph);
  return o.x;
}
const inLane = (o, l, tA) => (o.cross || o.swing) ? Math.abs(xAt(o, tA) - LANES[l]) < 1.7 : o.lane === l;
// first obstacle in a lane between two world z values, for Kibaka (he ignores the sideways movers)
function ahead(lane, from, to, kinds) {
  for (const o of obstacles) {
    const w = meetAt(o, from, Math.max(S.speed, 1));
    if (o.lane !== lane || w + o.half < from || w - o.half > to) continue;
    if (!kinds || kinds.includes(o.kind)) return o;
  }
  return null;
}

// ---------- actions ----------
function moveLane(d) { if (S.mode !== 'run') return; const n = clamp(S.lane + d, 0, 2); if (n !== S.lane) { S.lane = n; Sound.sfx('swish'); tutDone('lane'); } }
function onGround() { return S.y <= groundAt(S.x, S.dist) + 0.02; }
function jump() { if (S.mode === 'run' && S.ride <= 0 && onGround() && S.slide <= 0.25) { S.vy = 8.6; S.slide = 0; Sound.sfx('jump'); dust(); tutDone('jump'); } }
function slide() { if (S.mode !== 'run' || S.ride > 0) return; if (!onGround()) S.vy = -14; S.slide = 0.72; Sound.sfx('slide'); dust(); tutDone('slide'); }
function throwNdara() {
  if (S.mode !== 'run' || S.ndara <= 0 || S.throwT >= 0) return;
  S.ndara--; S.throwT = 0; flying.visible = true; Sound.sfx('throw'); tutDone('throw');
}
function shout(text, ms = 1100) { const el = $('shout'); el.textContent = text; el.classList.add('on'); S.shoutLeft = ms / 1000; }
function say(text, voiceKey, ms) { shout(text, ms); if (voiceKey) Sound.voice(voiceKey); }
function dust(n = 6) { burst(S.x, S.y + 0.1, -0.2, 0xe8dcc0, n, 2.2); }
function land() { Sound.sfx('land'); S.punch = 0.16; dust(8); haptic(12); }
function nearMiss() { // something big whooshed past right beside you: a beat of slow motion and a bonus
  S.nearCd = 1.6; S.slowT = 0.32; S.shake = 0.12; S.coins += 20 * mult();
  burst(S.x, 1.5, -0.6, 0xffffff, 6, 3); say(pick(TS('sh_near')), 'waah', 700); Sound.sfx('near'); haptic([10, 30, 10]);
}
function toScreen(x, y, z) {
  camera.updateMatrixWorld(); v3.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
  v3.x += v3.z * v3.z * CURVE.x; v3.y -= v3.z * v3.z * CURVE.y; v3.applyMatrix4(camera.projectionMatrix);
  return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight];
}
function hitObstacle(o) {
  o.hit = true;
  if (S.shield > 0) { // the helmet takes the knock
    S.shield = 0; S.invuln = 1.0; S.shake = 0.2; burst(S.x, 2.2, -0.4, 0x3ee6c4, 14, 5); Sound.sfx('pick'); shout(T('sh_saved'), 900);
    return;
  }
  S.hits++; S.hearts--; S.invuln = 1.5; S.stumble = 0.6; S.gap += 7; S.streak = 0; S.shake = 0.35; S.boost = 0;
  Sound.sfx('hit'); burst(S.x, 1.2 + S.y, -0.6, 0xffffff, 10, 5);
  haptic(120);
  if (S.hearts <= 0) return gameOver('fall');
  say(pick(TS('sh_hit')), rnd() < 0.5 ? 'pole' : 'aisee', 700);
}
function smash(o) { // riding the tuk-tuk: straight through
  o.hit = true; o.mesh.visible = false; S.shake = 0.25;
  burst(o.x, 1.2, -(o.wz - S.dist) - 1.5, 0xffc21a, 12, 6); Sound.sfx('hit');
  if (rnd() < 0.5) shout(T('sh_smash'), 500);
}
function startRun() {
  fans.visible = false;
  resetRun(); S.mode = 'run';
  for (const id of ['menu', 'map', 'over', 'caught', 'result']) show(id, false);
  show('hud', true); show('tag', true); show('btnThrow', true);
  Sound.start(false); Sound.calm = false;
  fx.light(levelMood()); S.sunsetT = -1;
  tut = level?.id === 1 && !DEMO && !stored('mwizi.tut') ? {} : null; show('tut', false); show('introCap', false);
  say(level?.night ? T('sh_night') : T('sh_start'), 'mwizi', 1400);
}
function startLevel(lv) { level = lv; route = makeRoute(lv); if (lv.id === 1 && !stored('mwizi.intro')) beginIntro(); else startRun(); }
function startEndless() { level = null; route = makeRoute(null); startRun(); }
function caught() {
  S.mode = 'caught'; S.catches++; show('tag', false); S.bounty += 1000 * S.level;
  Sound.sfx('win'); burst(S.tx, 1.4 + S.y, -S.gap, PAL.sun, 16, 6);
  fx.confetti(); S.slowT = 0.9; haptic([40, 60, 90]); Sound.voice('umemshika'); Sound.calm = true;
  if (DEMO) { shout(T('sh_caught'), 2200); return; }
  if (level) return levelWin();
  $('caughtText').textContent = T('caught_text', { zone: label(zoneAt(S.dist)) });
  $('caughtCash').textContent = (S.coins + S.bounty).toLocaleString();
  show('caught', true);
}
function chaseAgain() {
  S.level++; S.gap = GAP_START + 2; S.gapBonus = 0; S.tStun = 0; S.hearts = Math.min(3, S.hearts + 1); S.mode = 'run';
  show('caught', false); show('tag', true);
  say(T('sh_again'), 'ametoroka', 1200); Sound.calm = false;
}
const starIcons = (n, total = 3) => Array.from({ length: total }, (_, i) => `<svg class="${i < n ? '' : 'off'}"><use href="#i-star"/></svg>`).join('');
function goalsHtml(lv, got) {
  return [T('s_catch'), T('s_coins', { n: lv.coins.toLocaleString() }), T('s_clean')]
    .map((txt, i) => `<li class="${got && !got[i] ? 'off' : ''}"><svg><use href="#i-star"/></svg>${txt}</li>`).join('');
}
function levelWin() {
  const got = [true, S.coins >= level.coins, S.hits === 0], stars = got.filter(Boolean).length;
  progress[level.id] = Math.max(progress[level.id] || 0, stars);
  best = Math.max(best, S.coins + S.bounty); saveProgress();
  $('resBand').textContent = T('win_band'); $('resBand').className = 'band win';
  $('resStars').innerHTML = starIcons(stars);
  const next = LEVELS.find(l => l.id === level.id + 1);
  $('resText').textContent = next ? T('win_text', { title: level[getLang()].title }) : T('all_done');
  countUp('resCash', S.coins + S.bounty); Sound.calm = true;
  $('resGoals').innerHTML = goalsHtml(level, got);
  show('btnNext', !!next);
  show('hud', false); show('btnThrow', false); show('result', true);
}
function gameOver(why) {
  const banked = why === 'bank', total = S.coins + (banked ? S.bounty : 0), zn = label(zoneAt(S.dist));
  S.mode = 'over';
  if (total > best) { best = total; saveProgress(); }
  $('overBand').textContent = T(banked ? 'band_win' : why === 'fall' ? 'band_fall' : why === 'quit' ? 'band_quit' : 'band_lost');
  $('overBand').className = 'band' + (banked ? ' win' : '');
  $('overHead').textContent = banked ? T('over_win', { zone: zn }) : why === 'finish' ? T('over_finish') : why === 'lost' ? T('over_lost', { zone: zn }) : T('over_end', { zone: zn });
  countUp('overCash', total); Sound.calm = true;
  $('overDist').textContent = Math.round(S.dist) + ' m';
  $('overCatch').textContent = S.catches;
  $('overBest').textContent = best.toLocaleString();
  $('best').textContent = best.toLocaleString();
  S.lastTotal = total;
  show('caught', false); show('hud', false); show('tag', false); show('btnThrow', false); show('over', true);
  if (!banked) Sound.sfx('lose');
}
function countUp(id, to) { // results tick up instead of appearing at once
  const el = $(id), t0 = performance.now();
  const tick = now => { const k = Math.min(1, (now - t0) / 900); el.textContent = Math.round(to * k * (2 - k)).toLocaleString(); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
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
  if (S.mode === 'intro') { introUpdate(dt); if (DEMO) demoTimeline(dt); place(dt); return; }
  const running = S.mode === 'run';
  const target = S.mode === 'menu' ? 5 : running ? (DEMO ? 17 : 12.5 + S.level * 1.4 + (level ? level.id * 0.35 : 0) + Math.min(S.t * 0.045, 4.5)) : 0;
  S.speed += (target * (S.stumble > 0 ? 0.55 : 1) * (S.boost > 0 ? 1.18 : 1) * (S.ride > 0 ? 1.25 : 1) - S.speed) * Math.min(1, dt * 4);
  S.dist += S.speed * dt;
  if (running) moveObstacles(dt);
  fillWorld();

  if (running) {
    if (DEMO) bot();
    S.x += clamp(LANES[S.lane] - S.x, -15 * dt, 15 * dt);
    // gravity, with the ground being the road, a ramp or a roof (or the tuk-tuk's back step)
    const ground = groundAt(S.x, S.dist);
    S.vy -= 25 * dt; S.y += S.vy * dt;
    if (S.y < ground && ground - S.y < 0.75) { if (S.vy < -6) land(); S.y = ground; S.vy = Math.max(0, S.vy); }
    if (S.y < 0) { if (S.vy < -6) land(); S.y = 0; S.vy = 0; }
    if (S.ride > 0) { S.y = 0.35; S.vy = 0; }
    if (S.y > 2) S.roofT = (S.roofT || 0) + dt;
    if (S.ride <= 0 && S.slide <= 0 && onGround() && (S.stepT -= dt) <= 0) { S.stepT = 0.37 * 10.5 / Math.max(S.speed, 8); Sound.sfx('step', S.stepN++); }
    S.nearCd -= dt; S.punch = Math.max(0, S.punch - dt);
    if (tut) tutorialCheck(dt);
    const wasRiding = S.ride > 0;
    for (const k of ['slide', 'invuln', 'stumble', 'boost', 'magnet', 'shield', 'ride']) S[k] = Math.max(0, S[k] - dt);
    if (wasRiding && S.ride <= 0) { scene.remove(rideMesh); rideMesh = null; S.invuln = 1.0; S.y = 0; }

    // the gap: Kibaka tires slowly, kahawa and ndara close it faster
    let close = (0.48 - (S.level - 1) * 0.04) * (level ? level.pace : 1) + (S.boost > 0 ? 2.6 : 0) + (S.ride > 0 ? 1.4 : 0);
    if (S.gapBonus > 0) { const b = Math.min(S.gapBonus, 7 * dt); S.gapBonus -= b; S.gap -= b; }
    if (DEMO) close = demoClose();
    S.gap -= close * dt;

    thiefAI(dt);
    if (S.dist + S.gap - S.dropAt > 4) { S.dropAt = S.dist + S.gap; if (S.tStun <= 0 && S.gap > 4) addCoin(0, S.dist + S.gap - 0.8, 0.95 + S.ty, S.tx); }
    if (CROWD_ZONES.includes(zoneAt(S.dist).id) && S.dist > S.nextCrowd && S.gap > 5) { crowdEvent(); S.nextCrowd = S.dist + 140 + rnd() * 80; }
    updateCrowds(dt);

    if (S.invuln <= 0) for (const o of obstacles) {
      if (o.hit || Math.abs(o.wz - S.dist) > o.half + 0.35 || Math.abs(S.x - o.x) > 1.05) continue;
      let hit = false;
      if (o.kind === 'ramp') hit = S.y < o.top * clamp((S.dist - o.wz + o.half) / (2 * o.half), 0, 1) - 0.8; // only from the side
      else if (o.kind === 'block') hit = !(o.top && S.y >= o.top - 0.55);
      else if (o.kind === 'low') hit = S.y < 0.7;
      else if (o.kind === 'high') hit = S.slide <= 0 && S.y < 1.6;
      if (S.ride > 0 && (hit || o.kind !== 'ramp')) { smash(o); continue; }
      if (hit) { hitObstacle(o); break; }
    }
    for (const o of obstacles) { // near misses: something big whooshes past right beside you
      if (o.hit || o.passed || o.wz + o.half > S.dist - 0.3) continue;
      o.passed = true;
      const dx = Math.abs(S.x - o.x);
      if ((o.kind === 'block' || o.v) && dx > 1.05 && dx < 2.3 && S.y < (o.top || 2.6) - 0.4 && S.nearCd <= 0 && S.ride <= 0) nearMiss();
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
        const [sx, sy] = toScreen(c.x, c.y, -(c.wz - S.dist)); fx.coinFly(sx, sy); if (S.streak % 5 === 0) haptic(6);
      }
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (Math.abs(p.wz - S.dist) < 1 && Math.abs(p.x - S.x) < 1 && S.y < 1.6) {
        world.remove(p.mesh); pickups.splice(i, 1);
        burst(p.x, 1.2, -0.4, { cup: 0xff7a3d, helmet: 0x3ee6c4, ride: 0xffc21a }[p.type] || 0xff5c8a, 8, 4);
        if (p.type === 'cup') { S.boost = BOOST_TIME; S.magnet = MAGNET_TIME; say(T('sh_coffee'), 'kahawa', 900); Sound.sfx('boost'); haptic(25); }
        else if (p.type === 'helmet') { S.shield = SHIELD_TIME; say(T('sh_helmet'), 'kofia', 900); Sound.sfx('boost'); haptic(25); }
        else if (p.type === 'ride') { S.ride = RIDE_TIME; S.slide = 0; if (!rideMesh) { rideMesh = makeTuktuk(ri(4)); scene.add(rideMesh); } say(T('sh_ride'), 'panda', 1000); Sound.sfx('boost'); Sound.sfx('tuk'); haptic(35); }
        else { S.ndara = Math.min(9, S.ndara + 1); Sound.sfx('pick'); }
      }
    }
    if (S.throwT >= 0) {
      S.throwT += dt / 0.42;
      if (S.throwT >= 1) {
        S.throwT = -1; flying.visible = false; S.tStun = 1.1; S.gapBonus += DEMO ? clamp(S.gap - demoFloor(), 0, 5.5) : 5.5; S.shake = 0.2;
        burst(S.tx, 1.5, -S.gap, 0xff5c8a, 10, 5);
        shout(pick(TS('sh_throw')), 800); Sound.sfx('hit'); Sound.voice('shika_huyo'); haptic(30);
      }
    }
    if (S.mode === 'run') {
      if (S.gap <= GAP_CATCH) caught();
      else if (S.gap >= GAP_LOST) gameOver('lost');
      else if (level && !DEMO && S.dist >= route.length) gameOver('finish');
    }
    const si = segAt(S.dist).index;
    Sound.ambience(['sea', 'beach', 'bridge', 'palms'].includes(zoneAt(S.dist).L) ? 'sea' : 'street');
    if (si !== S.lastSeg) { if (S.lastSeg >= 0 && !DEMO) shout(label(zoneAt(S.dist)), 1300); S.lastSeg = si; }
  } else if (S.mode === 'caught') { S.vy -= 25 * dt; S.y = Math.max(groundAt(S.x, S.dist), S.y + S.vy * dt); } // land after the catch
  if (DEMO) demoTimeline(dt);
  place(dt);
  hud();
}
function moveObstacles(dt) {
  for (const o of obstacles) {
    if (o.v) { o.wz -= o.v * dt; o.mesh.position.z = -o.wz; if (!o.honked && o.wz - S.dist < 30) { o.honked = true; Sound.sfx(o.type === 'tuktuk' ? 'tuk' : 'matatu'); } }
    if (o.cross && !o.cross.done) { // bodaboda: waits on the sidewalk, then cuts across to arrive in its lane with the runner
      const c = o.cross, tA = (o.wz - S.dist) / Math.max(S.speed, 1);
      if (!c.active && tA <= (LANES[c.target] - c.x0) * c.dir / c.vx) { c.active = true; Sound.sfx('tuk'); }
      if (c.active) { o.x += c.dir * c.vx * dt; o.mesh.position.x = o.x; if (o.x * c.dir > 5.4) { c.active = false; c.done = true; } }
    }
    if (o.swing) { const s = o.swing, a = s.w * S.t + s.ph; o.x = s.A * Math.sin(a); o.load.position.x = o.x; o.load.rotation.z = -Math.cos(a) * 0.12; }
  }
}
function updateCrowds(dt) {
  for (let i = crowds.length - 1; i >= 0; i--) {
    const c = crowds[i];
    if (!c.done && S.dist + S.gap >= c.wz - 1.2) {
      c.done = true;
      if (c.block && S.tLane === c.lane) { S.tStun = 1.4; S.gapBonus += 4; S.shake = 0.15; say(T('sh_blocked'), 'wamemzuia', 1000); Sound.sfx('hit'); haptic(30); }
    }
    if (c.done) { // everyone steps back onto the sidewalk
      c.t += dt;
      c.g.children.forEach((p, k) => {
        const toward = k === 0 ? -1 : k === 2 ? 1 : (c.lane < 1 ? -1 : 1); // outer two go their own way, the middle one to the nearer side
        if (Math.abs(p.position.x) < 5.2) p.position.x += toward * 8 * dt;
      });
      if (c.t > 3) { world.remove(c.g); crowds.splice(i, 1); }
    }
  }
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
  let first = null, fw = 0;
  for (const o of obstacles) {
    if (o.hit) continue;
    const w = meetAt(o, S.dist, Math.max(S.speed, 1)), tA = Math.max(0, w - S.dist) / Math.max(S.speed, 1);
    if (!inLane(o, l, tA) || w + o.half < a || w - o.half > b) continue;
    if (o.kind === 'ramp' && S.lane === l) continue;
    if (o.top && !o.v && (S.y >= o.top - 0.6 || (o.climb && S.lane === l && (S.dist < o.start + 5 || S.y > 0.2)))) continue; // on, or heading up, the ramp
    if (!first || w < fw) { first = o; fw = w; }
  }
  return first;
}
function bot() {
  const z = S.dist, look = 3 + S.speed * 0.6;
  if (S.ride > 0) return; // the tuk-tuk ploughs through everything
  const free = l => {
    for (const o of obstacles) {
      if (o.hit || (o.top && !o.v && S.y >= o.top - 0.6)) continue;
      if ((o.kind === 'ramp' || o.climb) && o.lane === l && z < o.start - 1) continue; // still in time to run up the ramp
      const w = meetAt(o, z, S.speed), tA = Math.max(0, w - z) / Math.max(S.speed, 1);
      if (inLane(o, l, tA) && w + o.half > z - 1.5 && w - o.half < z + look + 6) return false;
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
    // head for a ramp when one is close (the roof run is the best bit), then for power-ups, otherwise follow Kibaka
    const ramp = obstacles.find(r => r.kind === 'ramp' && r.wz + r.half > z && r.wz - z < 40 && (r.lane === S.lane || r.wz - r.half - z > 3));
    const pk = pickups.find(p => p.type !== 'ndara' && p.wz - z > 4 && p.wz - z < 34);
    const want = ramp ? ramp.lane : pk ? LANES.indexOf(pk.x) : S.y < 0.5 ? S.tLane : S.lane;
    if (want !== S.lane) { const step = Math.sign(want - S.lane); if (free(S.lane + step)) moveLane(step); }
  }
  if (S.ndara > 0 && S.gap - demoFloor() > 2.2 && S.demoT > 9 && Math.abs(S.tx - S.x) < 0.6 && !ahead(S.lane, z, z + S.gap)) throwNdara();
}
const DEMO_START = 4.6, DEMO_CATCH = 34.5; // seconds: run start and where the video's catch lands
function demoFloor() { return 3 + Math.max(0, DEMO_CATCH - S.demoT) * 0.3; }
function demoClose() { return S.demoT < DEMO_START + 6.4 ? 0.1 : Math.max(0.15, (S.gap - GAP_CATCH) / Math.max(0.6, DEMO_CATCH - S.demoT)); }
let demoEnd = 0;
function demoTimeline(dt) {
  S.demoT += dt;
  const t = S.demoT;
  show('demoTitle', t < 2.4);
  if (t >= 2.4 && t < DEMO_START && $('map').classList.contains('hidden')) { openMap(); selectLevel(LEVELS[1]); }
  if (S.mode === 'menu' && t >= DEMO_START) beginIntro();
  const s = segAt(S.dist), into = S.dist - s.start;
  show('demoZone', S.mode === 'run' && into < 40 && t > DEMO_START + 0.2);
  $('demoZoneName').textContent = label(s.zone);
  if (S.mode === 'caught' && (demoEnd += dt) > 2.6) { show('demoEnd', true); show('hud', false); show('tag', false); show('btnThrow', false); $('shout').classList.remove('on'); }
  window.__done = demoEnd > 6.2;
}

// ---------- opening scene at Likoni ----------
const stored = k => { try { return localStorage.getItem(k) === '1'; } catch { return true; } };
const remember = k => { try { localStorage.setItem(k, '1'); } catch { /* fine */ } };
function beginIntro() {
  resetRun(); S.mode = 'intro'; S.introT = 0; S.gap = 5; S.tx = 2.4; S.tLane = 2; S.speed = 0;
  for (const id of ['menu', 'map', 'over', 'caught', 'result', 'hud', 'btnThrow', 'tag']) show(id, false);
  fans.visible = true; fx.light('day');
  Sound.start(true);
  $('introText').textContent = T('intro1'); show('introCap', true);
}
function introUpdate(dt) {
  const t = (S.introT += dt);
  S.speed = t < 2.2 ? 0 : Math.min(12, (t - 2.2) * 10);
  S.dist += S.speed * dt;
  fillWorld();
  S.gap = (t < 1.2 ? 5 : 5 + 8.5 * (t - 1.2)) - S.dist; // Kibaka bolts with the basket
  if (t > 1.2) S.tx += (0 - S.tx) * Math.min(1, dt * 1.5);
  if (t > 1.2 && S.introSaid === 0) { S.introSaid = 1; say(T('sh_start'), 'mwizi', 1100); Sound.sfx('crowd'); $('introText').textContent = T('intro2'); haptic(30); }
  if (t > 2.2 && S.introSaid === 1) { S.introSaid = 2; say(T('intro_go'), 'twende', 900); }
  if (t > 3.4) endIntro();
}
function endIntro() {
  remember('mwizi.intro');
  S.mode = 'run'; S.tLane = 1; S.speed = Math.max(S.speed, 10); S.gap = clamp(S.gap, 12, 18);
  show('introCap', false); show('hud', true); show('tag', true); show('btnThrow', true);
  fans.visible = false; Sound.calm = false; fx.light(levelMood());
  tut = level?.id === 1 && !DEMO && !stored('mwizi.tut') ? {} : null;
  if (DEMO) S.ndara = 2;
}
const ease = x => x * x * (3 - 2 * x);
const IA = new THREE.Vector3(-2.4, 2.6, 7.0), IB = new THREE.Vector3(1.2, 3.0, 5.4), IC = new THREE.Vector3(0, 3.4, 5.5), ILOOK = new THREE.Vector3(0, 1.6, -10), il = new THREE.Vector3();
function introCamera() { // low and wide on Kibaka at the stall, then a swoop round behind the runner
  const t = S.introT;
  hero.rotation.y = t < 2.2 ? Math.PI : Math.PI * (1 - ease(clamp((t - 2.2) / 0.6, 0, 1)));
  thief.rotation.y = t < 1.2 ? Math.PI * 0.85 : 0;
  if (t < 2.2) camera.position.copy(IA).lerp(IB, ease(clamp(t / 2.2, 0, 1)));
  else camera.position.copy(IB).lerp(IC, ease(clamp((t - 2.2) / 1.2, 0, 1)));
  il.set(thief.position.x * 0.7, 1.4, Math.max(-10, thief.position.z * 0.8));
  if (t > 2.2) il.lerp(ILOOK, ease(clamp((t - 2.2) / 1.2, 0, 1)));
  camera.lookAt(il); S.camX = 0; S.camY = 0;
}

// ---------- first-run tutorial (level 1): time slows and a hint shows the swipe ----------
let tut = null; // which hints have been done while the tutorial is active
const TUT_ICON = { lane: '#i-swipe-h', jump: '#i-up', slide: '#i-down', throw: '#i-ndara' };
function tutorialCheck(dt) {
  if (S.tutOn) { S.slowT = 0.3; if ((S.tutT += dt) > 2.2) { S.tutOn = null; S.slowT = 0; show('tut', false); } return; }
  const z = S.dist, o = ahead(S.lane, z + 4, z + 13);
  let k = null;
  if (o && (o.kind === 'block' || o.kind === 'ramp') && !tut.lane) k = 'lane';
  else if (o && o.kind === 'low' && !tut.jump) k = 'jump';
  else if (o && o.kind === 'high' && !tut.slide) k = 'slide';
  else if (S.ndara > 0 && S.gap < 13 && S.t > 6 && !tut.throw) k = 'throw';
  if (!k) return;
  S.tutOn = k; S.tutT = 0; S.slowT = 0.3;
  $('tutIcon').setAttribute('href', TUT_ICON[k]); $('tutText').textContent = T('tut_' + k);
  $('tut').className = 'tut ' + k;
}
function tutDone(k) {
  if (!tut || S.tutOn !== k) return;
  tut[k] = true; S.tutOn = null; S.slowT = 0; show('tut', false);
  if (tut.lane && tut.jump && tut.slide && tut.throw) { tut = null; remember('mwizi.tut'); }
}

// ---------- placing meshes / camera ----------
const v3 = new THREE.Vector3();
function place(dt) {
  world.position.z = S.dist;
  roadTex.offset.y = (S.dist / 8) % 1; roadN.offset.y = roadR.offset.y = (S.dist / 8 * 3) % 1;
  seaTex.offset.y = (S.dist / 10) % 1; seaTex.offset.x = S.t * 0.02;
  CURVE.x = Math.sin(S.dist * 0.0045) * 0.00042 + Math.sin(S.dist * 0.0017 + 1) * 0.00022; // the road sways gently left and right

  const menu = S.mode === 'menu', gz = menu ? 13 : S.gap, lean = LANES[S.lane] - S.x;
  if (menu) S.tx = Math.sin(S.t * 0.7) * 1.4;
  hero.visible = !(S.invuln > 0 && S.ride <= 0 && Math.floor(S.t * 14) % 2 === 0);
  hero.position.set(menu ? -0.9 : S.x, S.y + (S.ride > 0 ? Math.abs(Math.sin(S.t * 18)) * 0.04 : 0), menu ? -1.2 : 0);
  hero.rotation.z = clamp(lean * -0.16, -0.32, 0.32); // bank into lane changes
  hero.rotation.y = menu ? Math.PI * 0.72 : clamp(lean * -0.28, -0.45, 0.45);
  hero.userData.pose(S.mode === 'intro' ? (S.introT < 2.2 ? 'idle' : 'run') : menu ? 'cheer' : S.mode === 'caught' ? 'cheer' : S.mode === 'over' ? 'idle' : S.ride > 0 ? 'idle' : S.slide > 0 ? 'slide' : !onGround() ? 'jump' : 'run', S.speed, dt);
  if (rideMesh) { rideMesh.position.set(S.x, 0, -1.45); rideMesh.rotation.set(0, hero.rotation.y * 0.6, hero.rotation.z * 0.5); }
  thief.position.set(S.mode === 'caught' ? S.x + 0.9 : S.tx, S.mode === 'caught' ? S.y : S.ty, -gz);
  thief.rotation.y = clamp((LANES[S.tLane] - S.tx) * -0.25, -0.4, 0.4);
  thief.userData.pose(S.mode === 'intro' ? (S.introT < 1.2 ? 'idle' : 'run') : S.mode === 'caught' ? 'caught' : S.mode === 'over' ? 'idle' : S.tStun > 0 ? 'stun' : S.tSlide > 0 ? 'slide' : S.ty > 0.05 ? 'jump' : 'run', S.speed * 1.05, dt);
  // the bodaboda helmet sits on the runner's head while the shield lasts
  helmet.visible = hero.visible && S.shield > 0 && !(S.shield < 2 && Math.floor(S.t * 8) % 2 === 0);
  if (helmet.visible) { hero.updateMatrixWorld(true); headBone.getWorldPosition(helmet.position); helmet.position.y += 0.42; helmet.rotation.set(0, hero.rotation.y, hero.rotation.z); }

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
      if (p.userData.bob !== undefined) { p.position.y = -1.05 + Math.sin(S.t * 1.3 + p.userData.bob) * 0.12; p.rotation.z = Math.sin(S.t * 0.9 + p.userData.bob) * 0.05; continue; } // dhows rock on the swell
      if (!p.userData.streetPerson) continue;
      p.visible = near;
      if (near) p.rotation.z = Math.sin(S.t * 2.2 + p.userData.phase) * .025;
    }
  }
  // over-the-shoulder camera that eases after the runner, rises onto the roofs and widens with speed
  const k = Math.min(1, dt * 6), portrait = camera.aspect < 1, sh = S.shake * 0.5;
  S.camX += (S.x * 0.6 - S.camX) * k; S.camY += (S.y * 0.85 - S.camY) * Math.min(1, dt * 4);
  camera.position.set(S.camX + (Math.random() - 0.5) * sh, (menu ? 3.0 : portrait ? 3.4 : 3.1) + S.camY - S.punch * 0.8 + (Math.random() - 0.5) * sh, menu ? 6.8 : portrait ? 5.5 : 5.2);
  if (S.mode === 'caught') camera.lookAt(thief.position.x * 0.6, 1.1 + S.y * 0.8, thief.position.z - 2); // zoom in on the catch
  else camera.lookAt(S.camX * 0.75, (menu ? 1.9 : 1.6) + S.camY * 0.9, menu ? -4 : -10);
  const fov = (portrait ? 64 : 55) + (menu ? -6 : clamp((S.speed - 12) * 0.45, 0, 6)) + (S.boost > 0 || S.ride > 0 ? 8 : 0) + (S.mode === 'caught' ? -6 : 0) + (S.slowT > 0 && S.mode === 'run' && !S.tutOn ? 5 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  fans.position.z = S.mode === 'intro' ? S.dist : 0;
  if (S.mode === 'intro') introCamera();
  const run = S.mode === 'run';
  fx.speedLines(!run ? 0 : S.ride > 0 || S.boost > 0 ? 1 : clamp((S.speed - 16) / 8, 0, 0.5));
  fx.edgeGlow(!run ? 0 : S.ride > 0 ? 0.9 : S.boost > 0 ? 0.75 : S.slowT > 0 && !S.tutOn ? 0.55 : S.shield > 0 ? 0.3 : 0,
    S.ride > 0 ? '255,194,26' : S.boost > 0 ? '255,122,61' : S.slowT > 0 ? '255,255,255' : '62,230,196');
  if (!level && S.mode !== 'menu') { // endless and the video: the sun goes down over Bamburi beach
    const sg = segAt(S.dist), st = sg.zone.id === 'bamburi' ? clamp((S.dist - sg.start) / 60, 0, 1) : 0;
    if (Math.abs(st - S.sunsetT) > 0.01) { S.sunsetT = st; fx.light('day', 'sunset', st); }
  }
}

const H = {};
function set(id, v) { if (H[id] !== v) { H[id] = v; $(id).textContent = v; } }
const heartEls = [...$('hearts').children];
function hud() {
  if (S.mode === 'menu' || S.mode === 'over') return;
  set('cash', (S.coins + S.bounty).toLocaleString());
  const s = segAt(S.dist), next = route.endless ? route.at(s.start + s.len) : route.next(s.index);
  if (next) { set('zoneHint', T('next_stop')); set('zoneName', label(next.zone)); set('zoneDist', Math.max(0, Math.round(s.start + s.len - S.dist)) + ' m'); }
  else { set('zoneHint', T('finish')); set('zoneName', T('finish_short')); set('zoneDist', Math.max(0, Math.round(route.length - S.dist)) + ' m'); }
  heartEls.forEach((el, i) => el.classList.toggle('off', i >= S.hearts));
  set('mult', 'x' + mult());
  set('throwN', S.ndara);
  $('btnThrow').classList.toggle('empty', S.ndara <= 0);
  const g = Math.max(0, Math.round(S.gap)), pct = clamp(S.gap / GAP_LOST, 0.05, 0.97) * 100;
  $('gapFill').style.width = `calc(${pct}% - 2px)`; $('gapHim').style.left = pct + '%';
  set('gapText', g + ' m');
  set('tagDist', S.tStun > 0 ? T('tripped') : S.gap < 6 ? T('tired') : g + 'm');
  show('boost', S.magnet > 0); $('boostFill').style.width = (S.magnet / MAGNET_TIME * 100) + '%';
  show('shieldBar', S.shield > 0); $('shieldFill').style.width = (S.shield / SHIELD_TIME * 100) + '%';
  show('rideBar', S.ride > 0); $('rideFill').style.width = (S.ride / RIDE_TIME * 100) + '%';
  // name tag above Kibaka; it has to follow the same bend as the world
  camera.updateMatrixWorld();
  v3.set(thief.position.x, 2.7 + S.ty, -S.gap).applyMatrix4(camera.matrixWorldInverse);
  v3.x += v3.z * v3.z * CURVE.x; v3.y -= v3.z * v3.z * CURVE.y;
  v3.applyMatrix4(camera.projectionMatrix);
  const tag = $('tag');
  tag.style.left = ((v3.x + 1) / 2 * innerWidth) + 'px';
  tag.style.top = ((1 - v3.y) / 2 * innerHeight) + 'px';
}

// ---------- map of Mombasa ----------
let selected = null;
const unlocked = lv => lv.id === 1 || (progress[lv.id - 1] || 0) > 0;
function openMap() {
  fans.visible = true; Sound.calm = true; fx.light('day');
  for (const id of ['menu', 'over', 'result', 'caught', 'hud']) show(id, false);
  show('btnThrow', false); show('tag', false); show('map', true);
  S.mode = 'menu';
  renderPins();
  selectLevel(selected || LEVELS.find(l => unlocked(l) && !progress[l.id]) || LEVELS[0]);
}
function renderPins() {
  const box = $('pins'), svg = document.querySelector('.island').getBoundingClientRect(), wrap = $('pins').getBoundingClientRect();
  const sc = Math.min(svg.width / 360, svg.height / 480), ox = svg.left - wrap.left + (svg.width - 360 * sc) / 2, oy = svg.top - wrap.top + (svg.height - 480 * sc) / 2;
  box.innerHTML = '';
  for (const lv of LEVELS) {
    const open = unlocked(lv), b = document.createElement('button');
    b.className = 'pin' + (open ? '' : ' locked') + (selected === lv ? ' sel' : '');
    b.style.left = (ox + lv.pin[0] * sc) + 'px'; b.style.top = (oy + lv.pin[1] * sc) + 'px';
    b.innerHTML = `<span class="mini">${starIcons(progress[lv.id] || 0)}</span><span class="dot">${open ? lv.id : '<svg><use href="#i-lock"/></svg>'}</span><span class="name">${lv[getLang()].title}</span>`;
    b.onclick = () => selectLevel(lv);
    box.appendChild(b);
  }
}
function selectLevel(lv) {
  selected = lv;
  const open = unlocked(lv), txt = lv[getLang()];
  $('lvlNum').textContent = `${T('level')} ${lv.id}${lv.night ? ' · 🌙' : ''}`;
  $('lvlStars').innerHTML = starIcons(progress[lv.id] || 0);
  $('lvlTitle').textContent = txt.title;
  $('lvlTip').textContent = open ? txt.tip : T('locked');
  $('lvlGoals').innerHTML = goalsHtml(lv);
  $('btnLevelGo').disabled = !open; $('btnLevelGo').classList.toggle('empty', !open);
  show('levelCard', true);
  renderPins();
}

// ---------- input ----------
let touch = null;
canvas.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY, done: false }; Sound.unlock(); if (S.mode === 'intro' && !DEMO) endIntro(); });
addEventListener('pointerdown', () => { Sound.unlock(); if (S.mode === 'menu') Sound.start(true); }, { once: true });
$('introCap').addEventListener('pointerdown', () => { if (S.mode === 'intro' && !DEMO) endIntro(); });
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
  else if (k === 'enter' && S.mode === 'menu') openMap();
});
const replay = () => level ? startLevel(level) : startEndless();
$('btnThrow').addEventListener('pointerdown', e => { e.preventDefault(); throwNdara(); });
$('btnStart').onclick = () => { Sound.unlock(); openMap(); };
$('btnEndless').onclick = () => { Sound.unlock(); startEndless(); };
$('btnMapBack').onclick = () => { show('map', false); show('menu', true); };
$('btnLevelGo').onclick = () => { if (selected && unlocked(selected)) { Sound.unlock(); startLevel(selected); } };
$('btnNext').onclick = () => { const next = LEVELS.find(l => l.id === level.id + 1); if (next) { selected = next; startLevel(next); } };
$('btnReplay').onclick = replay;
$('btnResMap').onclick = openMap;
$('btnOverMap').onclick = openMap;
$('btnRetry').onclick = replay;
$('btnAgain').onclick = chaseAgain;
$('btnBank').onclick = () => gameOver('bank');
$('btnPause').onclick = () => setPaused(true);
$('btnResume').onclick = () => setPaused(false);
$('btnQuit').onclick = () => { show('pause', false); Sound.mute(!Sound.enabled); gameOver('quit'); };
const soundLabel = () => { $('soundIcon').setAttribute('href', Sound.enabled ? '#i-sound' : '#i-mute'); $('soundText').textContent = T(Sound.enabled ? 'sound_on' : 'sound_off'); };
$('btnSound').onclick = () => { Sound.enabled = !Sound.enabled; soundLabel(); };
function syncSettings() {
  for (const b of document.querySelectorAll('[data-q]')) b.classList.toggle('on', b.dataset.q === Settings.quality);
  $('setMusic').value = Settings.music; $('setSfx').value = Settings.sfx;
  $('setVib').textContent = T(Settings.vibrate ? 'on' : 'off'); $('setVib').classList.toggle('on', Settings.vibrate);
}
for (const b of document.querySelectorAll('[data-q]')) b.onclick = () => { fx.setQuality(b.dataset.q); syncSettings(); };
$('setMusic').oninput = e => { Settings.music = +e.target.value; Sound.volumes(Settings.music, Settings.sfx); saveSettings(); };
$('setSfx').oninput = e => { Settings.sfx = +e.target.value; Sound.volumes(Settings.music, Settings.sfx); saveSettings(); };
$('setVib').onclick = () => { Settings.vibrate = !Settings.vibrate; saveSettings(); syncSettings(); haptic(30); };
for (const b of document.querySelectorAll('[data-open-settings]')) b.onclick = () => { syncSettings(); show('settings', true); };
$('btnSettingsDone').onclick = () => show('settings', false);
syncSettings();
for (const b of document.querySelectorAll('[data-lang-toggle]')) b.onclick = () => {
  setLang(getLang() === 'sw' ? 'en' : 'sw'); soundLabel(); syncSettings();
  if (!$('map').classList.contains('hidden')) selectLevel(selected || LEVELS[0]);
};
$('btnShare').onclick = () => {
  const text = T('share_text', { n: (S.lastTotal || 0).toLocaleString() });
  if (navigator.share) navigator.share({ title: 'Mwizi! Mombasa', text }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { $('btnShare').textContent = T('copied'); });
};
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
soundLabel();

function resize() {
  renderer.setSize(innerWidth, innerHeight, false); fx.resize();
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (!$('map').classList.contains('hidden')) renderPins();
}
addEventListener('resize', resize); resize();

// ---------- loop ----------
function frame(dt) {
  S.slowT -= dt;
  S.timeScale += ((S.slowT > 0 ? (S.tutOn ? 0.2 : 0.3) : 1) - S.timeScale) * Math.min(1, dt * 12);
  if (S.mode !== 'paused') update(dt * S.timeScale);
  WIND.value += dt;
  fx.update(dt, camera);
  fx.render();
}
show('loading', false); show('menu', !DEMO);
if (CAPTURE) {
  window.__step = dt => frame(dt);
  window.__state = () => ({ mode: S.mode, t: +S.demoT.toFixed(1), dist: Math.round(S.dist), zone: zoneAt(S.dist).id, gap: +S.gap.toFixed(1), y: +S.y.toFixed(2), hearts: S.hearts, ride: +S.ride.toFixed(1), roof: +(S.roofT || 0).toFixed(1) });
  window.__music = secs => Sound.renderWav(secs, DEMO ? DEMO_START + 3.4 : 0);
  window.__debug = () => ({ S, obstacles: obstacles.map(o => ({ type: o.type, lane: o.lane, x: +o.x.toFixed(1), wz: +o.wz.toFixed(1), v: o.v, hit: o.hit })) });
  frame(1 / 30);
  window.__ready = true;
} else {
  let last = performance.now();
  let frames = 0, slow = 0;
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt);
    if (Settings.quality === 'high' && S.mode === 'run' && ++frames > 300) { // most frames slower than ~38 fps: switch to fast graphics
      if (slow / frames > 0.5) { fx.setQuality('low'); syncSettings(); }
      frames = slow = 0;
    } else if (dt > 1 / 38) slow++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
