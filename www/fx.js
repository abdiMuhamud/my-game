// Premium polish: photographed skies that also light the scene, day / sunset / night moods, bloom and colour grading,
// a 2D overlay for speed lines, edge glow, confetti and flying coins, a flock of crows, and phone haptics.
import * as THREE from 'three';
import { EffectComposer } from './lib/postprocessing/EffectComposer.js';
import { RenderPass } from './lib/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './lib/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './lib/postprocessing/OutputPass.js';
import { ShaderPass } from './lib/postprocessing/ShaderPass.js';
import { RGBELoader } from './lib/loaders/RGBELoader.js';

// ---------- settings (graphics quality, volumes, vibration), kept on the phone ----------
export const Settings = { quality: 'high', music: 0.8, sfx: 1, vibrate: true };
try { Object.assign(Settings, JSON.parse(localStorage.getItem('mwizi.settings') || '{}')); } catch { /* defaults */ }
export const saveSettings = () => { try { localStorage.setItem('mwizi.settings', JSON.stringify(Settings)); } catch { /* not saved */ } };
export function haptic(p) { if (Settings.vibrate && navigator.vibrate) navigator.vibrate(p); }

// ---------- lighting moods ----------
// sky: Poly Haven sky photo; want: where we put its sun (x, y, z), chosen so the runner is lit nicely
const P = {
  day: { sky: 'kloofendal_48d_partly_cloudy_puresky', want: [-0.55, 0, 0.6], fog: 0xc4d6e6, hemi: 0.3, sun: 0xfff3df, sunI: 2.4, exposure: 0.95, bloom: 0.16, warm: 0.02 },
  sunset: { sky: 'belfast_sunset_puresky', want: [0.35, 0, -1], fog: 0xc0a49e, hemi: 0.2, sun: 0xffb36b, sunI: 2.3, exposure: 0.9, bloom: 0.32, warm: 0.06 },
  night: { sky: 'kloppenheim_02_puresky', want: [-0.5, 0, 0.5], fog: 0x121a2b, hemi: 0.18, sun: 0x9fb2ff, sunI: 0.35, exposure: 1.5, bloom: 0.6, warm: -0.02 },
};
const C = (h) => new THREE.Color(h);

