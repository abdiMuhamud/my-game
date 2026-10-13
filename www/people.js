// The people of the game: rigged, animated character models (CC0, by Quaternius) recoloured for Mombasa.
// The runner and Kibaka are live skinned models; the street crowd is posed once and baked to static meshes.
import * as THREE from 'three';
import { GLTFLoader } from './lib/loaders/GLTFLoader.js';
import { Lam, PAL, hooks } from './world.js';

const FILES = ['hoodie', 'punk', 'casual', 'woman1', 'woman2'];
const SKIN = [0x5a3a22, 0x6b4428, 0x7a5030, 0x4a2f1b];
const HAIR = 0x15100c;
const BRIGHT = [0xd81e5b, 0xffc21a, 0x12b5b0, 0xe98a4b, 0x2f9e44, 0x7b3fb3, 0x1546b8, 0xf25c54, 0xffffff];
const models = {};

export async function loadPeople(onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(FILES.map(async f => { models[f] = await loader.loadAsync(`models/${f}.glb`); onProgress?.(++done / FILES.length); }));
  buildCrowd();
  hooks.bystander = rnd => {
    const p = new THREE.Mesh(crowd[Math.floor(rnd() * crowd.length)], CROWD_MAT);
    p.castShadow = p.receiveShadow = true; p.scale.setScalar(0.95 + rnd() * 0.1);
    return p;
  };
}

// swap the model's flat materials for our own palette, by material name
function recolor(root, colors) {
  const made = {};
  root.traverse(o => {
    if (!o.isMesh) return;
    const n = o.material.name;
    made[n] = made[n] || Lam({ color: n in colors ? colors[n] : o.material.color });
    if (!(n in colors)) made[n].color.copy(o.material.color);
    o.material = made[n]; o.castShadow = true; o.frustumCulled = false;
  });
}

function makeRunner(gltf, colors) {
  const root = gltf.scene; recolor(root, colors); root.rotation.y = Math.PI; // models face +z, the chase runs toward -z
  const holder = new THREE.Group(); holder.add(root);
  const mixer = new THREE.AnimationMixer(root), acts = {};
  for (const c of gltf.animations) acts[c.name.split('|')[1]] = mixer.clipAction(c);
  let cur = null;
  const play = (name, loop = true, scale = 1, fade = 0.12) => {
    const a = acts[name];
    if (cur !== name) {
      a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.fadeIn(fade).play();
      if (cur) acts[cur].fadeOut(fade);
      cur = name;
    }
    a.timeScale = scale;
  };
  holder.userData.pose = (mode, speed, dt) => {
    if (mode === 'run') play('Run', true, THREE.MathUtils.clamp(speed / 10.5, 0.75, 1.75));
    else if (mode === 'jump') play('Run', true, 0.4);
    else if (mode === 'slide') play('Roll', false, 1.9, 0.06);
    else if (mode === 'stun') play('HitRecieve', false, 0.7);
    else if (mode === 'cheer') play('Wave', true, 1.6);
    else if (mode === 'caught') play('Death', false, 1.2);
    else play('Idle');
    mixer.update(dt);
  };
  holder.userData.bone = name => root.getObjectByName(name);
  return holder;
}

export function makeHero() {
  return makeRunner(models.hoodie, { Purple: PAL.sun, LightBlue: PAL.blue, White: 0xffffff, Skin: 0x6b4428, Hair: HAIR });
}
export function makeThief() {
  const t = makeRunner(models.punk, { Black: 0xc8102e, LightBlue: 0x23262d, White: 0xffffff, Red: 0x16181c, Red_Dark: 0x16181c, Skin: 0x5a3a22, Earrings: 0xe0b04a });
  // Mama Fatuma's kikapu swings from his right hand
  const bag = new THREE.Group(), box = (c, w, h, d, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Lam({ color: c })); b.position.y = y; b.castShadow = true; bag.add(b); };
  box(PAL.pink, 0.4, 0.32, 0.18, -0.22); box(PAL.sun, 0.42, 0.07, 0.19, -0.14); box(0x7a4a22, 0.05, 0.16, 0.05, -0.02);
  t.add(bag);
  const wrist = t.userData.bone('WristR'), v = new THREE.Vector3(), pose = t.userData.pose;
  t.userData.pose = (mode, speed, dt) => { pose(mode, speed, dt); t.updateMatrixWorld(true); bag.position.copy(t.worldToLocal(wrist.getWorldPosition(v))); bag.visible = mode !== 'caught'; };
  return t;
}

