// Mombasa's streets: buildings, vehicles, props and textures, all generated in code.
// Static models are built once, merged into a single vertex-coloured mesh and then instanced.
import * as THREE from 'three';
import { mergeGeometries } from './lib/utils/BufferGeometryUtils.js';

export const PAL = {
  blue: 0x1546b8, blueDk: 0x0c2a78, white: 0xfbfaf5, sea: 0x18b7b2, haze: 0xcfeaf3,
  sun: 0xffc21a, coral: 0xe98a4b, pink: 0xd81e5b, ink: 0x0d1b2a, sand: 0xf3e0ad,
  stone: 0xdda45c, wood: 0x6b4423, pave: 0xd9d3c5, palm: 0x2f9e44, thatch: 0xa8824a,
};
const BRIGHT = [0xd81e5b, 0xffc21a, 0x12b5b0, 0xe98a4b, 0x2f9e44, 0x7b3fb3, 0x1546b8, 0xf25c54];
const CHUNK = 12;
export const hooks = { bystander: null }; // people.js plugs the crowd in here

// ---------- materials: every surface bends with the curved world ----------
export const CURVE = new THREE.Vector2(0, 0.0011);
export function curveMat(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCurve = { value: CURVE };
    sh.vertexShader = 'uniform vec2 uCurve;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n float cz = mvPosition.z; mvPosition.x += cz * cz * uCurve.x; mvPosition.y -= cz * cz * uCurve.y; gl_Position = projectionMatrix * mvPosition;');
  };
  return mat;
}
export const Lam = p => curveMat(new THREE.MeshLambertMaterial(p));
const mats = new Map();
function M(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!mats.has(key)) mats.set(key, Lam({ color, ...extra }));
  return mats.get(key);
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(0.5, 10, 7), // props are small on screen: keep them light
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cone: new THREE.ConeGeometry(0.5, 1, 14),
  coin: new THREE.CylinderGeometry(0.36, 0.36, 0.07, 22),
  ring: new THREE.TorusGeometry(0.36, 0.045, 8, 24),
  halo: new THREE.TorusGeometry(0.62, 0.05, 6, 24),
  plane: new THREE.PlaneGeometry(1, 1),
};
function m(geo, mat, sx, sy, sz, x, y, z, parent) {
  const o = new THREE.Mesh(geo, mat);
  o.scale.set(sx, sy, sz); o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  if (parent) parent.add(o);
  return o;
}
const cache = new Map();
function cached(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }
// box with rounded edges, for vehicles and anything that should not look like a crate
function rbox(w, h, d, r) {
  return cached(`rb${w},${h},${d},${r}`, () => {
    const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
    s.absarc(x, y, r, 0, Math.PI / 2); s.absarc(-x, y, r, Math.PI / 2, Math.PI); s.absarc(-x, -y, r, Math.PI, Math.PI * 1.5); s.absarc(x, -y, r, Math.PI * 1.5, Math.PI * 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - r, bevelEnabled: true, bevelSize: r * 0.5, bevelThickness: r * 0.5, bevelSegments: 2, curveSegments: 5 });
    g.center();
    return g;
  });
}
const R = (mat, w, h, d, r, x, y, z, parent) => m(rbox(w, h, d, r), mat, 1, 1, 1, x, y, z, parent);

// A box whose six faces each sample their own rectangle [u0, v0, u1, v1] of one texture, so it draws in a
// single call instead of one per face.  Face order: +x, -x, +y, -y, +z, -z.
function atlasBox(rects) {
  const g = new THREE.BoxGeometry(1, 1, 1), uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = rects[f];
    for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); }
  }
  g.clearGroups();
  return g;
}
// merge every plain-coloured mesh of a model into one; textured and two-sided parts stay as they are
const BAKED = Lam({ vertexColors: true });
export function bakeGroup(group) {
  group.updateMatrixWorld(true);
  const pos = [], nor = [], col = [], out = new THREE.Group();
  group.traverse(o => {
    if (!o.isMesh) return;
    const mat = o.material;
    if (Array.isArray(mat) || mat.map || mat.side !== THREE.FrontSide || mat.isMeshBasicMaterial || mat.isMeshStandardMaterial) {
      const k = new THREE.Mesh(o.geometry, mat); o.matrixWorld.decompose(k.position, k.quaternion, k.scale);
      k.castShadow = k.receiveShadow = true; out.add(k); return;
    }
    let geo = o.geometry.clone(); if (geo.index) geo = geo.toNonIndexed();
    geo.applyMatrix4(o.matrixWorld);
    pos.push(...geo.attributes.position.array); nor.push(...geo.attributes.normal.array);
    const c = mat.color, e = mat.emissive;
    for (let i = 0; i < geo.attributes.position.count; i++) col.push(c.r + e.r * 0.5, c.g + e.g * 0.5, c.b + e.b * 0.5);
  });
  if (pos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, BAKED); mesh.castShadow = mesh.receiveShadow = true; out.add(mesh);
  }
  return out;
}
function inst(key, build) { return cached('tpl:' + key, () => bakeGroup(build())).clone(); }
function put(parent, obj, x, y, z, ry = 0) { obj.position.set(x, y, z); obj.rotation.y = ry; parent.add(obj); return obj; }