export function createFX({ renderer, scene, camera, hemi, sun, clouds, capture }) {
  // sky: a big sphere carrying the sky photo, always centred on the camera
  const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, color: 0x000000 });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky); scene.background = null;
  clouds.visible = false; // the photo has real clouds
  const pmrem = new THREE.PMREMGenerator(renderer);
  // load each mood: the sky photo, its HDR twin for lighting, and the sun's direction found in the HDR
  async function loadMood(p) {
    const [jpg, hdr] = await Promise.all([new THREE.TextureLoader().loadAsync(`real/sky_${p.sky}.jpg`), new RGBELoader().setDataType(THREE.FloatType).loadAsync(`real/${p.sky}.hdr`)]);
    jpg.colorSpace = THREE.SRGBColorSpace;
    const { data, width, height } = hdr.image; let best = -1, bi = 0;
    for (let y = 0; y < height / 2; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4, l = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11; if (l > best) { best = l; bi = y * width + x; } }
    const u = (bi % width + 0.5) / width, th = (Math.floor(bi / width) + 0.5) / height * Math.PI, ph = u * Math.PI * 2;
    const d = new THREE.Vector3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)); // same mapping as SphereGeometry
    const rot = Math.atan2(p.want[0], p.want[2]) - Math.atan2(d.x, d.z);
    d.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    d.y = Math.min(d.y, 0.82); d.normalize(); // a very high noon sun casts no shadow worth seeing
    const envScene = new THREE.Scene(), ball = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), new THREE.MeshBasicMaterial({ map: hdr, side: THREE.BackSide }));
    ball.rotation.y = rot; envScene.add(ball);
    p.env = pmrem.fromScene(envScene, 0, 0.1, 100).texture; p.jpg = jpg; p.rot = rot; p.sunDir = d;
    hdr.dispose(); ball.geometry.dispose();
  }

  // bloom and grading
  const size = new THREE.Vector2();
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.4, 0.93);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, warm: { value: 0.03 }, vig: { value: 0.28 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float warm, vig; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb = mix(vec3(l), c.rgb, 1.12);                          // a touch richer, like a phone camera
        c.rgb = (c.rgb - 0.5) * 1.07 + 0.5;                         // and contrast
        c.rgb += vec3(warm, warm * 0.35, -warm);                    // warm coastal tint
        float d = distance(vUv, vec2(0.5, 0.48));
        c.rgb *= 1.0 - smoothstep(0.45, 0.95, d) * vig;             // soft vignette
        gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
      }`,
  });
  composer.addPass(grade);

  // ---------- 2D overlay: speed lines, edge glow, confetti, coins flying to the counter ----------
  const ov = document.createElement('canvas'); ov.id = 'fxOverlay';
  document.body.insertBefore(ov, document.getElementById('vignette'));
  const g2 = ov.getContext('2d');
  let W = 1, H = 1, dpr = 1;
  const confetti = [], flyers = [];
  let lines = 0, edge = 0, edgeColor = '255,194,26';
  const COLORS = ['#ffc21a', '#e8245f', '#12b5b0', '#1546b8', '#ffffff', '#2f9e44'];

  // ---------- crows over the city ----------
  const crowMat = new THREE.MeshBasicMaterial({ color: 0x15171c, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.18, 0, 0, 0.22, 0.95, 0, 0.05], 3));
  const flock = new THREE.Group(); flock.visible = false; scene.add(flock);
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group(), body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 5), crowMat); body.rotation.x = Math.PI / 2; b.add(body);
    const l = new THREE.Mesh(wingGeo, crowMat), r = new THREE.Mesh(wingGeo, crowMat); r.scale.x = -1; b.add(l, r);
    b.userData = { l, r, ph: Math.random() * 6 }; b.position.set((i % 3) * 2.2 - (i > 3 ? 3 : 0), (i % 2) * 1.1, -Math.floor(i / 2) * 1.8); flock.add(b);
  }
  let crowWait = 4;

  let quality = Settings.quality;
  const fx = {
    sky, preset: 'day',
    setQuality(q) {
      quality = q; Settings.quality = q; saveSettings();
      renderer.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio || 1, capture ? 2 : 1.75) : 1);
      sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      fx.resize();
    },
    resize() {
      renderer.getSize(size); const pr = renderer.getPixelRatio();
      composer.setPixelRatio(pr); composer.setSize(size.x, size.y);
      bloom.resolution.set(size.x * pr / 2, size.y * pr / 2);
      dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      ov.width = W * dpr; ov.height = H * dpr;
    },
    async load(onProgress) { let n = 0; for (const p of Object.values(P)) { await loadMood(p); onProgress?.(++n / 3); } },
    // blend two lighting moods: 0 = a, 1 = b
    light(a, b = a, t = 0) {
      const A = P[a], B = P[b], lc = (k, target) => target.copy(C(A[k])).lerp(C(B[k]), t), ln = k => A[k] + (B[k] - A[k]) * t, M = t < 0.5 ? A : B;
      lc('fog', scene.fog.color); lc('sun', sun.color); hemi.color.setHex(0xffffff); hemi.groundColor.setHex(0x8a7f70);
      hemi.intensity = ln('hemi'); sun.intensity = ln('sunI'); renderer.toneMappingExposure = ln('exposure');
      if (A.sunDir && B.sunDir) sun.position.copy(A.sunDir).lerp(B.sunDir, t).normalize().multiplyScalar(40).add(sun.target.position);
      if (M.jpg) { skyMat.map = M.jpg; skyMat.color.setHex(0xffffff); skyMat.needsUpdate = true; sky.rotation.y = M.rot; scene.environment = M.env; }
      bloom.strength = ln('bloom'); grade.uniforms.warm.value = ln('warm');
      fx.preset = t < 0.5 ? a : b;
    },
    render() { if (quality === 'high') composer.render(); else renderer.render(scene, camera); },
    speedLines(v) { lines = v; },
    edgeGlow(v, rgb = '255,194,26') { edge = v; edgeColor = rgb; },
    confetti(n = 120) {
      for (let i = 0; i < n; i++) confetti.push({ x: W * (0.2 + Math.random() * 0.6), y: H * 0.35, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 700, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: COLORS[i % COLORS.length], w: 6 + Math.random() * 6, life: 2.5 });
    },
    coinFly(x, y) { if (flyers.length < 14) flyers.push({ x, y, t: 0 }); },
    update(dt, cam) {
      sky.position.copy(cam.position);
      // crows cross the sky every so often in daylight
      if (!flock.visible && (crowWait -= dt) < 0 && fx.preset !== 'night') {
        flock.visible = true; const dir = Math.random() < 0.5 ? 1 : -1;
        flock.userData = { dir }; flock.position.set(-dir * 70, 20 + Math.random() * 10, -60 - Math.random() * 40); flock.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      if (flock.visible) {
        flock.position.x += flock.userData.dir * 11 * dt; flock.position.y += Math.sin(performance.now() / 900) * dt;
        for (const b of flock.children) { const a = Math.sin(performance.now() / 110 + b.userData.ph) * 0.7; b.userData.l.rotation.z = a; b.userData.r.rotation.z = -a; }
        if (Math.abs(flock.position.x) > 75) { flock.visible = false; crowWait = 9 + Math.random() * 10; }
      }
      // overlay
      g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.clearRect(0, 0, W, H);
      if (edge > 0.01) {
        const gr = g2.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        gr.addColorStop(0, `rgba(${edgeColor},0)`); gr.addColorStop(1, `rgba(${edgeColor},${0.55 * edge})`);
        g2.fillStyle = gr; g2.fillRect(0, 0, W, H);
      }
      if (lines > 0.01) {
        g2.strokeStyle = `rgba(255,255,255,${0.55 * lines})`; g2.lineCap = 'round';
        const cx = W / 2, cy = H * 0.45, R = Math.max(W, H);
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2, r0 = R * (0.32 + Math.random() * 0.12), r1 = r0 + R * (0.1 + Math.random() * 0.25);
          g2.lineWidth = 1 + Math.random() * 2.5; g2.beginPath(); g2.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g2.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g2.stroke();
        }
      }
      for (let i = confetti.length - 1; i >= 0; i--) {
        const p = confetti[i]; p.life -= dt; p.vy += 900 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        if (p.life <= 0 || p.y > H + 20) { confetti.splice(i, 1); continue; }
        g2.save(); g2.translate(p.x, p.y); g2.rotate(p.r); g2.fillStyle = p.c; g2.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2 * Math.abs(Math.cos(p.r * 2))); g2.restore();
      }
      const cash = document.querySelector('#hud .pill'), rc = cash && cash.getBoundingClientRect();
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i]; f.t += dt / 0.45;
        if (f.t >= 1 || !rc) { flyers.splice(i, 1); if (cash) { cash.classList.remove('bump'); void cash.offsetWidth; cash.classList.add('bump'); } continue; }
        const e = f.t * f.t, tx = rc.left + 20, ty = rc.top + rc.height / 2;
        const x = f.x + (tx - f.x) * e, y = f.y + (ty - f.y) * e - Math.sin(f.t * Math.PI) * 60, s = 13 - f.t * 4;
        g2.fillStyle = '#ffc21a'; g2.beginPath(); g2.arc(x, y, s, 0, 7); g2.fill();
        g2.strokeStyle = '#b77900'; g2.lineWidth = 2.5; g2.stroke(); g2.fillStyle = '#ffe07a'; g2.beginPath(); g2.arc(x - s * 0.2, y - s * 0.2, s * 0.45, 0, 7); g2.fill();
      }
    },
  };
  fx.setQuality(quality);
  fx.light('day');
  return fx;
}
