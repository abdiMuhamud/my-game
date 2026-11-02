// The people of the game: rigged, animated character models (CC0, by Quaternius) restyled as Mombasa men in
// Swahili coastal dress, with a cartoon finish (banded light, rim glow, outlines, bigger heads, hands and feet).
// The runner and Kibaka are live skinned models; the street crowd is posed once and baked to static meshes.
import * as THREE from 'three';
import { GLTFLoader } from './lib/loaders/GLTFLoader.js';
import { PAL, hooks, CURVE } from './world.js';

const FILES = ['hoodie', 'punk', 'casual'];
const SKIN = [0x5a3a22, 0x6b4428, 0x7a5030, 0x4a2f1b];
const HAIR = 0x15100c;
const BRIGHT = [0xd81e5b, 0xffc21a, 0x12b5b0, 0xe98a4b, 0x2f9e44, 0x7b3fb3, 0x1546b8, 0xf25c54, 0xffffff];
const BIG = { Head: 1.28, WristL: 1.18, WristR: 1.18, FootL: 1.15, FootR: 1.15 }; // cartoon proportions
const models = {};

// ---------- cartoon materials ----------
const toonRamp = (() => { const t = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const CURVE_GLSL = '#include <project_vertex>\n float cz = mvPosition.z; mvPosition.x += cz * cz * uCurve.x; mvPosition.y -= cz * cz * uCurve.y; gl_Position = projectionMatrix * mvPosition;';
// banded toon light plus a soft rim glow, bent with the curved world like everything else
function toon(params, rim = 0.32) {
  const mat = new THREE.MeshToonMaterial({ gradientMap: toonRamp, ...params });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCurve = { value: CURVE };
    sh.vertexShader = 'uniform vec2 uCurve;\n' + sh.vertexShader.replace('#include <project_vertex>', CURVE_GLSL);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);\n totalEmissiveRadiance += vec3(1.0, 0.94, 0.82) * pow(rimF, 2.6) * ${rim.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => 'toon' + rim;
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
// embroidered kofia band: white cap with rows of maroon and gold stitching
const kofiaTex = () => canvasTex(256, 64, (x, w, h) => {
  x.fillStyle = '#fbfaf3'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) {
    const cx = i * 16 + 8;
    x.fillStyle = '#7a1f2b'; x.beginPath(); x.moveTo(cx, 10); x.lineTo(cx + 6, 22); x.lineTo(cx, 34); x.lineTo(cx - 6, 22); x.fill();
    x.fillStyle = '#d9a830'; x.beginPath(); x.arc(cx, 22, 2.2, 0, 7); x.fill();
    x.fillStyle = '#2f6b4f'; x.fillRect(cx - 5, 44, 10, 3);
  }
  x.fillStyle = '#d9a830'; x.fillRect(0, 38, w, 2); x.fillRect(0, h - 6, w, 3);
});
// kikoi: the striped cotton wrap of the coast
const kikoiTex = (a, b, c) => canvasTex(128, 64, (x, w, h) => {
  const bands = [a, b, a, c, '#fbfaf3', c, a, b, a];
  bands.forEach((col, i) => { x.fillStyle = col; x.fillRect(0, i * h / bands.length, w, h / bands.length + 1); });
  x.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < w; i += 4) x.fillRect(i, 0, 1, h);
});
// a robe as a lathe profile [radius, height], flattened front to back
const robeGeo = pts => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 22).scale(1, 1, 0.78);

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
  hooks.kanzu = k => { const p = new THREE.Mesh(crowd[k % 4], CROWD_MAT); p.castShadow = true; return p; }; // the first four crowd looks wear kanzu
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
  // outlines: a back-face copy of every skinned part, sharing its skeleton
  const ws = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isSkinnedMesh || o.userData.outline) return;
    o.getWorldScale(ws);
    const ol = new THREE.SkinnedMesh(o.geometry, outlineMat(0.016 / ws.x)); ol.userData.outline = true;
    ol.bind(o.skeleton, o.bindMatrix); ol.frustumCulled = false; o.add(ol);
  });
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
    for (const [b] of big) b.scale.setScalar(1); // attach at true size, then the bigger head carries the kofia up with it
    holder.add(mesh); holder.updateMatrixWorld(true); bone.attach(mesh);
    for (const [b, s] of big) b.scale.setScalar(s);
    mesh.castShadow = true;
    return mesh;
  };
  for (const [b, s] of big) b.scale.setScalar(s);
  return holder;
}