const hex = c => '#' + c.toString(16).padStart(6, '0');
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function label(x, text, cx, cy, size, color, maxW) {
  x.font = `900 ${size}px "Lilita One", Roboto, "Segoe UI", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = color; x.fillText(text, cx, cy, maxW);
}

// ---------- sky, sea, road ----------
export function makeSky() {
  return canvasTex(8, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a86e8'); g.addColorStop(0.28, '#56b9f2'); g.addColorStop(0.5, '#cfeaf3'); g.addColorStop(1, '#cfeaf3');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
}
export function makeClouds() {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.95 });
  [[-90, 70, -330, 34], [50, 92, -340, 46], [140, 62, -320, 30], [-170, 100, -340, 40], [-15, 54, -335, 24]].forEach(([x, y, z, s]) => {
    for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(G.sph, mat); c.scale.set(s * (0.5 + (i % 3) * 0.22), s * (0.22 + (i % 2) * 0.1), 6); c.position.set(x + (i - 2) * s * 0.36, y + (i % 2) * s * 0.07, z); g.add(c); }
  });
  return g;
}
export function makeSeaTexture() {
  const t = canvasTex(256, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1fc2bb'); g.addColorStop(1, '#14a6ad');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.34)'; x.lineWidth = 3; x.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const px = Math.random() * w, py = Math.random() * h, l = 16 + Math.random() * 30; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + l / 2, py - 5, px + l, py); x.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function makeRoadTexture() {
  const t = canvasTex(512, 512, (x, w, h) => {
    const px = mtr => (4 + mtr) * 64;
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#3d4148'); g.addColorStop(0.5, '#4a4e56'); g.addColorStop(1, '#3d4148');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 2, 2 + Math.random() * 2); }
    x.fillStyle = 'rgba(0,0,0,.10)'; [-2.4, 0, 2.4].forEach(l => { x.fillRect(px(l) - 34, 0, 12, h); x.fillRect(px(l) + 22, 0, 12, h); }); // tyre tracks
    x.fillStyle = '#f6f3e6'; [-1.2, 1.2].forEach(l => x.fillRect(px(l) - 5, 30, 10, 220));
    x.fillStyle = '#f7c531'; [-3.42, 3.42].forEach(l => x.fillRect(px(l) - 4, 0, 8, h));
    for (let k = 0; k < 4; k++) { x.fillStyle = k % 2 ? '#fbfaf5' : hex(PAL.blue); x.fillRect(0, k * 128, 22, 128); x.fillRect(w - 22, k * 128, 22, 128); }
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(22, 0, 6, h); x.fillRect(w - 28, 0, 6, h);
  });
  t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function paveTex() {
  return cached('pave', () => {
    const t = canvasTex(128, 128, (x, w, h) => {
      x.fillStyle = '#ddd6c6'; x.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { x.fillStyle = (r + c) % 2 ? '#dad3c3' : '#e1dacb'; x.fillRect(c * 32 + 1, r * 32 + 1, 30, 30); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 6);
    return t;
  });
}

// ---------- building facades ----------
const SIGNS = ['MAHAMRI & CHAI', 'DUKA LA VIUNGO', 'MNAZI JUICE', 'BIRYANI HOUSE', 'KAHAWA TUNGU', 'PWANI FASHIONS', 'SALOON YA MAMA', 'VIAZI KARAI', 'MADAFU BARIDI', 'SWAHILI DISHES', 'MABUYU NA ACHARI', 'KANGA NA LESO'];
const PASTEL = ['#f6c9a8', '#bfe6d8', '#f7e3a1', '#f3b7b0'];
const GLASS = [['#2f86c9', '#7fd0f0'], ['#128c9c', '#7fe0dc'], ['#3a5fb0', '#9ab8f0']];
function glass(x, gx, gy, w, h, a = '#5fa3dc', b = '#a9d8f5') { // a window pane with a sky reflection
  const g = x.createLinearGradient(gx, gy, gx + w, gy + h); g.addColorStop(0, b); g.addColorStop(0.5, a); g.addColorStop(1, '#2a5f9c');
  x.fillStyle = g; x.fillRect(gx, gy, w, h);
  x.fillStyle = 'rgba(255,255,255,.28)'; x.beginPath(); x.moveTo(gx, gy + h * 0.55); x.lineTo(gx + w * 0.6, gy); x.lineTo(gx + w * 0.9, gy); x.lineTo(gx, gy + h * 0.9); x.fill();
}
function facade(style, floors, v) {
  const K = 4 / 3;
  return cached(`f${style}${floors}${v}`, () => canvasTex(512, Math.round((144 + floors * 96) * K), x => {
    x.scale(K, K);
    const W = 384, H = 144 + floors * 96, blue = hex(PAL.blue), FH = 96, top = 24, gy = top + floors * FH;
    if (style === 'mall') { // Nyali Centre: banner band, glass storeys, glass shopfronts
      x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, W, H);
      x.fillStyle = ['#12b5b0', '#d81e5b', '#1546b8'][v % 3]; x.fillRect(0, 6, W, 56);
      label(x, ['NYALI CENTRE', 'FOOD COURT', 'CINEMA'][v % 3], W / 2, 35, 34, '#ffffff', W - 40);
      for (let f = 0; f < floors; f++) { const y = 70 + f * 96; glass(x, 8, y, W - 16, 80, '#2f86c9', '#9fd8f5'); x.fillStyle = 'rgba(255,255,255,.85)'; for (let c = 1; c < 6; c++) x.fillRect(c * 64 - 2, y, 4, 80); }
      x.fillStyle = '#1b2433'; x.fillRect(0, gy + 16, W, H);
      glass(x, 18, gy + 26, 150, 104, '#3d6d9c', '#9fd0ea'); glass(x, 216, gy + 26, 150, 104, '#3d6d9c', '#9fd0ea');
      x.fillStyle = '#ffc21a'; x.fillRect(176, gy + 36, 32, 94);
      return;
    }
    if (style === 'tower') { // modern glass curtain wall
      const [a, b] = GLASS[v % 3];
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, b); g.addColorStop(0.45, a); g.addColorStop(1, '#1d4f86');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgba(255,255,255,.16)'; for (let i = 0; i < 5; i++) { x.beginPath(); const sx = -80 + i * 110; x.moveTo(sx, H); x.lineTo(sx + 150, 0); x.lineTo(sx + 190, 0); x.lineTo(sx + 40, H); x.fill(); }
      x.fillStyle = 'rgba(255,255,255,.85)'; for (let c = 0; c <= 8; c++) x.fillRect(c * 48 - 2, 0, 4, gy);
      for (let f = 0; f <= floors * 2; f++) { x.fillStyle = f % 2 ? 'rgba(255,255,255,.55)' : 'rgba(13,27,42,.55)'; x.fillRect(0, top + f * 48 - 3, W, f % 2 ? 3 : 7); }
      x.fillStyle = '#eef2f5'; x.fillRect(0, 0, W, top); x.fillRect(0, gy, W, 26);
      x.fillStyle = '#1b2433'; x.fillRect(0, gy + 26, W, H);
      for (let c = 0; c < 4; c++) glass(x, 10 + c * 94, gy + 34, 82, 100, '#3d6d9c', '#9fd0ea');
      x.fillStyle = '#0d1b2a'; x.fillRect(150, gy + 4, 84, 18); label(x, ['PWANI PLAZA', 'NYALI TOWERS', 'BAHARI HOUSE'][v % 3], 192, gy + 13, 12, '#ffffff', 80);
      x.fillStyle = '#cfd6dc'; x.fillRect(0, H - 10, W, 10);
      return;
    }
    const wall = { cbd: '#fbfaf5', balcony: '#ffffff', old: '#f1e6cf', coral: '#d9ccb2', pastel: PASTEL[v % 4] }[style];
    x.fillStyle = wall; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) { x.fillStyle = `rgba(120,100,70,${0.02 + Math.random() * 0.04})`; x.fillRect(Math.random() * W, Math.random() * H, 6 + Math.random() * 30, 30 + Math.random() * 120); }
    if (style === 'coral') for (let i = 0; i < 420; i++) { // coral-rag rubble showing through worn lime plaster
      x.fillStyle = ['rgba(150,128,96,.35)', 'rgba(240,232,214,.5)', 'rgba(120,100,76,.25)'][i % 3];
      x.beginPath(); x.ellipse(Math.random() * W, Math.random() * H, 3 + Math.random() * 9, 2 + Math.random() * 6, Math.random() * 3, 0, 7); x.fill();
    }
    x.fillStyle = isOld(style) ? '#8a5a33' : style === 'pastel' ? '#ffffff' : blue; x.fillRect(0, 0, W, top - 8);
    x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, top - 8, W, 5);
    for (let f = 0; f < floors; f++) {
      const y = top + f * FH;
      for (let c = 0; c < 4; c++) {
        const cx = 20 + c * 92;
        x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(cx + 3, y + 17, 68, 62); // recess shadow
        if (style === 'cbd') {
          x.fillStyle = blue; x.fillRect(cx, y + 14, 68, 62);
          glass(x, cx + 5, y + 19, 27, 52); glass(x, cx + 36, y + 19, 27, 52);
          x.fillStyle = '#e9e6dc'; x.fillRect(cx - 4, y + 76, 76, 5);
        } else if (style === 'balcony') {
          x.fillStyle = '#27496d'; x.fillRect(cx + 4, y + 10, 30, 64);
          glass(x, cx + 7, y + 13, 24, 40, '#4a86b8', '#9fd0ea'); glass(x, cx + 40, y + 18, 26, 36);
        } else if (isOld(style)) {
          x.fillStyle = '#5a3a22'; x.beginPath(); x.moveTo(cx + 8, y + 78); x.lineTo(cx + 8, y + 34); x.arc(cx + 34, y + 34, 26, Math.PI, 0); x.lineTo(cx + 60, y + 78); x.fill();
          x.strokeStyle = '#8a6a44'; x.lineWidth = 2; for (let s = 0; s < 6; s++) { x.beginPath(); x.moveTo(cx + 12, y + 36 + s * 7); x.lineTo(cx + 56, y + 36 + s * 7); x.stroke(); }
          x.fillStyle = wall; x.fillRect(cx + 33, y + 10, 2, 68);
        } else {
          x.fillStyle = '#ffffff'; x.fillRect(cx + 4, y + 14, 64, 60);
          x.fillStyle = '#12807b'; x.fillRect(cx + 8, y + 18, 26, 52); x.fillRect(cx + 38, y + 18, 26, 52);
          x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.5; for (let s = 0; s < 7; s++) { x.beginPath(); x.moveTo(cx + 9, y + 22 + s * 7); x.lineTo(cx + 63, y + 22 + s * 7); x.stroke(); }
        }
      }
      if (style === 'cbd') { x.fillStyle = blue; x.fillRect(0, y + 88, W, 6); }
    }
    if (isOld(style)) {
      x.fillStyle = '#4a2e18'; x.beginPath(); x.moveTo(146, H); x.lineTo(146, gy + 44); x.arc(192, gy + 44, 46, Math.PI, 0); x.lineTo(238, H); x.fill();
      x.fillStyle = '#6b4423'; x.fillRect(154, gy + 46, 34, H); x.fillRect(196, gy + 46, 34, H);
      x.fillStyle = '#e0b04a'; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { x.beginPath(); x.arc(160 + c * 8 + (c > 1 ? 26 : 0), gy + 58 + r * 16, 2.4, 0, 7); x.fill(); }
      x.fillStyle = '#3f2814'; x.fillRect(190, gy + 10, 4, H);
      [40, 290].forEach(wx => { x.fillStyle = '#5a3a22'; x.fillRect(wx, gy + 34, 54, 56); x.fillStyle = wall; for (let b = 0; b < 4; b++) x.fillRect(wx + 8 + b * 12, gy + 34, 3, 56); });
    } else {
      [10, 198].forEach((sx, k) => {
        x.fillStyle = '#1b2433'; x.fillRect(sx, gy + 40, 176, H);
        glass(x, sx + 8, gy + 48, 100, 80, '#31506e', '#7fb0cc');
        x.fillStyle = '#e9c98d'; x.fillRect(sx + 116, gy + 80, 52, 6); x.fillRect(sx + 116, gy + 100, 52, 6);
        x.fillStyle = k ? hex(PAL.sun) : '#ffffff'; x.fillRect(sx + 6, gy + 6, 164, 28);
        x.strokeStyle = '#0d1b2a'; x.lineWidth = 3; x.strokeRect(sx + 6, gy + 6, 164, 28);
        label(x, SIGNS[(v * 5 + k * 3 + floors) % SIGNS.length], sx + 88, gy + 21, 17, '#0d1b2a', 152);
      });
      x.fillStyle = blue; x.fillRect(0, H - 14, W, 14);
    }
    const sh = x.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(255,255,255,.08)'); sh.addColorStop(0.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.16)');
    x.fillStyle = sh; x.fillRect(0, 0, W, H);
  }));
}
const isOld = st => st === 'old' || st === 'coral';
// A whole building as one template.  Its street face is at local x = -D/2 (the right-hand side of the road).
const BW = 11, BD = 9;
function building(style, floors, v) {
  const h = 1.6 + floors * 3.1;
  return {
    h, obj: inst(`b${style}${floors}${v}`, () => {
      const g = new THREE.Group(), fx = -BD / 2, fh = 3.1;
      // the roof samples a small roof-coloured patch painted in the facade's top-left corner
      const tex = facade(style, floors, v), cv = tex.image, x2 = cv.getContext('2d');
      x2.setTransform(1, 0, 0, 1, 0, 0); x2.fillStyle = style === 'tower' ? '#dfe5ea' : '#cfc9ba'; x2.fillRect(0, 0, 6, 6); tex.needsUpdate = true;
      const du = 1 / cv.width, dv = 1 / cv.height, full = [0, 0, 1, 1], roof = [du * 2, 1 - dv * 4, du * 4, 1 - dv * 2];
      const b = new THREE.Mesh(cached(`bg${style}${floors}${v}`, () => atlasBox([full, full, roof, roof, full, full])), Lam({ map: tex }));
      b.scale.set(BD, h, BW); b.position.y = h / 2; b.castShadow = b.receiveShadow = true; g.add(b);
      const blue = M(PAL.blue), white = M(0xfbfaf5), awn = style === 'pastel' ? M(BRIGHT[(v * 3) % BRIGHT.length]) : blue;
      // parapet and rooftop clutter
      const cap = M(isOld(style) ? 0x8a5a33 : style === 'tower' ? 0xeef2f5 : style === 'pastel' ? 0xffffff : PAL.blue);
      m(G.box, cap, BD + 0.3, 0.35, 0.3, 0, h + 0.17, BW / 2, g); m(G.box, cap, BD + 0.3, 0.35, 0.3, 0, h + 0.17, -BW / 2, g);
      m(G.box, cap, 0.3, 0.35, BW + 0.3, fx, h + 0.17, 0, g); m(G.box, cap, 0.3, 0.35, BW + 0.3, -fx, h + 0.17, 0, g);
      if (style === 'mall') { // entrance canopy and hanging banners
        m(G.box, M(0x12b5b0), 2.4, 0.25, BW - 1, fx - 1.1, 4.3, 0, g);
        for (const z of [-4, 4]) m(G.box, M(BRIGHT[(v + (z > 0 ? 2 : 5)) % BRIGHT.length]), 0.1, 3.2, 1.1, fx - 0.3, 6.8, z, g);
      }
      if (style === 'tower') {
        m(G.box, M(0xeef2f5), 4, 1.6, 5, 0.5, h + 0.8, 0, g); m(G.cyl, M(0x8d99a6), 0.12, 4, 0.12, 1, h + 3.4, 1, g); m(G.sph, M(0xc8102e), 0.3, 0.3, 0.3, 1, h + 5.4, 1, g);
        for (let k = 0; k < 5; k++) m(G.box, white, 0.5, h - 4.4, 0.22, fx - 0.2, 4.4 + (h - 4.4) / 2, -BW / 2 + 0.11 + k * (BW - 0.22) / 4, g); // fins
        m(G.box, white, 2.0, 0.22, BW + 0.2, fx - 0.9, 4.25, 0, g);                                                                              // entrance canopy
        m(G.cyl, M(0xbfc4c8), 0.16, 4.2, 0.16, fx - 1.6, 2.1, -3.5, g); m(G.cyl, M(0xbfc4c8), 0.16, 4.2, 0.16, fx - 1.6, 2.1, 3.5, g);
      } else {
        m(G.cyl, M(0x15171b), 1.5, 1.4, 1.5, 1.2, h + 0.7, -2 + (v % 3) * 2, g);                                                                  // water tank
        m(G.box, M(0x8d99a6), 1.7, 0.2, 1.7, 1.2, h + 0.1, -2 + (v % 3) * 2, g);
        if (v % 2) { const d = m(G.sph, M(0xe6e6e6), 1.1, 0.25, 1.1, -1.5, h + 0.75, 3, g); d.rotation.z = 0.7; m(G.cyl, M(0x8d99a6), 0.08, 0.8, 0.08, -1.3, h + 0.4, 3, g); } // dish
      }
      if (style === 'cbd' || style === 'pastel') {
        for (const z of [-2.75, 2.75]) { const a = m(G.box, awn, 1.5, 0.1, 4.9, fx - 0.65, 3.0, z, g); a.rotation.z = -0.28; m(G.box, white, 0.12, 0.34, 4.9, fx - 1.36, 2.64, z, g); }
        for (let f = 0; f < floors; f++) {
          m(G.box, style === 'cbd' ? blue : white, 0.3, 0.14, BW + 0.1, fx - 0.1, 4.55 + f * fh, 0, g);
          if ((f + v) % 2 === 0) m(G.box, M(0xe2e5e8), 0.5, 0.45, 0.8, fx - 0.25, 5.2 + f * fh, -BW / 2 + 1.5 + ((f * 3 + v) % 4) * 2.7, g);       // air conditioner
        }
        const s = m(G.box, M(BRIGHT[(v * 2 + floors) % BRIGHT.length]), 1.3, 1.9, 0.16, fx - 0.75, 6.4, BW / 2 - 0.4, g); m(G.box, white, 1.0, 1.5, 0.2, fx - 0.75, 6.4, BW / 2 - 0.4, g); s.castShadow = true; // blade sign
      }
      if (style === 'balcony') for (let f = 0; f < floors; f++) for (let c = 0; c < 4; c++) {
        const z = -BW / 2 + 1.45 + c * 2.7, y = 4.75 + f * fh;
        m(G.box, white, 1.1, 0.14, 2.3, fx - 0.5, y, z, g); m(G.box, blue, 0.08, 0.9, 2.3, fx - 1.0, y + 0.5, z, g);
        m(G.box, blue, 1.0, 0.9, 0.08, fx - 0.5, y + 0.5, z - 1.12, g); m(G.box, blue, 1.0, 0.9, 0.08, fx - 0.5, y + 0.5, z + 1.12, g);
      }
      if (isOld(style)) { // carved door surround, balcony (wooden, or coral stone) and lanterns
        const coral = style === 'coral', frame = M(coral ? 0xc9b894 : 0x5a3a22), brass = M(0xe0b04a, { emissive: 0x553300 });
        for (const z of [-1.4, 1.4]) m(G.box, frame, 0.3, 3.0, 0.32, fx - 0.12, 1.5, z, g);
        m(G.box, frame, 0.34, 0.36, 3.2, fx - 0.14, 3.15, 0, g); m(G.box, frame, 0.5, 0.12, 3.5, fx - 0.2, 3.4, 0, g);
        for (let k = 0; k < 6; k++) m(G.sph, brass, 0.09, 0.09, 0.09, fx - 0.05, 0.6 + (k % 3) * 0.75, k < 3 ? -0.5 : 0.5, g);
        const y = 1.6 + (floors - 1) * fh + 0.4, wood = M(coral ? 0xd5c6a5 : 0x6b4423), dark = M(coral ? 0xb7a682 : 0x4a2e18);
        m(G.box, wood, 1.2, 0.16, 5.8, fx - 0.55, y, 0, g); m(G.box, wood, 0.1, 1.1, 5.8, fx - 1.1, y + 0.6, 0, g);
        m(G.box, dark, 1.4, 0.14, 6.2, fx - 0.6, y + 2.5, 0, g);
        for (let k = 0; k < 5; k++) m(G.box, dark, 0.12, 2.4, 0.12, fx - 1.1, y + 1.25, -2.8 + k * 1.4, g);
        m(G.box, dark, 0.5, 0.2, 3.6, fx - 0.25, 4.1, 0, g);
        for (const z of [-2.2, 2.2]) { m(G.box, M(0x2a2018), 0.4, 0.06, 0.06, fx - 0.2, 3.5, z, g); m(G.box, M(0xffd77a, { emissive: 0xaa7711 }), 0.26, 0.4, 0.26, fx - 0.4, 3.25, z, g); }
      }
      return g;
    }),
  };
}

// ---------- pickups ----------
function tinted(geo, color) {
  geo = geo.toNonIndexed(); const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
const COIN_GEO = mergeGeometries([
  tinted(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 22).rotateX(Math.PI / 2), 0xffc21a),
  tinted(new THREE.TorusGeometry(0.36, 0.045, 8, 24), 0xffe07a),
  tinted(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 18).rotateX(Math.PI / 2), 0xfff0a0),
]);
const COIN_MAT = Lam({ vertexColors: true, emissive: 0x7a5200 });
export function makeCoin() { return new THREE.Mesh(COIN_GEO, COIN_MAT); } // no shadow: coins are many and small
const halo = color => new THREE.Mesh(G.halo, cached('halo' + color, () => curveMat(new THREE.MeshBasicMaterial({ color }))));
export function makeCup() { // kahawa tungu, served small and strong
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cached('cupG', () => new THREE.CylinderGeometry(0.27, 0.17, 0.42, 16)), M(0xffffff, { emissive: 0x555555 })));
  m(G.cyl, M(0x3a2010), 0.48, 0.04, 0.48, 0, 0.2, 0, g);
  m(G.cyl, M(PAL.blue), 0.58, 0.06, 0.58, 0, -0.03, 0, g);
  m(G.cyl, M(0xffc21a, { emissive: 0x8a5a00 }), 0.6, 0.05, 0.6, 0, -0.24, 0, g);
  g.add(halo(PAL.sun));
  return g;
}
const DOME = new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
export function makeHelmetModel() { // bodaboda helmet, also worn by the runner while the shield lasts
  const g = new THREE.Group();
  m(DOME, M(0xd81e1e, { emissive: 0x330000 }), 0.64, 0.6, 0.7, 0, 0, 0, g);
  m(G.box, M(0xffffff), 0.08, 0.3, 0.72, 0, 0.12, 0.02, g);
  m(G.box, M(0x14181f), 0.5, 0.14, 0.08, 0, 0.08, -0.33, g);
  return g;
}
export function makeHelmet() { const g = new THREE.Group(); g.add(makeHelmetModel()); g.add(halo(0x3ee6c4)); return g; }
export function makeNdara() {
  const g = new THREE.Group(), s = new THREE.Group(); g.add(s);
  m(G.cyl, M(PAL.pink, { emissive: 0x4a0a20 }), 0.36, 0.08, 0.82, 0, 0, 0, s);
  m(G.box, M(0xffffff), 0.05, 0.1, 0.36, 0.08, 0.08, -0.14, s).rotation.y = 0.5;
  m(G.box, M(0xffffff), 0.05, 0.1, 0.36, -0.08, 0.08, -0.14, s).rotation.y = -0.5;
  s.rotation.x = 0.9;
  g.add(halo(PAL.coral));
  return g;
}

// ---------- obstacles ----------
const KANGA = [['#c8102e', '#ffc21a', '#0d1b2a', 'HARAKA HARAKA HAINA BARAKA'], ['#1546b8', '#ffffff', '#e98a4b', 'MOMBASA RAHA'], ['#2f9e44', '#f7e3a1', '#d81e5b', 'POLE POLE NDIO MWENDO']];
function kangaTex(i) {
  return cached('k' + i, () => canvasTex(256, 160, (x, W, H) => {
    const [a, b, c, text] = KANGA[i];
    x.fillStyle = a; x.fillRect(0, 0, W, H);
    x.fillStyle = b; x.fillRect(14, 14, W - 28, H - 28);
    x.fillStyle = c; for (let k = 0; k < 16; k++) { x.beginPath(); x.arc(8 + k * 16, 7, 4, 0, 7); x.arc(8 + k * 16, H - 7, 4, 0, 7); x.fill(); }
    x.fillStyle = a; for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(40 + k * 35 + (r % 2) * 17, 34 + r * 26, 9, 0, 7); x.fill(); }
    x.fillStyle = c; x.fillRect(14, H - 50, W - 28, 36);
    label(x, text, W / 2, H - 31, 15, '#ffffff', W - 40);
  }));
}
const MATATU = [['#d81e5b', 'MOMBASA RAHA'], ['#12b5b0', 'PWANI EXPRESS'], ['#7b3fb3', 'BAMBURI SACCO']];
function matatuFront(i) {
  return cached('mf' + i, () => canvasTex(256, 256, (x, W, H) => {
    const col = MATATU[i][0];
    x.fillStyle = '#fbfaf5'; x.fillRect(0, 0, W, H); x.fillStyle = col; x.fillRect(0, 150, W, H);
    glass(x, 14, 18, W - 28, 100, '#24384f', '#8fbcd8'); x.fillStyle = '#ffc21a'; x.fillRect(0, 130, W, 14);
    x.fillStyle = '#1b2433'; x.fillRect(70, 168, 116, 46); x.fillStyle = '#fffbe0'; x.fillRect(10, 160, 48, 30); x.fillRect(W - 58, 160, 48, 30);
    x.fillStyle = '#fff'; x.fillRect(84, 222, 88, 24); label(x, 'KDA 001M', 128, 234, 15, '#0d1b2a', 80);
  }));
}
function matatuTex(i, rear) {
  return cached(`m${i}${rear}`, () => canvasTex(rear ? 256 : 512, 256, (x, W, H) => {
    const [col, text] = MATATU[i];
    x.fillStyle = '#fbfaf5'; x.fillRect(0, 0, W, H);
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 150); x.lineTo(W, 96); x.lineTo(W, H); x.lineTo(0, H); x.fill();
    x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.moveTo(0, 190); x.lineTo(W, 150); x.lineTo(W, 166); x.lineTo(0, 206); x.fill();
    x.fillStyle = '#ffc21a'; x.fillRect(0, 134, W, 14);
    if (rear) { glass(x, 26, 22, W - 52, 78, '#24384f', '#6f9cc0'); x.fillStyle = '#c8102e'; x.fillRect(12, 156, 38, 26); x.fillRect(W - 50, 156, 38, 26); x.fillStyle = '#ffb000'; x.fillRect(12, 184, 38, 10); x.fillRect(W - 50, 184, 38, 10); x.fillStyle = '#fff'; x.fillRect(84, 200, 88, 26); label(x, 'KDA 001M', 128, 214, 15, '#0d1b2a', 80); label(x, 'TUPO SITE', 128, 122, 20, col, 200); }
    else { for (let k = 0; k < 4; k++) glass(x, 22 + k * 122, 24, 104, 76, '#24384f', '#6f9cc0'); label(x, text, W / 2, 200, 36, '#ffffff', W - 60); }
  }));
}
const TYRE = M(0x16181c), HUB = M(0xc9ced2);
function wheel(g, x, y, z, r, w = 0.24) { m(G.cyl, TYRE, r * 2, w, r * 2, x, y, z, g).rotation.z = Math.PI / 2; m(G.cyl, HUB, r, w + 0.03, r, x, y, z, g).rotation.z = Math.PI / 2; }
const OBST = {
  tuktuk(v) {
    const g = new THREE.Group(), col = M([0xffc21a, 0x1546b8, 0xc8102e, 0x2f9e44][v % 4]), black = M(0x17191d), chrome = M(0xc9ced2);
    R(col, 1.46, 0.82, 2.1, 0.16, 0, 0.76, 0.1, g);                       // tub
    R(col, 0.86, 0.7, 0.7, 0.2, 0, 0.74, -1.2, g);                        // nose
    R(black, 1.42, 0.86, 1.95, 0.22, 0, 1.56, 0.12, g);                   // canvas hood
    m(G.box, M(0x9fd0f0), 0.92, 0.36, 0.05, 0, 1.6, 1.1, g);              // rear window
    m(G.box, M(0x9fd0f0), 0.9, 0.5, 0.05, 0, 1.52, -0.86, g).rotation.x = 0.35;
    m(G.box, M(0x2a2d33), 0.04, 0.62, 1.3, -0.72, 1.22, 0.05, g); m(G.box, M(0x2a2d33), 0.04, 0.62, 1.3, 0.72, 1.22, 0.05, g); // open sides
    m(G.box, M(0xffffff), 1.5, 0.1, 2.14, 0, 1.02, 0.1, g);               // stripe
    m(G.box, chrome, 1.5, 0.12, 0.12, 0, 0.42, 1.17, g);                  // bumper
    for (const s of [-1, 1]) { m(G.box, M(0xe01b1b, { emissive: 0x700000 }), 0.22, 0.14, 0.06, s * 0.55, 0.7, 1.16, g); R(black, 0.34, 0.2, 0.7, 0.08, s * 0.72, 0.62, 0.68, g); }
    m(G.box, M(0xffffff), 0.52, 0.17, 0.05, 0, 0.6, 1.17, g); m(G.sph, M(0xfff3b0, { emissive: 0x888844 }), 0.2, 0.2, 0.1, 0, 0.86, -1.56, g);
    wheel(g, -0.72, 0.3, 0.68, 0.3); wheel(g, 0.72, 0.3, 0.68, 0.3); wheel(g, 0, 0.3, -1.3, 0.3);
    return { g, kind: 'block', half: 1.4 };
  },
  matatu(v) {
    const g = new THREE.Group(), i = v % 3;
    // side | rear | front painted side by side into one 1024 x 256 texture
    const atlas = cached('matAtlas' + i, () => canvasTex(1024, 256, x => {
      x.drawImage(matatuTex(i, false).image, 0, 0); x.drawImage(matatuTex(i, true).image, 512, 0); x.drawImage(matatuFront(i).image, 768, 0);
    }));
    for (const z of [-2.21]) for (const s of [-0.75, 0.75]) m(G.box, M(0xfffbe0, { emissive: 0xbbbb88 }), 0.4, 0.2, 0.04, s, 0.95, z, g);
    const sideR = [0, 0, 0.5, 1], white = [0.003, 0.985, 0.006, 0.99];
    const body = new THREE.Mesh(cached('matGeo', () => atlasBox([sideR, sideR, white, white, [0.5, 0, 0.75, 1], [0.75, 0, 1, 1]])), cached('matMat' + i, () => Lam({ map: atlas })));
    body.scale.set(2.0, 1.9, 4.4); body.position.y = 1.3; body.castShadow = body.receiveShadow = true; g.add(body);
    R(M(0xfbfaf5), 1.9, 0.3, 4.3, 0.14, 0, 2.3, 0, g);                    // rounded roof
    for (const x of [-0.8, 0.8]) m(G.box, M(0x22252b), 0.06, 0.08, 3.8, x, 2.5, 0, g); // roof rails; the roof itself is runnable
    R(M(0x22252b), 2.06, 0.22, 0.2, 0.06, 0, 0.5, 2.2, g);               // bumper
    for (const s of [-1, 1]) { m(G.box, M(0x22252b), 0.1, 0.22, 0.3, s * 1.06, 1.75, -1.7, g); R(M(0x22252b), 0.14, 0.34, 0.9, 0.06, s * 1.0, 0.58, 1.4, g); R(M(0x22252b), 0.14, 0.34, 0.9, 0.06, s * 1.0, 0.58, -1.4, g); }
    for (const z of [-1.4, 1.4]) { wheel(g, -0.95, 0.38, z, 0.38, 0.28); wheel(g, 0.95, 0.38, z, 0.38, 0.28); }
    return { g, kind: 'block', half: 2.3, top: 2.5 };
  },
  cart() { // mkokoteni loaded with madafu
    const g = new THREE.Group(), wood = M(PAL.wood), light = M(0x9a6a3a);
    m(G.box, wood, 1.5, 0.1, 2.0, 0, 0.62, 0, g);
    for (let k = 0; k < 4; k++) m(G.box, light, 0.3, 0.04, 2.0, -0.56 + k * 0.375, 0.69, 0, g);
    for (const s of [-1, 1]) { m(G.box, wood, 0.08, 0.34, 2.0, s * 0.74, 0.84, 0, g); m(G.box, wood, 0.08, 0.08, 1.2, s * 0.6, 0.66, 1.5, g); }
    m(G.box, wood, 1.3, 0.08, 0.08, 0, 0.66, 2.1, g);
    wheel(g, -0.88, 0.5, -0.2, 0.5, 0.1); wheel(g, 0.88, 0.5, -0.2, 0.5, 0.1);
    for (let k = 0; k < 8; k++) m(G.sph, M(k % 3 ? 0x4c9a2a : 0x7fb83a), 0.44, 0.5, 0.44, -0.45 + (k % 3) * 0.45, 0.94 + (k > 5 ? 0.34 : 0), -0.7 + Math.floor(k / 3) * 0.6, g);
    return { g, kind: 'low', half: 1.15 };
  },
  crates() { // maembe na machungwa
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * 0.74;
      R(M(0xb98a4e), 0.68, 0.5, 0.72, 0.05, x, 0.25, 0, g);
      m(G.box, M(PAL.wood), 0.72, 0.07, 0.76, x, 0.2, 0, g); m(G.box, M(PAL.wood), 0.72, 0.07, 0.76, x, 0.42, 0, g);
      const fruit = M([0xff9f1c, 0xffd23f, 0xc8102e][k]);
      for (let f = 0; f < 5; f++) m(G.sph, fruit, 0.26, 0.26, 0.26, x - 0.17 + (f % 2) * 0.34, 0.58 + (f === 4 ? 0.16 : 0), f === 4 ? 0 : -0.16 + Math.floor(f / 2) * 0.32, g);
    }
    return { g, kind: 'low', half: 0.5 };
  },
  kanga(v) { // a kanga hung across the lane: slide under it
    const g = new THREE.Group(), pole = M(0xc9a35a);
    for (const s of [-1, 1]) { m(G.cyl, pole, 0.1, 2.9, 0.1, s * 1.12, 1.45, 0, g); m(G.cyl, M(0x8d99a6), 0.5, 0.16, 0.5, s * 1.12, 0.08, 0, g); }
    m(G.box, M(0x333333), 2.3, 0.04, 0.04, 0, 2.72, 0, g);
    const cloth = new THREE.Mesh(G.plane, Lam({ map: kangaTex(v % 3), side: THREE.DoubleSide }));
    cloth.scale.set(2.1, 1.36, 1); cloth.position.set(0, 2.03, 0); g.add(cloth);
    return { g, kind: 'high', half: 0.3 };
  },
};
function stripes(text, a, b, textColor) { // diagonal hazard stripes with a white plate in the middle
  return canvasTex(256, 64, (x, W, H) => {
    for (let k = -1; k < 9; k++) { x.fillStyle = k % 2 ? b : a; x.beginPath(); x.moveTo(k * 32 - 16, H); x.lineTo(k * 32 + 16, 0); x.lineTo(k * 32 + 48, 0); x.lineTo(k * 32 + 16, H); x.fill(); }
    if (text) { x.fillStyle = '#ffffff'; x.fillRect(58, 10, 140, 44); x.strokeStyle = '#0d1b2a'; x.lineWidth = 3; x.strokeRect(58, 10, 140, 44); label(x, text, 128, 33, 30, textColor, 128); }
  });
}
Object.assign(OBST, {
  barrier() { // HAPANA / HALT road barrier: jump it
    const g = new THREE.Group(), face = cached('hapM', () => Lam({ map: stripes('HAPANA', '#d81e1e', '#ffffff', '#c8102e') })), w = M(0xffffff);
    const board = new THREE.Mesh(G.box, [w, w, w, w, face, face]); board.scale.set(2.1, 0.5, 0.08); board.position.y = 0.78; board.castShadow = true; g.add(board);
    for (const x of [-0.85, 0.85]) for (const z of [-0.22, 0.22]) m(G.box, M(0xd9d9d9), 0.07, 1.05, 0.07, x, 0.5, z, g).rotation.x = z > 0 ? 0.22 : -0.22;
    m(G.sph, M(0xff9a1a, { emissive: 0xcc5500 }), 0.16, 0.16, 0.16, -0.85, 1.12, 0, g);
    return { g, kind: 'low', half: 0.4 };
  },
  cones() { // construction cones across the lane: jump them
    const g = new THREE.Group();
    for (const x of [-0.75, 0, 0.75]) {
      m(G.box, M(0x17191d), 0.5, 0.06, 0.5, x, 0.03, 0, g);
      m(G.cone, M(0xff6a00), 0.42, 0.85, 0.42, x, 0.48, 0, g);
      m(G.cyl, M(0xffffff), 0.27, 0.12, 0.27, x, 0.55, 0, g);
    }
    m(G.box, M(0xffffff), 1.7, 0.06, 0.06, 0, 0.72, 0, g);
    return { g, kind: 'low', half: 0.35 };
  },
  sign() { // overhead PUNGUZA MWENDO board: slide under it
    const g = new THREE.Group(), steel = M(0x8d99a6);
    for (const x of [-1.15, 1.15]) m(G.cyl, steel, 0.12, 3.0, 0.12, x, 1.5, 0, g);
    const tex = cached('punguza', () => canvasTex(256, 96, (x, W, H) => {
      x.fillStyle = '#ffc21a'; x.fillRect(0, 0, W, H); x.strokeStyle = '#0d1b2a'; x.lineWidth = 8; x.strokeRect(4, 4, W - 8, H - 8);
      label(x, 'PUNGUZA', W / 2, 32, 34, '#0d1b2a', W - 30); label(x, 'MWENDO', W / 2, 68, 30, '#c8102e', W - 30);
    }));
    const y = M(0xffc21a), board = new THREE.Mesh(G.box, [y, y, y, y, cached('pgM', () => Lam({ map: tex })), y]);
    board.scale.set(2.3, 0.95, 0.1); board.position.y = 2.2; board.castShadow = true; g.add(board);
    return { g, kind: 'high', half: 0.3 };
  },
  ramp() { // a wooden ramp up onto a line of parked matatus
    const g = new THREE.Group(), L = 5, H = 2.5, a = Math.atan2(H, L), len = Math.hypot(L, H), wood = M(0x9a6a3a);
    const deck = m(G.box, wood, 2.1, 0.16, len, 0, H / 2, 0, g); deck.rotation.x = a;
    for (const x of [-0.98, 0.98]) { const e = m(G.box, M(0xffc21a), 0.14, 0.2, len, x, H / 2 + 0.06, 0, g); e.rotation.x = a; }
    for (let k = 0; k < 3; k++) { const z = 1.6 - k * 1.6, h = H * (L / 2 - z) / L; if (h > 0.2) for (const x of [-0.85, 0.85]) m(G.box, M(0x6b4423), 0.14, h, 0.14, x, h / 2, z, g); }
    return { g, kind: 'ramp', half: L / 2, top: H };
  },
});
function obstacleMeta(type, v) {
  return cached('ob:' + type + v, () => { const o = OBST[type](v); return { tpl: bakeGroup(o.g), kind: o.kind, half: o.half, top: o.top || 0 }; });
}
export function buildObstacle(type, rnd) {
  const meta = obstacleMeta(type, Math.floor(rnd() * 4));
  return { mesh: meta.tpl.clone(), kind: meta.kind, half: meta.half, top: meta.top };
}


// ---------- props ----------
const MODEL = {
  palm(v) {
    const p = new THREE.Group(), h = 5 + v * 1.1, trunk = M(0x8a6a44);
    for (let k = 0; k < 5; k++) { const t = m(G.cyl, trunk, 0.36 - k * 0.03, h / 5 + 0.05, 0.36 - k * 0.03, Math.sin(k * 0.5) * 0.25 * (v % 2 ? 1 : -1), h / 10 + k * h / 5, 0, p); t.rotation.z = (v % 2 ? -1 : 1) * 0.07; }
    const tx = Math.sin(2.0) * 0.25 * (v % 2 ? 1 : -1);
    for (let k = 0; k < 8; k++) {
      const f = new THREE.Group(); f.position.set(tx, h, 0); f.rotation.y = k * 0.785; p.add(f);
      m(G.box, M(k % 2 ? PAL.palm : 0x3fb457), 0.6, 0.05, 1.5, 0, -0.12, 0.75, f).rotation.x = 0.2;
      m(G.box, M(k % 2 ? 0x278a3a : PAL.palm), 0.45, 0.05, 1.5, 0, -0.72, 2.05, f).rotation.x = 0.62;
    }
    for (let k = 0; k < 3; k++) m(G.sph, M(0x4c9a2a), 0.36, 0.38, 0.36, tx + Math.cos(k * 2.1) * 0.22, h - 0.28, Math.sin(k * 2.1) * 0.22, p);
    return p;
  },
  lamp() {
    const g = new THREE.Group(), s = M(0x5f6b78);
    m(G.cyl, s, 0.16, 6.4, 0.16, 0, 3.2, 0, g); m(G.cyl, s, 0.34, 0.5, 0.34, 0, 0.25, 0, g);
    m(G.box, s, 1.6, 0.1, 0.1, -0.75, 6.3, 0, g); R(M(0xfff3b0, { emissive: 0x777733 }), 0.6, 0.14, 0.3, 0.05, -1.4, 6.22, 0, g);
    return g;
  },
  railing() {
    const g = new THREE.Group(), w = M(0xffffff), b = M(PAL.blue);
    m(G.box, w, 0.1, 0.1, CHUNK, 0, 1.0, 0, g); m(G.box, w, 0.07, 0.07, CHUNK, 0, 0.62, 0, g); m(G.box, w, 0.07, 0.07, CHUNK, 0, 0.3, 0, g);
    for (let k = 0; k < 4; k++) m(G.box, b, 0.16, 1.1, 0.16, 0, 0.55, -CHUNK / 2 + 1.5 + k * 3, g);
    return g;
  },
  dhow(v) {
    const d = new THREE.Group();
    R(M(0x7a4a22), 1.4, 0.9, 5.2, 0.3, 0, 0.3, 0, d); m(G.box, M(0xfbfaf5), 1.44, 0.12, 5.0, 0, 0.66, 0, d);
    m(G.cyl, M(0x4a2e18), 0.12, 4.8, 0.12, 0, 2.9, -0.3, d);
    const sg = cached('sail', () => { const s = new THREE.BufferGeometry(); s.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -1.6, 0, 0, 1.9, 0, 4.4, -0.9], 3)); s.computeVertexNormals(); return s; });
    const sail = new THREE.Mesh(sg, M(0xfffdf2, { side: THREE.DoubleSide, emissive: 0x555555 })); sail.position.set(0, 0.9, 0); d.add(sail);
    d.scale.setScalar(1.3 + v * 0.4);
    return d;
  },
  camel() {
    const c = new THREE.Group(), tan = M(0xc9a26b);
    m(G.sph, tan, 0.9, 0.95, 2.0, 0, 1.75, 0, c); m(G.sph, tan, 0.7, 0.8, 0.9, 0, 2.3, 0.05, c);
    R(M(0xc8102e), 0.95, 0.14, 0.9, 0.05, 0, 2.6, 0.05, c);
    m(G.cyl, tan, 0.3, 1.5, 0.3, 0, 2.5, -1.15, c).rotation.x = -0.5;
    m(G.sph, tan, 0.36, 0.38, 0.72, 0, 3.2, -1.7, c);
    for (const [lx, lz] of [[-0.3, -0.7], [0.3, -0.7], [-0.3, 0.7], [0.3, 0.7]]) m(G.cyl, tan, 0.2, 1.4, 0.2, lx, 0.7, lz, c);
    return c;
  },
  hut() { const g = new THREE.Group(); m(G.cyl, M(0xf1e6cf), 3.2, 1.9, 3.2, 0, 0.95, 0, g); m(G.cone, M(PAL.thatch), 5.2, 2.2, 5.2, 0, 2.9, 0, g); m(G.cone, M(0x8f6c3a), 3.0, 1.2, 3.0, 0, 3.9, 0, g); return g; },
  stall(v) { // market stall, the umbrella leans toward +x
    const g = new THREE.Group(), col = BRIGHT[v % BRIGHT.length];
    R(M(PAL.wood), 0.9, 0.75, 1.5, 0.05, 0, 0.55, 0, g);
    m(G.cyl, M(0x8a6a44), 0.07, 2.4, 0.07, 0.3, 1.35, 0, g);
    m(G.cone, M(col), 2.6, 0.6, 2.6, 0.3, 2.78, 0, g); m(G.cone, M(0xffffff), 1.3, 0.34, 1.3, 0.3, 2.96, 0, g);
    const fruit = [0xff9f1c, 0xffd23f, 0x4c9a2a, 0xc8102e, 0x7b3fb3];
    for (let k = 0; k < 9; k++) m(G.sph, M(fruit[(k + v) % 5]), 0.26, 0.26, 0.26, -0.24 + (k % 3) * 0.24, 1.03, -0.5 + Math.floor(k / 3) * 0.5, g);
    return g;
  },
  tusks() { // the Moi Avenue pembe
    const g = new THREE.Group(), mat = curveMat(new THREE.MeshStandardMaterial({ color: 0xeef1f5, metalness: 0.82, roughness: 0.24 }));
    const band = curveMat(new THREE.MeshStandardMaterial({ color: 0xd9a830, metalness: 0.9, roughness: 0.3 }));
    for (const s of [1, -1]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(s * 5.9, 0, 0), new THREE.Vector3(s * 5.9, 12.2, 0), new THREE.Vector3(s * -3.8, 11.8, 0));
      const N = 24, RS = 10, geo = new THREE.TubeGeometry(curve, N, 1, RS, false), pos = geo.attributes.position, p = new THREE.Vector3();
      for (let i = 0; i <= N; i++) {
        const c = curve.getPointAt(i / N), rad = 1.25 * Math.pow(1 - i / N, 0.8) + 0.12;
        for (let j = 0; j <= RS; j++) { const k = i * (RS + 1) + j; p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(rad).add(c); pos.setXYZ(k, p.x, p.y, p.z); }
      }
      geo.computeVertexNormals();
      for (const dz of [0, -3.0]) {
        m(geo, mat, 1, 1, 1, 0, 0, dz + (s > 0 ? 0 : -0.7), g);
        m(G.cyl, M(0xcfc9ba), 3.0, 0.6, 3.0, s * 5.9, 0.3, dz, g); m(G.cyl, band, 2.7, 0.35, 2.7, s * 5.9, 1.4, dz + (s > 0 ? 0 : -0.7), g);
      }
    }
    return g;
  },
  ferry() { // MV Likoni waiting at the ramp
    const f = new THREE.Group();
    R(M(0x1b2433), 11, 1.8, 30, 0.5, 0, 0.5, 0, f); R(M(0xe98a4b), 11.2, 1.3, 30.2, 0.3, 0, 1.9, 0, f);
    R(M(0xfbfaf5), 9, 2.4, 14, 0.3, 0, 3.7, -2, f); m(G.box, M(PAL.blue), 9.2, 0.5, 14.2, 0, 3.2, -2, f);
    for (let k = 0; k < 6; k++) m(G.box, M(0x24384f), 0.1, 0.9, 1.4, -4.52, 4.1, -7.5 + k * 2.2, f);
    R(M(0xfbfaf5), 5, 1.8, 5, 0.3, 0, 5.8, -4, f); m(G.cyl, M(0xc8102e), 1.3, 2.4, 1.3, 0, 7.4, -1, f); m(G.cyl, M(0x15171b), 1.34, 0.4, 1.34, 0, 8.5, -1, f);
    m(G.box, M(0x6c757d), 7, 0.25, 8, 6.5, 2.1, 6, f).rotation.z = -0.12;
    return f;
  },
  mosque() {
    const g = new THREE.Group(), w = M(0xfbfaf5), gr = M(0x1f8a5b);
    m(G.box, w, 9, 6, CHUNK - 2, 4.5, 3, 0, g); m(G.sph, gr, 6, 5, 6, 4.5, 6, 0, g); m(G.sph, M(0xe0b04a), 0.5, 0.9, 0.5, 4.5, 8.7, 0, g);
    m(G.cyl, w, 1.5, 13, 1.5, 1, 6.5, 4, g); m(G.cone, gr, 2.0, 2.4, 2.0, 1, 14.2, 4, g); m(G.cyl, gr, 2.2, 0.3, 2.2, 1, 10.5, 4, g);
    for (let k = 0; k < 3; k++) m(G.box, M(0x1b4f3a), 0.1, 2.6, 1.2, -0.02, 2.4, -3 + k * 3, g);
    return g;
  },
  bin() { const g = new THREE.Group(); m(G.cyl, M(0x1f8a5b), 0.5, 0.8, 0.5, 0, 0.45, 0, g); m(G.cyl, M(0x17191d), 0.54, 0.08, 0.54, 0, 0.88, 0, g); return g; },
  bench() { const g = new THREE.Group(), w = M(0x9a6a3a); m(G.box, w, 0.5, 0.08, 1.6, 0, 0.5, 0, g); m(G.box, w, 0.08, 0.5, 1.6, 0.24, 0.8, 0, g); for (const z of [-0.7, 0.7]) m(G.box, M(0x444b55), 0.46, 0.5, 0.08, 0, 0.25, z, g); return g; },
  stage() { // bus stop shelter
    const g = new THREE.Group(), b = M(PAL.blue);
    for (const z of [-1.4, 1.4]) m(G.box, b, 0.1, 2.5, 0.1, 0.5, 1.25, z, g);
    R(M(0xfbfaf5), 1.5, 0.12, 3.3, 0.05, 0, 2.55, 0, g); m(G.box, M(0x9fd0f0), 0.05, 1.5, 2.8, 0.52, 1.5, 0, g); m(G.box, M(0x9a6a3a), 0.4, 0.08, 2.4, 0.2, 0.55, 0, g);
    return g;
  },
  deckEdge() { // Nyali Bridge: concrete deck edge, beam, pier and jersey parapet (built for the right-hand side)
    const g = new THREE.Group(), conc = M(0xc9ccd0), dark = M(0x9aa0a6);
    m(G.box, conc, 3.2, 0.5, CHUNK, 1.6, -0.24, 0, g);
    m(G.box, dark, 3.6, 0.9, CHUNK, 1.4, -0.9, 0, g);
    m(G.box, M(PAL.pave), 0.9, 0.22, CHUNK, 0.45, 0.11, 0, g);
    m(G.box, conc, 0.62, 0.42, CHUNK, 1.25, 0.21, 0, g); m(G.box, conc, 0.3, 0.62, CHUNK, 1.25, 0.72, 0, g);
    m(G.box, M(PAL.blue), 0.32, 0.08, CHUNK, 1.25, 1.06, 0, g);
    m(G.box, dark, 2.2, 3.0, 2.0, 1.4, -2.6, 0, g);
    return g;
  },
  carriageway() { // the second, oncoming carriageway of Nyali Bridge, on the left
    const g = new THREE.Group(), conc = M(0xc9ccd0), dark = M(0x9aa0a6);
    m(G.box, M(0x4a4e56), 8.4, 0.5, CHUNK, -13, -0.24, 0, g);
    m(G.box, dark, 8.4, 0.9, CHUNK, -13, -0.9, 0, g);
    for (const z of [-3, 3]) m(G.box, M(0xf6f3e6), 0.14, 0.02, 3, -13, 0.02, z, g);
    for (const x of [-8.8, -17.2]) { m(G.box, conc, 0.6, 0.42, CHUNK, x, 0.21, 0, g); m(G.box, conc, 0.3, 0.62, CHUNK, x, 0.72, 0, g); }
    m(G.box, dark, 2.4, 3.0, 2.0, -13, -2.6, 0, g);
    return g;
  },
  tarp(v) { // striped market awning over the sidewalk, leaning down toward the road (+x is the wall side)
    const g = new THREE.Group(), col = M([0xd81e5b, 0x12b5b0, 0xff7a3d, 0x2f9e44][v % 4]), white = M(0xfff8ea);
    for (let k = 0; k < 10; k++) { const b = m(G.box, k % 2 ? white : col, 3.1, 0.05, (CHUNK - 1) / 10, 0, 0, -CHUNK / 2 + 0.5 + (k + 0.5) * (CHUNK - 1) / 10, g); b.position.set(1.1, 3.75, b.position.z); b.rotation.z = 0.2; }
    for (const z of [-5.2, 0, 5.2]) m(G.cyl, M(0x8a6a44), 0.08, 3.5, 0.08, -0.35, 1.75, z, g);
    return g;
  },
  lanterns() { // a string of lanterns across an Old Town alley
    const g = new THREE.Group(), glow = M(0xffd27a, { emissive: 0xcc8a22 });
    for (let k = 0; k <= 10; k++) {
      const x = -5 + k, y = 6.0 - Math.sin(k / 10 * Math.PI) * 0.8;
      m(G.box, M(0x2a2018), 1.02, 0.03, 0.03, x, y, 0, g).rotation.z = -Math.cos(k / 10 * Math.PI) * 0.25;
      if (k % 2) { m(G.box, M(0x5a3a22), 0.3, 0.06, 0.3, x, y - 0.25, 0, g); m(G.box, glow, 0.24, 0.36, 0.24, x, y - 0.48, 0, g); }
    }
    return g;
  },
  cartProp() { return OBST.cart().g; },
  zebra() { const g = new THREE.Group(); for (let k = 0; k < 7; k++) m(G.box, M(0xf6f3e6), 0.6, 0.02, 3, -3 + k, 0.012, 0, g); return g; },
};
function gantry(g, z, name) {
  const steel = M(0x8d99a6);
  m(G.cyl, steel, 0.24, 6.8, 0.24, -4.7, 3.4, z, g); m(G.cyl, steel, 0.24, 6.8, 0.24, 4.7, 3.4, z, g);
  const tex = cached('g' + name, () => canvasTex(512, 112, (x, W, H) => {
    x.fillStyle = '#0b6b3a'; x.fillRect(0, 0, W, H); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(7, 7, W - 14, H - 14);
    label(x, 'KARIBU', W / 2, 28, 20, '#ffc21a', 300); label(x, name, W / 2, 70, 46, '#ffffff', W - 50);
  }));
  const gm = M(0x0b6b3a), board = new THREE.Mesh(G.box, [gm, gm, gm, gm, cached('gm' + name, () => Lam({ map: tex })), gm]);
  board.scale.set(9.6, 2.0, 0.16); board.position.set(0, 6.2, z); board.castShadow = true; g.add(board);
}
function stoneTex() {
  return cached('stone', () => canvasTex(256, 256, (x, W, H) => {
    x.fillStyle = '#dda45c'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) { x.fillStyle = ['rgba(120,70,20,.16)', 'rgba(255,230,170,.2)', 'rgba(90,50,20,.1)'][i % 3]; x.fillRect(Math.random() * W, Math.random() * H, 8 + Math.random() * 34, 5 + Math.random() * 16); }
    x.fillStyle = 'rgba(70,40,15,.25)'; x.fillRect(0, H - 40, W, 40);
  }));
}
function flagTex() {
  return cached('flag', () => canvasTex(96, 64, (x, W, H) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, 20); x.fillStyle = '#fff'; x.fillRect(0, 19, W, 26); x.fillStyle = '#c8102e'; x.fillRect(0, 22, W, 20); x.fillStyle = '#0b6b3a'; x.fillRect(0, 45, W, 19);
    x.fillStyle = '#c8102e'; x.beginPath(); x.ellipse(W / 2, H / 2, 9, 17, 0, 0, 7); x.fill(); x.fillStyle = '#000'; x.fillRect(W / 2 - 8, 16, 3, 32); x.fillRect(W / 2 + 5, 16, 3, 32); x.fillStyle = '#fff'; x.fillRect(W / 2 - 1.5, 22, 3, 20);
  }));
}
function ground(g, color, w, x, map) { // a slab of land beside the road
  const s = m(G.box, map ? cached('gmap' + color, () => Lam({ color, map })) : M(color), w, 0.3, CHUNK, x, -0.14, 0, g); s.castShadow = false; return s;
}

// Street-level details make the neighbourhood readable from the chase camera.
function streetSign(text, subtitle, color = PAL.blue) {
  return inst('street-sign:' + text, () => {
    const g = new THREE.Group();
    const tex = canvasTex(512, 192, (x, w, h) => {
      x.fillStyle = hex(color); x.fillRect(0, 0, w, h);
      x.strokeStyle = '#fff1cc'; x.lineWidth = 8; x.strokeRect(10, 10, w - 20, h - 20);
      label(x, text, w / 2, 78, 54, '#fff1cc', w - 40);
      label(x, subtitle, w / 2, 142, 26, '#fff1cc', w - 40);
    });
    m(G.box, M(PAL.wood), 0.12, 3.5, 0.12, 0, 1.75, 0, g);
    m(G.plane, Lam({map: tex, side: THREE.DoubleSide}), 2.8, 1.05, 1, 0, 3.1, 0, g);
    return g;
  });
}
function neighbourhoodStall(v) {
  return inst('neighbourhood-stall:' + v, () => {
    const g = new THREE.Group(), color = [PAL.sea, PAL.coral, PAL.pink][v % 3];
    // A striped canvas canopy, wooden counter and visible produce baskets.
    for (const z of [-1.6, 1.6]) m(G.cyl, M(PAL.wood), .09, 2.8, .09, 0, 1.4, z, g);
    for (let k = 0; k < 8; k++) {
      const roof = m(G.box, M(k % 2 ? PAL.white : color), 2.5, .08, .42, -.65, 2.7, -1.47 + k * .42, g);
      roof.rotation.z = -.12;
      m(G.box, M(k % 2 ? PAL.white : color), .08, .35, .42, -1.88, 2.5, -1.47 + k * .42, g);
    }
    m(G.box, M(PAL.wood), 1.15, .85, 3.2, -.25, .55, 0, g);
    for (let j = 0; j < 3; j++) {
      m(G.cyl, M(0xb88647), .68, .22, .68, -.35, 1.08, -1 + j, g);
      for (let k = 0; k < 5; k++) m(G.sph, M([0x69a534, 0xffb52e, 0xe65d38][j]), .23, .25, .23, -.35 + Math.sin(k * 2.4) * .2, 1.25, -1 + j + Math.cos(k * 2.4) * .2, g);
    }
    return g;
  });
}
function bunting(g, variant) {
  // built once per colour set and merged into one mesh, so a line of flags costs a single draw call
  const v = variant % 3;
  put(g, inst('bunting' + v, () => {
    const b = new THREE.Group();
    for (let j = 0; j < 13; j++) {
      const x = -6 + j, y = 6.8 - Math.sin(j / 12 * Math.PI) * 1.2;
      m(G.box, M(PAL.wood), 1.05, .025, .025, x, y, 0, b).rotation.z = -Math.cos(j / 12 * Math.PI) * .3;
      m(G.cone, M(BRIGHT[(j + v) % BRIGHT.length]), .42, .62, .035, x, y - .3, 0, b).rotation.z = Math.PI;
    }
    return b;
  }), 0, 0, -3);
}

// ---------- Season 1 streets: Digo Road, Mwembe Tayari, Kilindini Port, Nyali Centre ----------
const CONTAINER_COLS = [0xc8102e, 0x1546b8, 0x2f9e44, 0xe98a4b, 0x7b3fb3, 0xd9a830, 0x12808c, 0x8a8f96];
function corrugTex() {
  return cached('corrug', () => {
    const t = canvasTex(128, 128, (x, W, H) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
      for (let k = 0; k < 16; k++) { x.fillStyle = k % 2 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.4)'; x.fillRect(k * 8, 0, 4, H); }
      x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, 0, W, 6); x.fillRect(0, H - 6, W, 6);
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(W / 2 - 1, 8, 2, H - 16);
    });
    return t;
  });
}
const CONTAINER_MAT = () => cached('contMat', () => Lam({ map: corrugTex(), vertexColors: true }));
// several containers merged into one mesh: [x, y, z, color] centres, each 2.44 wide, 2.6 tall, 6 long
function containerMesh(list) {
  const parts = list.map(([x, y, z, c]) => tinted(new THREE.BoxGeometry(2.44, 2.6, 6).translate(x, y + 1.3, z), c));
  const mesh = new THREE.Mesh(mergeGeometries(parts), CONTAINER_MAT());
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
export function makeTuktuk(v = 0) { return obstacleMeta('tuktuk', v % 4).tpl.clone(); }
export function makeRideToken() { // a little tuk-tuk spinning in a ring: hop on the back of one
  const g = new THREE.Group(), t = makeTuktuk(0); t.scale.setScalar(0.34); t.position.y = -0.35; g.add(t); g.add(halo(0xffc21a)); return g;
}
export function makeCraneLoad() { // a container swinging from a crane cable; the obstacle moves it across the lanes
  const g = new THREE.Group(); g.name = 'load';
  const c = containerMesh([[0, 0.25, 0, CONTAINER_COLS[1]]]); c.scale.set(0.9, 0.9, 0.42); g.add(c);
  m(G.box, M(0x2a2d33), 0.05, 7, 0.05, 0, 6.2, 0, g);
  m(G.box, M(0xffc21a), 2.4, 0.18, 0.4, 0, 2.75, 0, g);
  return g;
}
Object.assign(OBST, {
  container(v) { // a parked container on a trailer: climb it from a ramp, or dodge it
    const g = new THREE.Group();
    g.add(containerMesh([[0, 0, 0, CONTAINER_COLS[v % CONTAINER_COLS.length]]]));
    m(G.box, M(0x2a2d33), 2.2, 0.2, 6, 0, -0.05, 0, g);
    return { g, kind: 'block', half: 3.0, top: 2.6 };
  },
  boda(v) { // a bodaboda with its rider, built facing -z; the game turns it to cut across the road
    const g = new THREE.Group(), col = M([0xc8102e, 0x1546b8, 0x17191d, 0x2f9e44][v % 4]);
    for (const z of [-0.68, 0.68]) { m(G.cyl, TYRE, 0.62, 0.14, 0.62, 0, 0.31, z, g).rotation.z = Math.PI / 2; m(G.cyl, HUB, 0.3, 0.16, 0.3, 0, 0.31, z, g).rotation.z = Math.PI / 2; }
    R(col, 0.34, 0.34, 0.9, 0.1, 0, 0.62, -0.1, g); R(M(0x17191d), 0.3, 0.12, 0.7, 0.05, 0, 0.82, 0.25, g);
    m(G.box, M(0x9aa0a6), 0.06, 0.6, 0.06, 0, 0.75, -0.62, g).rotation.x = 0.3;
    m(G.box, M(0x17191d), 0.7, 0.05, 0.05, 0, 1.05, -0.72, g);
    m(G.sph, M(0xfffbe0, { emissive: 0xbbbb88 }), 0.16, 0.16, 0.1, 0, 0.9, -0.82, g);
    m(G.box, M(0x9aa0a6), 0.08, 0.08, 0.5, 0.18, 0.4, 0.45, g);
    return { g, kind: 'block', half: 0.5 };
  },
  crane() { // Kilindini gantry crane spanning the road; its swinging load is added by the game
    const g = new THREE.Group(), y = M(0xffc21a), red = M(0xc8102e);
    for (const x of [-5.6, 5.6]) for (const z of [-1.6, 1.6]) m(G.box, y, 0.45, 9.5, 0.45, x, 4.75, z, g);
    for (const z of [-1.6, 1.6]) m(G.box, y, 12, 0.6, 0.5, 0, 9.4, z, g);
    for (const x of [-5.6, 5.6]) m(G.box, red, 0.5, 0.5, 3.6, x, 0.25, 0, g);
    m(G.box, M(0x2a2d33), 1.6, 0.8, 3.6, 0, 9.0, 0, g);
    return { g, kind: 'block', half: 1.3 };
  },
});
Object.assign(MODEL, {
  powerLines() { // Digo Road: wooden poles and sagging wires across the street
    const g = new THREE.Group(), wood = M(0x6b4f33), wire = M(0x1b1d22);
    for (const x of [-5.6, 5.6]) { m(G.cyl, wood, 0.22, 8.5, 0.22, x, 4.25, 0, g); m(G.box, wood, 1.6, 0.12, 0.12, x, 8.1, 0, g); }
    m(G.box, M(0x8d99a6), 0.6, 0.8, 0.5, 5.6, 6.6, 0.3, g);
    for (const dx of [-0.6, 0, 0.6]) for (let k = 0; k < 8; k++) {
      const x0 = -5.6 + k * 1.4, sag = t => 8.2 - Math.sin(t * Math.PI) * 0.9;
      const a = sag(k / 8), b = sag((k + 1) / 8), s = m(G.box, wire, 1.42, 0.03, 0.03, x0 + 0.7, (a + b) / 2, dx, g);
      s.rotation.z = Math.atan2(b - a, 1.4); s.castShadow = false;
    }
    return g;
  },
  mitumba(v) { // second-hand clothes on a rail: Digo Road sidewalks
    const g = new THREE.Group(), steel = M(0x8d99a6);
    for (const z of [-1.1, 1.1]) m(G.box, steel, 0.06, 1.9, 0.06, 0, 0.95, z, g);
    m(G.box, steel, 0.05, 0.05, 2.3, 0, 1.85, 0, g);
    for (let k = 0; k < 7; k++) m(G.box, M(BRIGHT[(k + v * 3) % BRIGHT.length]), 0.12, 0.85, 0.26, 0, 1.38, -0.95 + k * 0.32, g);
    m(G.box, M(0x9a6a3a), 0.7, 0.5, 0.9, 0.4, 0.25, 0.6, g);
    return g;
  },
  stageSign() { // Mwembe Tayari: destinations board on two posts
    const g = new THREE.Group(), tex = cached('stageTex', () => canvasTex(512, 160, (x, W, H) => {
      x.fillStyle = '#0b6b3a'; x.fillRect(0, 0, W, H); x.strokeStyle = '#ffc21a'; x.lineWidth = 8; x.strokeRect(6, 6, W - 12, H - 12);
      label(x, 'MWEMBE TAYARI STAGE', W / 2, 40, 40, '#ffffff', W - 40);
      label(x, 'NAIROBI • MALINDI • LIKONI • KILIFI', W / 2, 104, 30, '#ffc21a', W - 40);
    }));
    for (const z of [-1.7, 1.7]) m(G.cyl, M(0x8d99a6), 0.14, 4.4, 0.14, 0, 2.2, z, g);
    const b = new THREE.Mesh(G.plane, Lam({ map: tex, side: THREE.DoubleSide })); b.scale.set(4, 1.25, 1); b.rotation.y = -Math.PI / 2; b.position.y = 3.6; g.add(b);
    return g;
  },
  stageShelter() { // long shade roof over the boarding bays
    const g = new THREE.Group(), steel = M(0x5f6b78);
    for (const z of [-5, 0, 5]) m(G.box, steel, 0.14, 3.2, 0.14, 1.2, 1.6, z, g);
    const roof = m(G.box, M(0x1546b8), 3.4, 0.12, CHUNK - 0.4, 1.0, 3.25, 0, g); roof.rotation.z = -0.1;
    m(G.box, M(0x9a6a3a), 0.5, 0.45, CHUNK - 3, 1.9, 0.45, 0, g);
    return g;
  },
  containerWall(v) { // stacked containers behind the quay fence, one merged mesh
    const list = [];
    for (let row = 0; row < 2; row++) for (let k = 0; k < 2; k++) {
      const h = 1 + ((v + row * 3 + k * 5) % 3);
      for (let s = 0; s < h; s++) list.push([row * 2.6, s * 2.6, -3 + k * 6.05, CONTAINER_COLS[(v * 7 + row * 3 + k * 2 + s * 5) % CONTAINER_COLS.length]]);
    }
    const g = new THREE.Group(); g.add(containerMesh(list)); return g;
  },
  portFence() {
    const g = new THREE.Group(), steel = M(0x9aa0a6);
    for (let k = 0; k < 4; k++) m(G.box, steel, 0.08, 2.2, 0.08, 0, 1.1, -CHUNK / 2 + 1.5 + k * 3, g);
    m(G.box, steel, 0.05, 0.05, CHUNK, 0, 2.15, 0, g); m(G.box, steel, 0.05, 0.05, CHUNK, 0, 1.0, 0, g);
    m(G.box, M(0xc8102e), 0.04, 0.3, CHUNK, 0, 0.15, 0, g);
    return g;
  },
  floodLight() {
    const g = new THREE.Group();
    m(G.cyl, M(0x8d99a6), 0.25, 14, 0.25, 0, 7, 0, g);
    m(G.box, M(0x5f6b78), 1.6, 0.6, 0.4, 0, 14, 0, g); m(G.box, M(0xfff3b0, { emissive: 0xaaa060 }), 1.4, 0.4, 0.1, 0, 14, -0.22, g);
    return g;
  },
  ship() { // cargo ship berthed at Kilindini, piled with containers
    const g = new THREE.Group();
    R(M(0x1b2433), 14, 6, 60, 0.8, 0, 1.5, 0, g); m(G.box, M(0xc8102e), 14.2, 1.2, 60.2, 0, -1.0, 0, g);
    R(M(0xfbfaf5), 10, 8, 8, 0.4, 0, 8.5, 22, g); m(G.box, M(0x24384f), 10.1, 1.2, 8.1, 0, 10.5, 22, g);
    const list = [];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) for (let s = 0; s < 1 + ((r + k) % 3); s++) list.push([-4.5 + r * 3, 4.5 + s * 2.6, -22 + k * 6.6, CONTAINER_COLS[(r * 5 + k * 3 + s) % CONTAINER_COLS.length]]);
    g.add(containerMesh(list));
    return g;
  },
  mallPylon() { // the big NYALI CENTRE sign at the car park entrance
    const g = new THREE.Group(), tex = cached('pylonTex', () => canvasTex(160, 512, (x, W, H) => {
      x.fillStyle = '#12b5b0'; x.fillRect(0, 0, W, H); x.fillStyle = '#ffffff'; x.fillRect(10, 10, W - 20, H - 20);
      x.save(); x.translate(W / 2, H / 2); x.rotate(-Math.PI / 2); label(x, 'NYALI CENTRE', 0, -14, 52, '#1546b8', H - 60); label(x, 'SHOPS • CINEMA • FOOD', 0, 34, 24, '#d81e5b', H - 60); x.restore();
    }));
    const s = new THREE.Mesh(G.box, Lam({ map: tex })); s.scale.set(0.5, 8, 2.4); s.position.y = 4.6; s.castShadow = true; g.add(s);
    m(G.box, M(0xcfd6dc), 1.2, 0.6, 3.0, 0, 0.3, 0, g);
    return g;
  },
  car(v) { // parked saloon car
    const g = new THREE.Group(), col = M([0xfbfaf5, 0xc8102e, 0x1b2433, 0x8d99a6, 0x1546b8][v % 5]);
    R(col, 1.7, 0.6, 4.0, 0.18, 0, 0.6, 0, g); R(col, 1.5, 0.55, 2.2, 0.2, 0, 1.12, 0.1, g);
    m(G.box, M(0x24384f), 1.52, 0.4, 1.9, 0, 1.14, 0.1, g);
    for (const z of [-1.3, 1.3]) { wheel(g, -0.8, 0.33, z, 0.33); wheel(g, 0.8, 0.33, z, 0.33); }
    return g;
  },
});

// One 12 m slice of street.  side -1 is the left of the road, +1 the right.
export function buildChunk(i, zone, info, rnd) {
  const g = new THREE.Group(), ri = n => Math.floor(rnd() * n), zc = info.zoneChunk;
  const person = (x, z, side) => {
    if (!hooks.bystander) return;
    const p = put(g, hooks.bystander(rnd), x, 0.16, z, -side * Math.PI / 2 + (rnd() - 0.5) * 0.9);
    p.userData.streetPerson = true; p.userData.phase = rnd() * Math.PI * 2;
  };
  const vehicle = (type, x, z, ry) => put(g, obstacleMeta(type, ri(4)).tpl.clone(), x, 0, z, ry);
  if (['MARIKITI', 'MJI WA KALE', 'LIKONI FERRY'].includes(zone.name) && zc % 3 === 0) bunting(g, i);
  if (zone.name === 'MJI WA KALE' && zc % 3 === 1) put(g, inst('lanterns', MODEL.lanterns), 0, 0, 2);
  if (i === 1) put(g, streetSign('LIKONI FERRY', 'MOMBASA • KARIBU PWANI'), 5.1, 0, 1, -.25);
  if (info.first && i > 0) { gantry(g, CHUNK / 2 - 0.5, zone.label || zone.name); put(g, inst('zebra', MODEL.zebra), 0, 0, CHUNK / 2 - 3); }
  if (zone.name === 'MOI AVENUE' && zc % 12 === 1) put(g, inst('tusks', MODEL.tusks), 0, 0, 0);
  if (zone.name === 'DIGO ROAD' && i % 2 === 0) put(g, inst('powerLines', MODEL.powerLines), 0, 0, -2);
  if (zone.name === 'KILINDINI PORT' && zc % 5 === 3) put(g, inst('craneScene', () => OBST.crane().g), 0, 0, 0);
  for (const side of [-1, 1]) {
    const kind = side < 0 ? zone.L : zone.R, X = v => side * v, face = side > 0 ? 0 : Math.PI;
    const palm = (x, z) => put(g, inst('palm' + ri(4), () => MODEL.palm(ri(4))), X(x), 0, z, rnd() * 6);
    const dhow = (lo, span) => put(g, inst('dhow' + ri(3), () => MODEL.dhow(ri(3))), X(lo + rnd() * span), -1.05, rnd() * 10 - 5, (rnd() - 0.5) * 1.2);
    const lamp = x => put(g, inst('lamp', MODEL.lamp), X(x), 0, 0, face);
    const palmRow = x => palm(x + rnd() * 0.4, (i % 2 ? 3.2 : -3.2) * side + (rnd() - 0.5)); // palms lining the coast roads
    if (kind === 'bridge') { // Nyali Bridge: a concrete deck over the creek, oncoming carriageway on the left
      put(g, inst('deckEdge', MODEL.deckEdge), X(4), 0, 0, face);
      if (i % 2 === 0) lamp(5.25);
      if (side < 0) {
        put(g, inst('carriageway', MODEL.carriageway), 0, 0, 0);
        if (rnd() < 0.55) vehicle(rnd() < 0.6 ? 'tuktuk' : 'matatu', -11.2 - ri(2) * 3.4, rnd() * 6 - 3, Math.PI);
        if (i % 2 === 0) put(g, inst('lamp', MODEL.lamp), -17.2, 0, 0, 0);
      }
      if (rnd() < 0.5) dhow(side < 0 ? 24 : 14, 40);
      continue;
    }
    if (kind === 'beach' || kind === 'palms') {
      const w = kind === 'beach' ? 10 : 60;
      ground(g, PAL.sand, w, X(4 + w / 2));
      palmRow(4.9);
      const n = kind === 'beach' ? (rnd() < 0.5 ? 1 : 0) : 1 + ri(2);
      for (let k = 0; k < n; k++) palm(6.5 + rnd() * (kind === 'beach' ? 6 : 16), rnd() * 10 - 5);
      if (kind === 'beach') {
        if (zc % 4 === 1) put(g, inst('camel', MODEL.camel), X(8 + rnd() * 3), 0, rnd() * 6 - 3, rnd() * 6);
        if (rnd() < 0.6) dhow(20, 40);
        if (rnd() < 0.5) person(X(5.6 + rnd() * 2), rnd() * 8 - 4, side);
      } else {
        if (zc % 3 === 1) put(g, inst('hut', MODEL.hut), X(11 + rnd() * 4), 0, 0);
        if (zc % 3 === 2) { const b = building(zc % 2 ? 'tower' : 'balcony', 5, i % 3); put(g, b.obj, X(26), 0, 0, face); }
      }
      continue;
    }
    if (kind === 'port') { // Kilindini: concrete quay, fence, container stacks; the harbour and a ship on the left
      ground(g, 0xbfc3c8, side < 0 ? 12 : 60, X(4 + (side < 0 ? 6 : 30)));
      put(g, inst('portFence', MODEL.portFence), X(4.7), 0, 0);
      const v = (i * 3 + (side > 0 ? 1 : 0)) % 6;
      put(g, inst('cwall' + v, () => MODEL.containerWall(v)), X(7.2), 0, 0, face);
      if (side > 0) put(g, inst('cwall' + ((v + 2) % 6), () => MODEL.containerWall((v + 2) % 6)), X(13.5), 0, 0, face);
      else { m(G.box, M(0xffc21a), 0.4, 0.32, CHUNK, X(15.9), 0.02, 0, g); if (zc % 6 === 2) put(g, inst('ship', MODEL.ship), X(30), -1.4, 0); }
      if (i % 3 === 0) put(g, inst('floodLight', MODEL.floodLight), X(5.4), 0, 3, face);
      if (rnd() < 0.35) person(X(5.4), rnd() * 8 - 4, side);
      continue;
    }
    const sw = kind === 'old' ? 1.1 : kind === 'mall' ? 3.2 : 2;
    const walk = m(G.box, cached('walk', () => Lam({ map: paveTex() })), sw, 0.16, CHUNK, X(4 + sw / 2), 0.08, 0, g); walk.castShadow = false;
    if (kind === 'stage') { // Mwembe Tayari: shelters over the boarding bays, matatus parked in the lot
      ground(g, 0x8d8a84, 40, X(4 + sw + 20));
      put(g, inst('stageShelter', MODEL.stageShelter), X(4.2), 0.16, 0, face);
      for (const [dx, dz] of [[8.4, -3.2], [8.4, 3.2], [11.2, 0]]) if (rnd() < 0.8) vehicle('matatu', X(dx), dz, rnd() < 0.5 ? 0 : Math.PI);
      if (zc % 5 === 1) put(g, inst('stageSign', MODEL.stageSign), X(6.6), 0, 4, face);
      if (zc % 2 === 0) { const b = building('cbd', 3 + ri(2), ri(3)); put(g, b.obj, X(14 + BD / 2), 0, 0, face); }
      for (let k = 0, n = 1 + ri(3); k < n; k++) person(X(4.5 + rnd() * 1.2), rnd() * 10 - 5, side); // touts calling out destinations
      continue;
    }
    if (kind === 'mall') { // Nyali Centre: wide palm-lined walk, car park, the mall set back behind it
      ground(g, PAL.pave, 50, X(4 + sw + 25));
      palm(6.7, (i % 2 ? 3 : -3) * side);
      if (i % 2 === 0) lamp(4.7);
      [-3.6, 0, 3.6].forEach((dz, k) => { if (rnd() < 0.6) { const cv = (i + k) % 5; put(g, inst('car' + cv, () => MODEL.car(cv)), X(9.4), 0, dz, -side * Math.PI / 2); } });
      if (zc % 6 === 2) put(g, inst('mallPylon', MODEL.mallPylon), X(7.6), 0, -4, face);
      const b = building('mall', 2, (i + (side > 0 ? 1 : 0)) % 3); put(g, b.obj, X(12 + BD / 2), 0, 0, face);
      for (let k = 0, n = ri(3); k < n; k++) person(X(4.6 + rnd() * 2.2), rnd() * 10 - 5, side);
      continue;
    }
    if (kind === 'sea') { // seafront: railing, palms and dhows on the Indian Ocean
      put(g, inst('railing', MODEL.railing), X(5.9), 0.16, 0);
      if (i % 2 === 0) lamp(5.6);
      if (zone.name === 'LIKONI FERRY' && zc === 2) put(g, inst('ferry', MODEL.ferry), X(15), -1.0, 0, face);
      else if (rnd() < 0.6) dhow(16, 50);
      palmRow(5.25);
      if (rnd() < 0.3) put(g, inst('bench', MODEL.bench), X(5.4), 0.16, rnd() * 6 - 3, face);
      if (rnd() < 0.7) person(X(4.8), rnd() * 8 - 4, side);
      continue;
    }
    ground(g, kind === 'market' ? 0xd6b98a : PAL.pave, 50, X(4 + sw + 25));
    if (kind === 'fort') { // Fort Jesus: high coral-stone ramparts
      const stone = cached('stoneM', () => Lam({ map: stoneTex() }));
      const tower = zc % 5 === 2, h = tower ? 14 : 10;
      m(G.box, stone, tower ? 9 : 6, h, CHUNK + 0.1, X(tower ? 10.5 : 10), h / 2, 0, g);
      m(G.box, stone, 1.2, 1.4, CHUNK + 0.1, X(7.3), 0.7, 0, g); // sloping plinth at the foot of the wall
      for (let k = 0; k < 4; k++) m(G.box, stone, tower ? 9.2 : 6.2, 1.1, 1.5, X(tower ? 10.5 : 10), h + 0.55, -4.5 + k * 3, g);
      if (tower) {
        m(G.cyl, M(0x444444), 0.1, 4, 0.1, X(8), h + 2.9, 0, g);
        const flag = new THREE.Mesh(G.plane, cached('flagM', () => Lam({ map: flagTex(), side: THREE.DoubleSide })));
        flag.scale.set(2.4, 1.6, 1); flag.position.set(X(8) + 1.2, h + 4.1, 0); g.add(flag);
      }
      palmRow(5.3);
      if (rnd() < 0.6) person(X(4.8), rnd() * 8 - 4, side);
      continue;
    }
    // streets with buildings: city, market, old town
    const x0 = 4 + sw + 0.2, r = rnd();
    if (kind === 'old' && zc % 6 === 3 && side > 0) put(g, inst('mosque', MODEL.mosque), x0, 0, 0);
    else {
      const style = kind === 'old' ? (r < 0.45 ? 'coral' : 'old')
        : kind === 'market' ? (r < 0.25 ? 'old' : 'pastel')
          : zone.name === 'DIGO ROAD' ? (r < 0.35 ? 'pastel' : r < 0.7 ? 'cbd' : r < 0.85 ? 'old' : 'balcony')
          : zone.name === 'MOI AVENUE' ? (r < 0.14 ? 'tower' : r < 0.38 ? 'old' : r < 0.6 ? 'pastel' : r < 0.82 ? 'cbd' : 'balcony')
            : r < 0.05 ? 'tower' : r < 0.55 ? 'cbd' : 'balcony';
      const floors = style === 'tower' ? 6 + ri(4) : zone.name === 'DIGO ROAD' ? 3 + ri(2) : isOld(style) ? 2 + ri(2) : 2 + ri(3);
      const b = building(style, floors, ri(3));
      put(g, b.obj, X(x0 + BD / 2 + (kind === 'market' ? 1.2 : 0) + (style === 'tower' ? 1.4 : 0)), 0, 0, face);
    }
    if (kind === 'market') { // Marikiti: awnings, umbrellas, stalls and parked fruit carts
      put(g, inst('tarp' + (i % 4), () => MODEL.tarp(i % 4)), X(4.6), 0, 0, face);
      const both = rnd() < 0.6;
      for (const z of both ? [-3, 3] : [-3]) { put(g, inst('stall' + ri(6), () => MODEL.stall(ri(8))), X(5.2), 0, z, face + Math.PI); person(X(6.15), z, side); }
      if (!both) put(g, inst('cartProp', MODEL.cartProp), X(5.1), 0.16, 3.2, face + Math.PI / 2);
      continue;
    }
    if (i % 3 === 0 && kind === 'city') lamp(5.7);
    const stall = zc % 2 === 0 && kind !== 'old'; // a stall takes the sidewalk, so no other props beside it
    if (zone.name === 'MOI AVENUE') palm(5.35, side > 0 ? 4.2 : 3.6);
    if (kind === 'city' && !stall) {
      const p = rnd();
      if (p < 0.3) palm(5.4, rnd() * 8 - 4);
      else if (p < 0.42) put(g, inst('stage', MODEL.stage), X(5.3), 0.16, 2, face);
      else if (p < 0.55) put(g, inst('bin', MODEL.bin), X(5.6), 0.16, rnd() * 8 - 4);
      else if (p < 0.65) put(g, inst('bench', MODEL.bench), X(5.5), 0.16, rnd() * 6 - 3, face);
    }
    if (stall) {
      put(g, neighbourhoodStall(i % 3), X(5.6), .16, -2, face).scale.setScalar(0.9); // clear of the shop fronts at x 6.2
      person(X(5.95), -2, side);
    }
    if (zc % 4 === 1) {
      const names = kind === 'old' ? ['MJI WA KALE', 'OLD TOWN • MOMBASA'] : kind === 'city' && zone.name === 'LIKONI FERRY' ? ['MAMA FATUMA', 'MAHAMRI • CHAI • MADAFU'] : ['MOMBASA RAHA', 'KARIBU PWANI'];
      put(g, streetSign(...names, i % 2 ? PAL.sea : PAL.blue), X(5.4), 0, 4, -side * .35);
    }
    if (zone.name === 'DIGO ROAD') { // mitumba racks and hawkers crowd the Digo Road sidewalks
      if (rnd() < 0.55) put(g, inst('mitumba' + (i % 3), () => MODEL.mitumba(i % 3)), X(5.3), 0.16, rnd() * 6 - 3, face);
      person(X(4.6), rnd() * 8 - 4, side);
    }
    const n = Math.floor(rnd() * 2.2);
    for (let k = 0; k < n; k++) person(X(4.4 + rnd() * (sw - 0.6)), rnd() * 10 - 5, side);
  }
  return g;
}
