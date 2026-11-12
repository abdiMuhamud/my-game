// The people of the game: rigged, animated character models (CC0, by Quaternius) restyled as Mombasa men,
// with a cartoon finish (banded light, rim glow, outlines, bigger heads, hands and feet).
// The runner and Kibaka are live skinned models; the street crowd is posed once and baked to static meshes.
import * as THREE from 'three';
import { GLTFLoader } from './lib/loaders/GLTFLoader.js';
import { PAL, hooks, CURVE } from './world.js';

const FILES = ['hoodie', 'punk', 'casual'];
const SKIN = [0x5a3a22, 0x6b4428, 0x7a5030, 0x4a2f1b];
const HAIR = 0x15100c;
const BRIGHT = [0xd81e5b, 0xffc21a, 0x12b5b0, 0xe98a4b, 0x2f9e44, 0x7b3fb3, 0x1546b8, 0xf25c54, 0xffffff];
const BIG = {}; // natural proportions
const models = {};

// ---------- cartoon materials ----------
const toonRamp = (() => { const t = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const CURVE_GLSL = '#include <project_vertex>\n float cz = mvPosition.z; mvPosition.x += cz * cz * uCurve.x; mvPosition.y -= cz * cz * uCurve.y; gl_Position = projectionMatrix * mvPosition;';
// banded toon light plus a soft rim glow, bent with the curved world like everything else
// physically based skin and cloth, lit by the sky like the rest of the street
function toon(params) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, ...params });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCurve = { value: CURVE };
    sh.vertexShader = 'uniform vec2 uCurve;\n' + sh.vertexShader.replace('#include <project_vertex>', CURVE_GLSL);
  };
  mat.customProgramCacheKey = () => 'person';
  return mat;
}
// dark outline: the back faces pushed out along the (skinned) normals
function outlineMat(thickness) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1220, side: THREE.BackSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCurve = { value: CURVE };
    sh.vertexShader = 'uniform vec2 uCurve;\n' + sh.vertexShader
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n transformed += normalize(objectNormal) * ${thickness.toExponential(3)};`)
      .replace('#include <project_vertex>', CURVE_GLSL);
  };
  mat.customProgramCacheKey = () => 'outline' + thickness.toFixed(6);
  return mat;
}
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

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
  hooks.rider = rnd => { const p = new THREE.Mesh(riders[Math.floor(rnd() * riders.length)], CROWD_MAT); p.castShadow = true; return p; };
}

// swap the model's flat materials for our own palette, by material name
function recolor(root, colors) {
  const made = {};
  root.traverse(o => {
    if (!o.isMesh) return;
    const n = o.material.name;
    if (!made[n]) { made[n] = toon({ color: 0xffffff }); made[n].color.copy(o.material.color); if (n in colors) made[n].color.setHex(colors[n]); }
    o.material = made[n]; o.castShadow = true; o.frustumCulled = false;
  });
}
const bigBones = root => Object.entries(BIG).map(([n, s]) => [root.getObjectByName(n), s]).filter(([b]) => b);

function makeRunner(gltf, colors) {
  const root = gltf.scene; recolor(root, colors); root.rotation.y = Math.PI; // models face +z, the chase runs toward -z
  const holder = new THREE.Group(); holder.add(root);
  holder.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(root), acts = {}, big = bigBones(root);
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
    for (const [b, s] of big) b.scale.setScalar(s);
  };
  holder.userData.bone = name => root.getObjectByName(name);
  // dress pieces are built in the rest pose and then attached to a bone, so they follow it while running
  holder.userData.wear = (boneName, mesh, at) => {
    const bone = root.getObjectByName(boneName), p = new THREE.Vector3();
    bone.getWorldPosition(p); mesh.position.set(p.x + (at?.x || 0), at?.y ?? 0, p.z + (at?.z || 0));
    for (const [b] of big) b.scale.setScalar(1); // attach at true size, then the bigger head carries the piece up with it
    holder.add(mesh); holder.updateMatrixWorld(true); bone.attach(mesh);
    for (const [b, s] of big) b.scale.setScalar(s);
    mesh.castShadow = true;
    return mesh;
  };
  for (const [b, s] of big) b.scale.setScalar(s);
  return holder;
}

// the runner: bright yellow hoodie, blue jeans and white sneakers
export function makeHero() {
  const h = makeRunner(models.hoodie, { Purple: 0xffc21a, LightBlue: 0x1f3f8f, White: 0xffffff, Skin: 0x6b4428, Hair: HAIR });
  return h;
}
export function makeThief() {
  const t = makeRunner(models.punk, { Black: 0xc8102e, LightBlue: 0x23262d, White: 0xffffff, Red: 0x16181c, Red_Dark: 0x16181c, Skin: 0x5a3a22, Earrings: 0xe0b04a });
  // Mama Fatuma's kikapu swings from his right hand
  const bag = new THREE.Group(), box = (c, w, h, d, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon({ color: c })); b.position.y = y; b.castShadow = true; bag.add(b); };
  box(PAL.pink, 0.4, 0.32, 0.18, -0.22); box(PAL.sun, 0.42, 0.07, 0.19, -0.14); box(0x7a4a22, 0.05, 0.16, 0.05, -0.02);
  t.add(bag);
  const wrist = t.userData.bone('WristR'), v = new THREE.Vector3(), pose = t.userData.pose;
  t.userData.pose = (mode, speed, dt) => { pose(mode, speed, dt); t.updateMatrixWorld(true); bag.position.copy(t.worldToLocal(wrist.getWorldPosition(v))); bag.visible = mode !== 'caught'; };
  return t;
}

// ---------- the street crowd: men of the coast ----------
const CROWD_MAT = toon({ vertexColors: true, side: THREE.DoubleSide });
const crowd = [], riders = [];
const v3 = new THREE.Vector3();
function bakePose(gltf, clipName, time, colors, dress) {
  const root = gltf.scene, mixer = new THREE.AnimationMixer(root);
  const clip = gltf.animations.find(c => c.name.endsWith('|' + clipName));
  mixer.clipAction(clip).play(); mixer.setTime(time * clip.duration);
  for (const [b, s] of bigBones(root)) b.scale.setScalar(s);
  root.rotation.y = 0; root.updateMatrixWorld(true);
  const pos = [], nor = [], col = [], c = new THREE.Color();
  const push = (geo, color) => { pos.push(...geo.attributes.position.array); nor.push(...geo.attributes.normal.array); for (let i = 0; i < geo.attributes.position.count; i++) col.push(color.r, color.g, color.b); };
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const src = o.geometry.attributes.position, out = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) { v3.fromBufferAttribute(src, i); o.applyBoneTransform(i, v3); v3.applyMatrix4(o.matrixWorld); out.set([v3.x, v3.y, v3.z], i * 3); }
    let geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(out, 3)); geo.setIndex(o.geometry.index);
    geo.computeVertexNormals(); geo = geo.toNonIndexed();
    const n = o.material.name;
    if (n in colors) c.setHex(colors[n]); else c.copy(o.material.color);
    push(geo, c);
  });
  // dress pieces placed from where the head and hips ended up in this pose
  const at = n => root.getObjectByName(n).getWorldPosition(new THREE.Vector3());
  for (const e of dress ? dress({ head: at('Head'), hips: at('Hips') }) : []) { e.updateMatrixWorld(true); const geo = e.geometry.clone().toNonIndexed().applyMatrix4(e.matrixWorld); push(geo, e.userData.color); }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  for (const [b] of bigBones(root)) b.scale.setScalar(1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
const piece = (geo, color, x, y, z) => { const o = new THREE.Mesh(geo); o.position.set(x, y, z); o.userData.color = new THREE.Color(color); return o; };
const SPH = new THREE.SphereGeometry(0.5, 14, 10);
function buildCrowd() {
  const B = i => BRIGHT[i % BRIGHT.length], S = i => SKIN[i % SKIN.length];
  const man = (i, shirt, trousers) => ({ White: shirt, Red_Dark: shirt, LightBrown: trousers, LightBlue: trousers, Skin: S(i), Skin_Darker: S(i + 1), Hair: HAIR });
  const youth = (i, top, jeans) => ({ Purple: top, Black: top, LightBlue: jeans, White: 0xffffff, Skin: S(i), Hair: HAIR, Red: HAIR, Red_Dark: HAIR, Earrings: 0xe0b04a });
  const list = [
    ['casual', 'Wave', 0.3, man(0, 0xffffff, 0x2b3a55)],
    ['casual', 'Idle', 0.2, man(1, B(1), 0x3d3d3d)],
    ['casual', 'Interact', 0.5, man(2, B(0), 0x2b3a55)],                                          // pointing at the thief
    ['casual', 'Idle_Neutral', 0.6, man(3, B(5), 0x8a6a3a)],
    ['casual', 'Wave', 0.7, man(1, B(3), 0x3d3d3d)],
    ['casual', 'Idle', 0.5, man(2, 0xffffff, 0x3d3d3d)],
    ['casual', 'Interact', 0.4, man(0, B(2), 0x2b3a55)],
    ['casual', 'Idle_Neutral', 0.5, man(3, B(6), 0x8a6a3a)],
    ['hoodie', 'Wave', 0.5, youth(2, B(4), 0x2b3a55)],
    ['hoodie', 'Idle', 0.5, youth(3, B(7), 0x3d3d3d)],
    ['punk', 'Punch_Right', 0.45, youth(0, B(6), 0x22252b)],                                       // shaking a fist at the thief
  ];
  for (const [file, clip, time, colors, dress] of list) crowd.push(bakePose(models[file], clip, time, colors, dress));
  // bodaboda riders, helmet on
  const helmetOn = c => ({ head }) => [piece(SPH.clone().scale(0.42, 0.38, 0.46), c, head.x, head.y + 0.25, head.z + 0.02), piece(SPH.clone().scale(0.32, 0.11, 0.1), 0x14181f, head.x, head.y + 0.2, head.z + 0.21)];
  riders.push(bakePose(models.casual, 'Idle_Neutral', 0.2, man(1, B(6), 0x2b3a55), helmetOn(0xd81e1e)));
  riders.push(bakePose(models.hoodie, 'Idle', 0.4, youth(2, B(3), 0x3d3d3d), helmetOn(0x1546b8)));
  riders.push(bakePose(models.casual, 'Idle', 0.6, man(3, 0xfbfaf3, 0x3d3d3d), helmetOn(0xffc21a)));
}