// the runner: white kanzu hitched up to the knees for the chase, embroidered kofia, striped kikoi sash
export function makeHero() {
  const h = makeRunner(models.hoodie, { Purple: 0xfbfaf3, LightBlue: 0xe6dcc6, White: 0xffffff, Skin: 0x6b4428, Hair: HAIR });
  const white = toon({ color: 0xfbfaf3, side: THREE.DoubleSide }, 0.25);
  h.userData.wear('Hips', new THREE.Mesh(robeGeo([[0.35, 0.5], [0.33, 0.58], [0.27, 0.8], [0.225, 0.98], [0.205, 1.06]]), white));
  h.userData.wear('Hips', new THREE.Mesh(new THREE.CylinderGeometry(0.218, 0.224, 0.12, 22, 1, true).scale(1, 1, 0.8), toon({ map: kikoiTex('#c8102e', '#ffc21a', '#1546b8'), side: THREE.DoubleSide })), { y: 0.99 });
  h.userData.wear('Hips', new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.04), toon({ map: kikoiTex('#c8102e', '#ffc21a', '#1546b8') })), { x: 0.13, y: 0.86, z: -0.17 });
  h.userData.kofia = h.userData.wear('Head', new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.156, 0.1, 26), [toon({ map: kofiaTex() }), toon({ color: 0xfbfaf3 }), toon({ color: 0xfbfaf3 })]), { y: 1.78 });
  h.userData.wear('Chest', new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), toon({ color: 0xd9a830 })), { y: 1.38, z: -0.15 }); // kanzu tassel
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
const CROWD_MAT = toon({ vertexColors: true, side: THREE.DoubleSide }, 0.22);
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
const CAP = new THREE.CylinderGeometry(0.188, 0.196, 0.12, 20), CAP_BAND = new THREE.CylinderGeometry(0.198, 0.2, 0.04, 20, 1, true);
const SPH = new THREE.SphereGeometry(0.5, 14, 10);
const kofia = (cap, band) => ({ head }) => [piece(CAP, cap, head.x, head.y + 0.34, head.z + 0.02), piece(CAP_BAND, band, head.x, head.y + 0.31, head.z + 0.02)];
const KANZU = robeGeo([[0.33, 0.06], [0.31, 0.3], [0.27, 0.7], [0.23, 0.98], [0.21, 1.08]]);
const KIKOI = robeGeo([[0.31, 0.32], [0.28, 0.55], [0.24, 0.85], [0.22, 1.0]]);
const kanzu = (cap, band, robe = 0xfbfaf3) => b => [piece(KANZU, robe, b.hips.x, 0, b.hips.z), ...kofia(cap, band)(b)];
const kikoi = (wrap, cap) => b => [piece(KIKOI, wrap, b.hips.x, 0, b.hips.z), ...(cap ? kofia(cap, 0xd9a830)(b) : [])];
function buildCrowd() {
  const B = i => BRIGHT[i % BRIGHT.length], S = i => SKIN[i % SKIN.length];
  const man = (i, shirt, trousers) => ({ White: shirt, Red_Dark: shirt, LightBrown: trousers, LightBlue: trousers, Skin: S(i), Skin_Darker: S(i + 1), Hair: HAIR });
  const youth = (i, top, jeans) => ({ Purple: top, Black: top, LightBlue: jeans, White: 0xffffff, Skin: S(i), Hair: HAIR, Red: HAIR, Red_Dark: HAIR, Earrings: 0xe0b04a });
  const list = [
    ['casual', 'Wave', 0.3, man(0, 0xfbfaf3, 0xfbfaf3), kanzu(0xfbfaf3, 0x7a1f2b)],             // kanzu and embroidered kofia
    ['casual', 'Idle', 0.2, man(1, 0xf1e8d6, 0xf1e8d6), kanzu(0xfbfaf3, 0xd9a830, 0xf1e8d6)],
    ['casual', 'Interact', 0.5, man(2, 0xfbfaf3, 0xfbfaf3), kanzu(0xfbfaf3, 0x2f6b4f)],         // pointing at the thief
    ['casual', 'Idle_Neutral', 0.6, man(3, 0xe9e1cf, 0xe9e1cf), kanzu(0x7a1f2b, 0xd9a830, 0xe9e1cf)],
    ['casual', 'Wave', 0.7, man(1, B(3), 0x3d3d3d), kikoi(0x1546b8, 0xfbfaf3)],                   // shirt and kikoi
    ['casual', 'Idle', 0.5, man(2, 0xffffff, 0x3d3d3d), kikoi(0xc8102e)],
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