// ---------- the street crowd ----------
const CROWD_MAT = Lam({ vertexColors: true });
const crowd = [];
function bakePose(gltf, clipName, time, colors, extras) {
  const root = gltf.scene, mixer = new THREE.AnimationMixer(root);
  const clip = gltf.animations.find(c => c.name.endsWith('|' + clipName));
  mixer.clipAction(clip).play(); mixer.setTime(time * clip.duration);
  root.rotation.y = 0; root.updateMatrixWorld(true);
  const pos = [], nor = [], col = [], v = new THREE.Vector3(), c = new THREE.Color();
  const push = (geo, color) => { pos.push(...geo.attributes.position.array); nor.push(...geo.attributes.normal.array); for (let i = 0; i < geo.attributes.position.count; i++) col.push(color.r, color.g, color.b); };
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const src = o.geometry.attributes.position, out = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) { v.fromBufferAttribute(src, i); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); out.set([v.x, v.y, v.z], i * 3); }
    let geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(out, 3)); geo.setIndex(o.geometry.index);
    geo.computeVertexNormals(); geo = geo.toNonIndexed();
    const n = o.material.name;
    if (n in colors) c.setHex(colors[n]); else c.copy(o.material.color);
    push(geo, c);
  });
  for (const e of extras || []) { e.updateMatrixWorld(true); const geo = e.geometry.clone().toNonIndexed().applyMatrix4(e.matrixWorld); push(geo, e.material.color); }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
const part = (geo, color, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color })); o.scale.set(sx, sy, sz); o.position.set(x, y, z); return o; };
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14), SPH = new THREE.SphereGeometry(0.5, 14, 10);
const kofia = c => [part(CYL, c, 0.27, 0.1, 0.29, 0, 1.845, 0.06)];
const headwrap = c => [part(SPH, c, 0.36, 0.3, 0.38, 0, 1.76, 0.03), part(SPH, c, 0.2, 0.18, 0.2, 0, 1.86, -0.08)];
function buildCrowd() {
  const B = i => BRIGHT[i % BRIGHT.length], S = i => SKIN[i % SKIN.length];
  const man = (i, shirt, trousers) => ({ White: shirt, Red_Dark: shirt, LightBrown: trousers, LightBlue: trousers, Skin: S(i), Skin_Darker: S(i + 1), Hair: HAIR });
  const lady = (i, dress, trim) => ({ LimeGreen: dress, Red: HAIR, Brown: HAIR, Gold: 0xe0b04a, Skin: S(i), White: dress, Grey: trim, Orange: trim, Hair_Blond: HAIR, Hair_Brown: HAIR });
  const youth = (i, top, jeans) => ({ Purple: top, Black: top, LightBlue: jeans, White: 0xffffff, Skin: S(i), Hair: HAIR, Red: HAIR, Red_Dark: HAIR, Earrings: 0xe0b04a });
  const list = [
    ['casual', 'Wave', 0.3, man(0, 0xf7f5ec, 0xf7f5ec), kofia(0xffffff)],        // kanzu whites and kofia
    ['casual', 'Idle', 0.2, man(1, 0xf7f5ec, 0xe9e4d4), kofia(0x8a2b2b)],
    ['casual', 'Interact', 0.5, man(2, B(2), 0x2b3a55)],
    ['casual', 'Wave', 0.7, man(3, B(3), 0x3d3d3d)],
    ['casual', 'Idle_Neutral', 0.5, man(0, B(6), 0x8a6a3a)],
    ['woman1', 'Wave', 0.4, lady(1, B(0), B(1)), headwrap(B(1))],                 // leso colours
    ['woman1', 'Idle', 0.6, lady(2, B(4), B(1)), headwrap(B(0))],
    ['woman1', 'Interact', 0.4, lady(0, 0x17181c, 0x17181c), headwrap(0x17181c)], // buibui
    ['woman2', 'Wave', 0.6, lady(3, B(5), B(1)), headwrap(B(3))],
    ['woman2', 'Idle', 0.3, lady(1, B(2), 0x2b3a55)],
    ['woman2', 'Idle_Neutral', 0.8, lady(2, B(7), B(8))],
    ['hoodie', 'Wave', 0.5, youth(2, B(4), 0x2b3a55)],
    ['hoodie', 'Idle', 0.5, youth(3, B(7), 0x3d3d3d)],
    ['punk', 'Punch_Right', 0.45, youth(0, B(6), 0x22252b)],                      // shaking a fist at the thief
  ];
  for (const [file, clip, time, colors, extras] of list) crowd.push(bakePose(models[file], clip, time, colors, extras));
}
