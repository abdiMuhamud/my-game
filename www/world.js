// Mombasa's streets: buildings, vehicles, props and textures, all generated in code.
// Static models are built once, merged into a single vertex-coloured mesh and then instanced.
import * as THREE from 'three';

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
  sph: new THREE.SphereGeometry(0.5, 14, 10),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
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

// merge every plain-coloured mesh of a model into one; textured and two-sided parts stay as they are
const BAKED = Lam({ vertexColors: true });
export function bakeGroup(group) {
  group.updateMatrixWorld(true);
  const pos = [], nor = [], col = [], out = new THREE.Group();
  group.traverse(o => {
    if (!o.isMesh) return;
    const mat = o.material;
    if (Array.isArray(mat) || mat.map || mat.side !== THREE.FrontSide || mat.isMeshBasicMaterial) {
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
    const wall = { cbd: '#fbfaf5', balcony: '#ffffff', old: '#f1e6cf', pastel: PASTEL[v % 4] }[style];
    x.fillStyle = wall; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) { x.fillStyle = `rgba(120,100,70,${0.02 + Math.random() * 0.04})`; x.fillRect(Math.random() * W, Math.random() * H, 6 + Math.random() * 30, 30 + Math.random() * 120); }
    x.fillStyle = style === 'old' ? '#8a5a33' : style === 'pastel' ? '#ffffff' : blue; x.fillRect(0, 0, W, top - 8);
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
        } else if (style === 'old') {
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
    if (style === 'old') {
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
// A whole building as one template.  Its street face is at local x = -D/2 (the right-hand side of the road).
const BW = 11, BD = 9;
function building(style, floors, v) {
  const h = 1.6 + floors * 3.1;
  return {
    h, obj: inst(`b${style}${floors}${v}`, () => {
      const g = new THREE.Group(), fx = -BD / 2, fh = 3.1;
      const side = Lam({ map: facade(style, floors, v) }), roof = M(style === 'tower' ? 0xdfe5ea : 0xcfc9ba);
      const b = new THREE.Mesh(G.box, [side, side, roof, roof, side, side]); b.scale.set(BD, h, BW); b.position.y = h / 2; b.castShadow = b.receiveShadow = true; g.add(b);
      const blue = M(PAL.blue), white = M(0xfbfaf5), awn = style === 'pastel' ? M(BRIGHT[(v * 3) % BRIGHT.length]) : blue;
      // parapet and rooftop clutter
      const cap = M(style === 'old' ? 0x8a5a33 : style === 'tower' ? 0xeef2f5 : style === 'pastel' ? 0xffffff : PAL.blue);
      m(G.box, cap, BD + 0.3, 0.35, 0.3, 0, h + 0.17, BW / 2, g); m(G.box, cap, BD + 0.3, 0.35, 0.3, 0, h + 0.17, -BW / 2, g);
      m(G.box, cap, 0.3, 0.35, BW + 0.3, fx, h + 0.17, 0, g); m(G.box, cap, 0.3, 0.35, BW + 0.3, -fx, h + 0.17, 0, g);
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
      if (style === 'old') { // carved wooden balcony and lanterns
        const y = 1.6 + (floors - 1) * fh + 0.4, wood = M(0x6b4423), dark = M(0x4a2e18);
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
const GOLD = Lam({ color: 0xffc21a, emissive: 0x8a5a00 }), GOLD2 = Lam({ color: 0xffe07a, emissive: 0x8a6a10 });
export function makeCoin() {
  const g = new THREE.Group(), c = new THREE.Mesh(G.coin, GOLD); c.rotation.x = Math.PI / 2; g.add(c);
  g.add(new THREE.Mesh(G.ring, GOLD2));
  const i = new THREE.Mesh(G.coin, GOLD2); i.rotation.x = Math.PI / 2; i.scale.set(0.55, 1.3, 0.55); g.add(i);
  return g;
}
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
    const g = new THREE.Group(), side = Lam({ map: matatuTex(v % 3, false) }), rear = Lam({ map: matatuTex(v % 3, true) });
    const body = new THREE.Mesh(G.box, [side, side, M(0xfbfaf5), M(0x222222), rear, rear]);
    body.scale.set(2.0, 1.9, 4.4); body.position.y = 1.3; body.castShadow = body.receiveShadow = true; g.add(body);
    R(M(0xfbfaf5), 1.9, 0.3, 4.3, 0.14, 0, 2.3, 0, g);                    // rounded roof
    m(G.box, M(0x22252b), 1.5, 0.08, 2.4, 0, 2.5, 0.4, g);                // roof rack and luggage
    R(M(0xe98a4b), 0.9, 0.4, 0.7, 0.1, -0.2, 2.74, 0.9, g); R(M(0x2f9e44), 0.7, 0.34, 0.9, 0.1, 0.25, 2.7, -0.1, g);
    R(M(0x22252b), 2.06, 0.22, 0.2, 0.06, 0, 0.5, 2.2, g);               // bumper
    for (const s of [-1, 1]) { m(G.box, M(0x22252b), 0.1, 0.22, 0.3, s * 1.06, 1.75, -1.7, g); R(M(0x22252b), 0.14, 0.34, 0.9, 0.06, s * 1.0, 0.58, 1.4, g); R(M(0x22252b), 0.14, 0.34, 0.9, 0.06, s * 1.0, 0.58, -1.4, g); }
    for (const z of [-1.4, 1.4]) { wheel(g, -0.95, 0.38, z, 0.38, 0.28); wheel(g, 0.95, 0.38, z, 0.38, 0.28); }
    return { g, kind: 'block', half: 2.3 };
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
export function buildObstacle(type, rnd) {
  const v = Math.floor(rnd() * 4), meta = cached('ob:' + type + v, () => { const o = OBST[type](v); return { tpl: bakeGroup(o.g), kind: o.kind, half: o.half }; });
  return { mesh: meta.tpl.clone(), kind: meta.kind, half: meta.half };
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
    const g = new THREE.Group(), mat = M(0xf7f4e8, { emissive: 0x3a3a34 });
    for (const s of [1, -1]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(s * 5.6, 0, 0), new THREE.Vector3(s * 5.6, 10.5, 0), new THREE.Vector3(s * -3.4, 10.6, 0));
      const N = 24, RS = 10, geo = new THREE.TubeGeometry(curve, N, 1, RS, false), pos = geo.attributes.position, p = new THREE.Vector3();
      for (let i = 0; i <= N; i++) {
        const c = curve.getPointAt(i / N), rad = 1.05 * Math.pow(1 - i / N, 0.8) + 0.1;
        for (let j = 0; j <= RS; j++) { const k = i * (RS + 1) + j; p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(rad).add(c); pos.setXYZ(k, p.x, p.y, p.z); }
      }
      geo.computeVertexNormals();
      for (const dz of [0, -2.6]) { m(geo, mat, 1, 1, 1, 0, 0, dz + (s > 0 ? 0 : -0.6), g); m(G.cyl, M(0xcfc9ba), 2.6, 0.5, 2.6, s * 5.6, 0.25, dz, g); }
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

// One 12 m slice of street.  side -1 is the left of the road, +1 the right.
export function buildChunk(i, zone, info, rnd) {
  const g = new THREE.Group(), ri = n => Math.floor(rnd() * n), zc = info.zoneChunk;
  const person = (x, z, side) => { if (hooks.bystander) put(g, hooks.bystander(rnd), x, 0.16, z, -side * Math.PI / 2 + (rnd() - 0.5) * 0.9 + (rnd() < 0.25 ? side * 1.3 : 0)); };
  if (info.first && i > 0) { gantry(g, CHUNK / 2 - 0.5, zone.name); put(g, inst('zebra', MODEL.zebra), 0, 0, CHUNK / 2 - 3); }
  if (zone.name === 'MOI AVENUE' && zc % 16 === 3) put(g, inst('tusks', MODEL.tusks), 0, 0, 0);
  for (const side of [-1, 1]) {
    const kind = side < 0 ? zone.L : zone.R, X = v => side * v, face = side > 0 ? 0 : Math.PI;
    const palm = (x, z) => put(g, inst('palm' + ri(4), () => MODEL.palm(ri(4))), X(x), 0, z, rnd() * 6);
    const dhow = (lo, span) => put(g, inst('dhow' + ri(3), () => MODEL.dhow(ri(3))), X(lo + rnd() * span), -1.05, rnd() * 10 - 5, (rnd() - 0.5) * 1.2);
    const lamp = x => put(g, inst('lamp', MODEL.lamp), X(x), 0, 0, face);
    if (kind === 'bridge') {
      m(G.box, M(PAL.pave), 0.9, 0.5, CHUNK, X(4.45), 0.0, 0, g);
      if (side > 0) m(G.box, M(0x9aa3ad), 9.8, 1.4, 1.6, 0, -0.85, 0, g);
      put(g, inst('railing', MODEL.railing), X(4.75), 0.25, 0);
      if (i % 2 === 0) { lamp(4.7); m(G.box, M(PAL.blue), 0.3, 7, 0.3, X(5.0), 2.5, 3, g); }
      if (rnd() < 0.5) dhow(14, 50);
      continue;
    }
    if (kind === 'beach' || kind === 'palms') {
      const w = kind === 'beach' ? 10 : 60;
      ground(g, PAL.sand, w, X(4 + w / 2));
      const n = kind === 'beach' ? 1 + (rnd() < 0.4) : 2 + ri(2);
      for (let k = 0; k < n; k++) palm(5.5 + rnd() * (kind === 'beach' ? 7 : 16), rnd() * 10 - 5);
      if (kind === 'beach') {
        if (zc % 4 === 1) put(g, inst('camel', MODEL.camel), X(8 + rnd() * 3), 0, rnd() * 6 - 3, rnd() * 6);
        if (rnd() < 0.6) dhow(20, 40);
        if (rnd() < 0.5) person(5 + rnd() * 2, rnd() * 8 - 4, side);
      } else {
        if (zc % 3 === 1) put(g, inst('hut', MODEL.hut), X(11 + rnd() * 4), 0, 0);
        if (zc % 3 === 2) { const b = building(zc % 2 ? 'tower' : 'balcony', 5, i % 3); put(g, b.obj, X(26), 0, 0, face); }
      }
      continue;
    }
    const sw = kind === 'old' ? 1.1 : 2;
    const walk = m(G.box, cached('walk', () => Lam({ map: paveTex() })), sw, 0.16, CHUNK, X(4 + sw / 2), 0.08, 0, g); walk.castShadow = false;
    if (kind === 'sea') {
      put(g, inst('railing', MODEL.railing), X(5.9), 0.16, 0);
      if (i % 2 === 0) lamp(5.6);
      if (zone.name === 'LIKONI FERRY' && zc === 2) put(g, inst('ferry', MODEL.ferry), X(15), -1.0, 0, face);
      else if (rnd() < 0.55) dhow(16, 50);
      if (rnd() < 0.4) palm(5.2, rnd() * 8 - 4);
      if (rnd() < 0.3) put(g, inst('bench', MODEL.bench), X(5.4), 0.16, rnd() * 6 - 3, face);
      if (rnd() < 0.5) person(4.9, rnd() * 8 - 4, side);
      continue;
    }
    ground(g, kind === 'market' ? 0xd6b98a : PAL.pave, 50, X(4 + sw + 25));
    if (kind === 'fort') {
      const stone = cached('stoneM', () => Lam({ map: stoneTex() }));
      const tower = zc % 5 === 2, h = tower ? 11 : 7.5;
      m(G.box, stone, tower ? 9 : 6, h, CHUNK + 0.1, X(tower ? 10.5 : 10), h / 2, 0, g);
      for (let k = 0; k < 4; k++) m(G.box, stone, tower ? 9.2 : 6.2, 0.9, 1.5, X(tower ? 10.5 : 10), h + 0.45, -4.5 + k * 3, g);
      if (tower) {
        m(G.cyl, M(0x444444), 0.1, 4, 0.1, X(8), h + 2.9, 0, g);
        const flag = new THREE.Mesh(G.plane, cached('flagM', () => Lam({ map: flagTex(), side: THREE.DoubleSide })));
        flag.scale.set(2.4, 1.6, 1); flag.position.set(X(8) + 1.2, h + 4.1, 0); g.add(flag);
      }
      if (rnd() < 0.5) palm(5.4, rnd() * 8 - 4);
      if (rnd() < 0.5) person(4.9, rnd() * 8 - 4, side);
      continue;
    }
    // streets with buildings: city, market, old town
    const x0 = 4 + sw + 0.2;
    if (kind === 'old' && zc % 6 === 3 && side > 0) put(g, inst('mosque', MODEL.mosque), x0, 0, 0);
    else {
      const modern = zone.name === 'MOI AVENUE' ? 0.45 : 0.2;
      const style = kind === 'old' ? 'old' : kind === 'market' ? 'pastel' : rnd() < modern ? 'tower' : rnd() < 0.55 ? 'cbd' : 'balcony';
      const floors = style === 'tower' ? 6 + ri(4) : kind === 'old' ? 2 + ri(2) : 2 + ri(3);
      const b = building(style, floors, ri(3));
      put(g, b.obj, X(x0 + BD / 2 + (kind === 'market' ? 1.2 : 0) + (style === 'tower' ? 1.4 : 0)), 0, 0, face);
    }
    if (kind === 'market') { for (const z of rnd() < 0.7 ? [-3, 3] : [-3]) { put(g, inst('stall' + ri(6), () => MODEL.stall(ri(8))), X(5.2), 0, z, face + Math.PI); person(6.15, z, side); } }
    else {
      if (i % 3 === 0 && kind === 'city') lamp(5.7);
      if (kind === 'city') {
        const r = rnd();
        if (r < 0.3) palm(5.4, rnd() * 8 - 4);
        else if (r < 0.42) put(g, inst('stage', MODEL.stage), X(5.3), 0.16, 2, face);
        else if (r < 0.55) put(g, inst('bin', MODEL.bin), X(5.6), 0.16, rnd() * 8 - 4);
        else if (r < 0.65) put(g, inst('bench', MODEL.bench), X(5.5), 0.16, rnd() * 6 - 3, face);
      }
      const n = Math.floor(rnd() * 2.6);
      for (let k = 0; k < n; k++) person(4.4 + rnd() * (sw - 0.6), rnd() * 10 - 5, side);
    }
  }
  return g;
}
