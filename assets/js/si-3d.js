// Show-Intro in echtem 3D (WebGL, three.js r147 aus assets/vendor/three).
//
// Pilot: Original-Studio.
//  • Vorspann: Flug durch eine Treppenwelt in Rot, Rosa, Blau, Violett mit harter Sonne und
//    Schatten. Der Moderator läuft Treppen hoch, springt vom Turm in den Pool, und beim
//    Platsch kommt der Match-Cut ins Studio.
//  • Studio: spiegelnder Boden, XXL-Showtreppe mit LED-Kanten im Beat, Pastell-Bögen mit
//    Glühbirnen, LED-Würfel, Moving Heads mit Lichtkegeln im Dunst, Bloom.
//  • Treppenabgang (Moderation): Kran-Fahrt von oben nach vorn, die Stufen leuchten im Takt
//    auf, Bodennebel, Verfolger-Spots, Ganzkörper-Figur läuft die Treppe herunter.
//  • Teams und Co-Moderation: Hero-Shot auf dem Podest mit Kantenlicht in Teamfarbe.
// Alle Schnitte liegen auf dem Beat-Raster der Musik (tl.bpm, verankert am Höhepunkt).
// Ohne WebGL (oder mit ?no3d) bleiben die bisherigen 2D-Bühnenbilder aktiv.

import { h, run, clamp } from './si-core.js';

const VENDOR = ['three.min.js', 'CopyShader.js', 'LuminosityHighPassShader.js', 'EffectComposer.js', 'RenderPass.js', 'ShaderPass.js', 'UnrealBloomPass.js', 'Reflector.js'];
const BASE = 'assets/vendor/three/';
export const HOST_POSES = { stand: 'assets/img/host-stand.webp', walk: 'assets/img/host-walk.webp', mic: 'assets/img/host-mic.webp' };
export const COHOST_POSES = { stand: 'assets/img/cohost-stand.webp', walk: 'assets/img/cohost-walk.webp', mic: 'assets/img/cohost-mic.webp' };

// ---------------------------------------------------------------------------------
// Laden und Verfügbarkeit
// ---------------------------------------------------------------------------------
let loading = null;
// Einzeldatei-Builds legen three.js und die Figuren-Bilder einmal auf der äußeren Seite ab
const hostWin = (key = '__THREE_SRC') => { for (const w of [window, (() => { try { return window.parent; } catch { return null; } })(), (() => { try { return window.top; } catch { return null; } })()]) { try { if (w && w[key]) return w; } catch { /* fremder Ursprung */ } } return null; };
export const imgUrl = (p) => { const w = hostWin('__SI_IMG'); return (w && w.__SI_IMG[p]) || p; };
export function load3D() {
  if (window.THREE && window.THREE.EffectComposer && window.THREE.Reflector) return Promise.resolve(window.THREE);
  if (loading) return loading;
  loading = new Promise((res) => {
    const w = hostWin();
    if (w) {
      try { const s = document.createElement('script'); s.textContent = w.__THREE_SRC; document.head.append(s); } catch { /* */ }
      window.THREE = window.THREE || null;
      res(window.THREE && window.THREE.EffectComposer ? window.THREE : null);
      return;
    }
    let i = 0;
    const next = () => {
      if (i >= VENDOR.length) { res(window.THREE && window.THREE.EffectComposer ? window.THREE : null); return; }
      const s = document.createElement('script');
      s.src = BASE + VENDOR[i++];
      s.onload = next;
      s.onerror = () => res(null);
      document.head.append(s);
    };
    next();
  });
  return loading;
}
let glOk = null;
export function can3D() {
  try {
    if (/[?&]no3d\b/.test(location.search) || localStorage.getItem('si-3d') === 'off') return false;
  } catch { /* */ }
  if (glOk === null) {
    try { const cv = document.createElement('canvas'); glOk = !!(cv.getContext('webgl2') || cv.getContext('webgl')); } catch { glOk = false; }
  }
  return glOk;
}
if (typeof document !== 'undefined' && document.body && /beamer/.test(document.body.className) && can3D()) load3D();

// ---------------------------------------------------------------------------------
// Engine (ein Renderer für alle Szenen, damit kein WebGL-Kontext verloren geht)
// ---------------------------------------------------------------------------------
const E = { r: null, comp: null, bloom: null, grade: null, rp: null, cam: null, raf: 0, cur: null, W: 0, H: 0 };

const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, uT: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: null }, uWhip: { value: 0 }, uWhipDir: { value: 1 },
    uWipe: { value: -1 }, uExpo: { value: 1 }, uVig: { value: 0.55 }, uAb: { value: 0.0025 }, uGrain: { value: 0.035 }, uFade: { value: 0 }, uLetter: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uT, uFlash, uWhip, uWhipDir, uWipe, uExpo, uVig, uAb, uGrain, uFade, uLetter; uniform vec3 uFlashCol; varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec3 col = vec3(0.0);
      if (uWhip > 0.002) {
        for (int i = 0; i < 16; i++) { float f = (float(i) / 15.0 - 0.5) * uWhip * 0.3; col += texture2D(tDiffuse, uv + vec2(f * uWhipDir, f * 0.06)).rgb; }
        col /= 16.0;
      } else {
        vec2 d = (uv - 0.5) * uAb;
        col = vec3(texture2D(tDiffuse, uv + d).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d).b);
      }
      col *= uExpo;
      float wx = (uv.x + (uv.y - 0.5) * 0.4) - uWipe;
      col += vec3(1.0, 0.96, 0.9) * (exp(-wx * wx * 220.0) * 6.0 + exp(-wx * wx * 18.0) * 0.6) * step(-0.6, uWipe) * step(uWipe, 1.6);
      col = aces(col);
      col = pow(col, vec3(1.0 / 2.2));
      float v = smoothstep(1.05, 0.28, length((uv - 0.5) * vec2(1.15, 1.0)));
      col *= mix(1.0, v, uVig);
      col += (hash(uv * 911.0 + uT) - 0.5) * uGrain;
      col = mix(col, uFlashCol, clamp(uFlash, 0.0, 1.0));
      col *= 1.0 - uFade;
      float lb = step(abs(uv.y - 0.5), 0.5 - uLetter);
      gl_FragColor = vec4(col * lb, 1.0);
    }`,
};

function engine(T) {
  if (E.r) return E;
  T.ColorManagement.legacyMode = false;
  const r = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  r.shadowMap.enabled = true;
  r.shadowMap.type = T.PCFSoftShadowMap;
  r.domElement.className = 'si-3d';
  E.r = r;
  E.cam = new T.PerspectiveCamera(38, 16 / 9, 0.1, 500);
  const rt = new T.WebGLRenderTarget(16, 9, { type: T.HalfFloatType });
  E.comp = new T.EffectComposer(r, rt);
  E.rp = new T.RenderPass(new T.Scene(), E.cam);
  E.bloom = new T.UnrealBloomPass(new T.Vector2(256, 144), 0.6, 0.5, 0.92);
  GRADE.uniforms.uFlashCol.value = new T.Color(1, 1, 1);
  E.grade = new T.ShaderPass(GRADE);
  E.comp.addPass(E.rp); E.comp.addPass(E.bloom); E.comp.addPass(E.grade);
  return E;
}

function disposeScene(scene) {
  if (!scene) return;
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of ms) { for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k] && !m[k].userData.keep) m[k].dispose(); if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture && !u.value.userData.keep) u.value.dispose(); m.dispose(); }
    if (o.isReflector && o.getRenderTarget) o.getRenderTarget().dispose();
    if (o.customDepthMaterial) o.customDepthMaterial.dispose();
  });
}

export function stop3D() {
  cancelAnimationFrame(E.raf); E.raf = 0;
  if (E.cur) { disposeScene(E.cur.scene); for (const s of E.cur.extra || []) disposeScene(s); E.cur = null; }
  if (E.r && E.r.domElement.parentNode) E.r.domElement.remove();
}

function loop() {
  E.raf = requestAnimationFrame(loop);
  const cur = E.cur;
  if (!cur) return;
  if (!E.r.domElement.isConnected) { stop3D(); return; }
  const host = E.r.domElement.parentNode;
  const w = host.clientWidth || 16; const hh = host.clientHeight || 9;
  if (w !== E.W || hh !== E.H) { E.W = w; E.H = hh; E.r.setSize(w, hh, false); E.comp.setSize(w, hh); E.cam.aspect = w / hh; E.cam.updateProjectionMatrix(); }
  const t = typeof window.__si3dT === 'number' ? window.__si3dT : (performance.now() - cur.t0) / 1000; // __si3dT: Standbild für Tests
  const U = E.grade.uniforms;
  E.bloom.strength = 0.6;
  U.uT.value = t % 100; U.uFlash.value = 0; U.uFlashCol.value.set('#ffffff'); U.uWhip.value = 0; U.uWipe.value = -1; U.uFade.value = 0; U.uExpo.value = 1; U.uLetter.value = 0; U.uVig.value = 0.55;
  const scene = cur.update(t) || cur.scene;
  E.rp.scene = scene;
  E.comp.render();
}

// ---------------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------------
const lerp = (a, b, u) => a + (b - a) * u;
const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// Kamerafahrt aus Schlüsselbildern [t, [x,y,z], [lookX,lookY,lookZ], fov?]
function rig(cam, keys, t, shake = 0) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i]; const b = keys[Math.min(i + 1, keys.length - 1)];
  const u = b[0] > a[0] ? ease((t - a[0]) / (b[0] - a[0])) : 1;
  const p = [0, 1, 2].map((k) => lerp(a[1][k], b[1][k], u));
  const l = [0, 1, 2].map((k) => lerp(a[2][k], b[2][k], u));
  if (shake) { p[0] += Math.sin(t * 2.3) * 0.06 * shake + Math.sin(t * 5.1) * 0.02 * shake; p[1] += Math.sin(t * 1.7 + 1) * 0.05 * shake; l[0] += Math.sin(t * 1.3) * 0.05 * shake; }
  cam.position.set(p[0], p[1], p[2]);
  cam.lookAt(l[0], l[1], l[2]);
  const fov = lerp(a[3] || 38, b[3] || 38, u);
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
}

function canvasTex(T, w, hgt, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  draw(cv.getContext('2d'), w, hgt);
  const tx = new T.CanvasTexture(cv);
  tx.encoding = T.sRGBEncoding;
  return tx;
}
function softDot(T) {
  return canvasTex(T, 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
}
function hazeTex(T) {
  return canvasTex(T, 256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) { const x = Math.random() * 256; const y = Math.random() * 256; const r = 20 + Math.random() * 70; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.05 + Math.random() * 0.08})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    const id = g.getImageData(0, 0, 256, 256); const d = id.data; for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const e = Math.min(x, y, 255 - x, 255 - y) / 60; const k = (y * 256 + x) * 4; const m = Math.min(1, e); d[k] *= m; d[k + 1] *= m; d[k + 2] *= m; } g.putImageData(id, 0, 0);
  });
}
function loadTex(T, src, done) {
  const tx = new T.Texture();
  tx.encoding = T.sRGBEncoding;
  const img = new Image();
  img.onload = () => { tx.image = img; tx.needsUpdate = true; if (done) done(tx, img); };
  img.src = src;
  return tx;
}

const MAT = new Map();
function std(T, col, o = {}) {
  return new T.MeshStandardMaterial({ color: new T.Color(col), roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, emissive: new T.Color(o.em || '#000000'), emissiveIntensity: o.ei ?? 1, ...(o.extra || {}) });
}
function box(T, parent, w, hh, d, col, x, y, z, o = {}) {
  const m = new T.Mesh(new T.BoxGeometry(w, hh, d), o.mat || std(T, col, o));
  m.position.set(x, y, z);
  m.castShadow = o.cast !== false; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Beleuchteter Lichtkegel (Dunst) – Spitze im Ursprung, zeigt nach -Y
function beamMat(T, col) {
  return new T.ShaderMaterial({
    uniforms: { uCol: { value: new T.Color(col) }, uI: { value: 1 } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float fall = pow(vY, 2.2); float edge = pow(abs(dot(vN, vV)), 1.6); gl_FragColor = vec4(uCol * uI * fall * edge * 0.55, 1.0); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
  });
}
function beam(T, parent, col, len = 24, rad = 2.4) {
  const g = new T.ConeGeometry(rad, len, 40, 1, true);
  g.translate(0, -len / 2, 0);
  const piv = new T.Group();
  const m = new T.Mesh(g, beamMat(T, col));
  m.renderOrder = 5;
  const head = new T.Mesh(new T.SphereGeometry(0.28, 16, 12), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(6) }));
  piv.add(m, head);
  parent.add(piv);
  return { piv, m, head, col: new T.Color(col) };
}
const _v = { a: null, b: null, q: null };
function aim(T, b, target, intensity) {
  _v.a = _v.a || new T.Vector3(); _v.b = _v.b || new T.Vector3(0, -1, 0);
  _v.a.copy(target).sub(b.piv.position).normalize();
  b.piv.quaternion.setFromUnitVectors(_v.b, _v.a);
  b.m.material.uniforms.uI.value = intensity;
  b.head.material.color.copy(b.col).multiplyScalar(1 + 7 * intensity);
}

// Figur als Billboard (Ganzkörper oder Brustbild). Unterkante = Füße bei y=0.
function figure(T, parent, srcs, heightM = 1.85) {
  const grp = new T.Group();
  const geo = new T.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
  const mat = new T.MeshStandardMaterial({ transparent: true, alphaTest: 0.35, side: T.DoubleSide, roughness: 0.75, emissive: new T.Color('#ffffff'), emissiveIntensity: 0.55, color: new T.Color('#ffffff') });
  const m = new T.Mesh(geo, mat);
  m.castShadow = true;
  m.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, alphaTest: 0.5 });
  const rim = new T.Mesh(geo, new T.ShaderMaterial({
    uniforms: { map: { value: null }, uCol: { value: new T.Color('#ffffff') }, uI: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 uCol; uniform float uI; varying vec2 vUv; void main(){ float a = texture2D(map, vUv).a; gl_FragColor = vec4(uCol * a * uI, 1.0); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  }));
  rim.position.z = -0.04; rim.renderOrder = 2;
  grp.add(rim, m);
  parent.add(grp);
  const tex = {}; const asp = {};
  const F = { grp, m, rim, tex, asp, pose: null, h: heightM, bust: false };
  F.set = (pose) => {
    if (!tex[pose]) pose = Object.keys(tex).find((k) => asp[k]) || pose;
    if (!tex[pose] || F.pose === pose) return;
    F.pose = pose;
    mat.map = tex[pose]; mat.emissiveMap = tex[pose]; mat.needsUpdate = true;
    m.customDepthMaterial.map = tex[pose]; m.customDepthMaterial.needsUpdate = true;
    rim.material.uniforms.map.value = tex[pose];
    const a = asp[pose] || 0.4;
    F.bust = a > 0.55; // Brustbild: kleiner und schwebend
    const H = F.bust ? heightM * 0.62 : heightM;
    m.scale.set(H * a, H, 1); rim.scale.set(H * a * 1.05, H * 1.03, 1);
    m.position.y = F.bust ? heightM * 0.42 : 0; rim.position.y = m.position.y - H * 0.012;
  };
  const want = Object.keys(srcs)[0];
  for (const [k, src] of Object.entries(srcs)) {
    if (!src) continue;
    tex[k] = loadTex(T, imgUrl(src), (tx, img) => { asp[k] = img.width / img.height; if (!F.pose || F.pose === k || (k === want)) { F.pose = null; F.set(k === want ? k : (F.pose || k)); } });
  }
  F.face = (cam, full = false) => {
    if (full) { grp.quaternion.copy(cam.quaternion); return; }
    grp.rotation.set(0, Math.atan2(cam.position.x - grp.position.x, cam.position.z - grp.position.z), 0);
  };
  return F;
}

// LED-Würfel-Textur: Retro-Rahmen in Pastell mit großem Fragezeichen (der Showname steht als Logo davor)
function logoTex(T, name, font, colA, colB) {
  return canvasTex(T, 512, 512, (g, w, hh) => {
    g.fillStyle = '#07040f'; g.fillRect(0, 0, w, hh);
    const cols = ['#ff5a6e', '#f6a9bb', '#5b7bff', '#8b6fd6'];
    for (let k = 0; k < 6; k++) { const m = 14 + k * 26; g.strokeStyle = cols[k % 4]; g.lineWidth = 14; g.beginPath(); g.roundRect ? g.roundRect(m, m, w - 2 * m, hh - 2 * m, 30) : g.rect(m, m, w - 2 * m, hh - 2 * m); g.stroke(); }
    g.font = String(font || '900 100px sans-serif').replace(/\d+px/, '260px');
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = colA; g.shadowBlur = 40; g.fillStyle = '#ffffff';
    g.fillText('?', w / 2, hh / 2 + 14);
    g.shadowBlur = 0; g.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < hh; y += 4) g.fillRect(0, y, w, 2);
  });
}

// ---------------------------------------------------------------------------------
// Welt 1: Treppenwelt (Vorspann)
// ---------------------------------------------------------------------------------
const MR = { red: '#c93a37', redD: '#9c2a33', pink: '#e8879d', pinkD: '#c86a83', blue: '#3a5fd9', blueL: '#6f8ee8', vio: '#6b4bb8', ground: '#d48b80', water: '#1679b8' };
function buildMuralla(T, F0) {
  const sc = new T.Scene();
  const hor = new T.Color('#e4eefc'); const top = new T.Color('#2f78f0');
  sc.fog = new T.Fog(hor, 110, 280);
  const sky = new T.Mesh(new T.SphereGeometry(300, 32, 16), new T.ShaderMaterial({
    uniforms: { uH: { value: hor }, uTop: { value: top }, uSun: { value: new T.Vector3(25, 40, 18).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uH, uTop, uSun; varying vec3 vD; void main(){ float y = clamp(vD.y, 0.0, 1.0); vec3 c = mix(uH, uTop, pow(y, 0.55)); float s = max(dot(vD, uSun), 0.0); c += vec3(1.0, 0.85, 0.6) * (pow(s, 600.0) * 30.0 + pow(s, 12.0) * 0.35); gl_FragColor = vec4(c, 1.0); }',
    side: T.BackSide, depthWrite: false, fog: false,
  }));
  sc.add(sky);
  sc.add(new T.HemisphereLight('#bcd4ff', '#e08a7c', 0.5));
  const sun = new T.DirectionalLight('#fff0dc', 2.3);
  sun.position.set(25, 40, 18); sun.target.position.set(0, 0, -4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  sc.add(sun, sun.target);
  const ground = new T.Mesh(new T.PlaneGeometry(400, 400), std(T, MR.ground, { rough: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
  // Rote Mauer mit Zinnen hinten, Schlitze vorn
  box(T, sc, 24, 11, 3, MR.red, -2, 5.5, -13.5);
  for (let x = -13.4; x < 10; x += 2.4) box(T, sc, 1.2, 1.2, 0.8, MR.red, x, 11.6, -14.6);
  for (const x of [-11, -9.4, -7.8, 2.6, 4.2, 5.8]) box(T, sc, 0.55, 2.6, 0.2, MR.pinkD, x, 6.5, -11.95, { cast: false });
  // Rosa Treppe an der Mauer
  for (let i = 0; i < 12; i++) box(T, sc, 1.0, (i + 1) * 0.9, 2.4, MR.pink, -12.5 + i, (i + 1) * 0.45, -10.8);
  // Blauer Turm, hellblauer Turm hinten
  box(T, sc, 6, 17, 8, MR.blue, 13, 8.5, -12);
  box(T, sc, 5, 20, 5, MR.blueL, -6, 10, -24);
  for (let x = -8; x <= -4; x += 2) box(T, sc, 1, 1, 5, MR.blueL, x, 20.5, -24);
  // Violette Treppe zum Turm
  for (let i = 0; i < 10; i++) box(T, sc, 1.0, (i + 1) * 0.8, 3, MR.vio, 24.5 - i, (i + 1) * 0.4, -5);
  box(T, sc, 12, 9, 2, MR.vio, 27, 4.5, -16);
  // Bogengang links
  const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(16, 0); sh.lineTo(16, 8); sh.lineTo(0, 8); sh.lineTo(0, 0);
  for (let k = 0; k < 3; k++) { const x0 = 2 + k * 4.8; const ho = new T.Path(); ho.moveTo(x0, 0); ho.lineTo(x0 + 3, 0); ho.lineTo(x0 + 3, 3.6); ho.absarc(x0 + 1.5, 3.6, 1.5, 0, Math.PI, false); ho.lineTo(x0, 0); sh.holes.push(ho); }
  const arc = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false }), std(T, MR.pink));
  arc.rotation.y = Math.PI / 2; arc.position.set(-22, 0, 8); arc.castShadow = true; arc.receiveShadow = true; sc.add(arc);
  // Erhöhtes Becken mit Wasser
  box(T, sc, 14, 1, 0.6, MR.pink, 0, 0.5, 2.3); box(T, sc, 14, 1, 0.6, MR.pink, 0, 0.5, 11.7);
  box(T, sc, 0.6, 1, 10, MR.pink, -6.7, 0.5, 7); box(T, sc, 0.6, 1, 10, MR.pink, 6.7, 0.5, 7);
  const bottom = new T.Mesh(new T.PlaneGeometry(12.8, 8.8), std(T, '#0f5f9a')); bottom.rotation.x = -Math.PI / 2; bottom.position.set(0, 0.02, 7); sc.add(bottom);
  const water = new T.Mesh(new T.PlaneGeometry(12.8, 8.8, 1, 1), new T.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uT; varying vec3 vW; void main(){ vec2 p = vW.xz * 1.2; float c = sin(p.x * 2.1 + uT * 1.3 + sin(p.y * 1.7 + uT)) + sin(p.y * 2.7 - uT * 1.1 + sin(p.x * 1.3 - uT * 0.7)); float caus = pow(1.0 - abs(sin(c * 1.6)), 8.0); vec3 col = mix(vec3(0.01, 0.2, 0.45), vec3(0.08, 0.6, 0.8), 0.55 + 0.2 * c) + caus * 0.7; gl_FragColor = vec4(col, 0.93); }',
    transparent: true,
  }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.85, 7); sc.add(water);
  // Sprungturm
  box(T, sc, 3, 9, 3, MR.red, 10, 4.5, 6);
  for (let i = 0; i < 8; i++) box(T, sc, 1.6, (i + 1) * 1.1, 1, MR.vio, 12.3, (i + 1) * 0.55, 10.5 - i);
  // Ninjas
  const ninjas = [0, 1, 2].map(() => {
    const g = new T.Group();
    const dark = std(T, '#0d0d12', { rough: 0.6 });
    const body = new T.Mesh(new T.CapsuleGeometry(0.24, 0.5, 4, 10), dark); body.position.y = 1.15; body.castShadow = true;
    const limb = (x, y, len, r) => { const piv = new T.Group(); piv.position.set(x, y, 0); const m = new T.Mesh(new T.CapsuleGeometry(r, len, 4, 8), dark); m.position.y = -len / 2 - r; m.castShadow = true; piv.add(m); g.add(piv); return piv; };
    g.userData.limbs = [limb(-0.12, 0.82, 0.55, 0.09), limb(0.12, 0.82, 0.55, 0.09), limb(-0.32, 1.42, 0.45, 0.07), limb(0.32, 1.42, 0.45, 0.07)];
    const head = new T.Mesh(new T.SphereGeometry(0.21, 16, 12), dark); head.position.y = 1.7; head.castShadow = true;
    const band = new T.Mesh(new T.TorusGeometry(0.215, 0.04, 8, 24), std(T, '#e23b3b')); band.position.y = 1.72; band.rotation.x = Math.PI / 2;
    g.add(body, head, band); sc.add(g); return g;
  });
  // Spritzer
  const N = 520;
  const pos = new Float32Array(N * 3); const vel = new Float32Array(N * 3);
  const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
  const splash = new T.Points(pg, new T.PointsMaterial({ size: 0.32, map: softDot(T), transparent: true, depthWrite: false, color: new T.Color('#eaf8ff'), opacity: 0.95 }));
  splash.visible = false; splash.frustumCulled = false; sc.add(splash);
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2; const s = 1 + Math.random() * 5; vel[i * 3] = Math.cos(a) * s * 0.6; vel[i * 3 + 1] = 5 + Math.random() * 9; vel[i * 3 + 2] = Math.sin(a) * s * 0.6; }
  const host = figure(T, sc, F0, 1.85);
  return { sc, water, ninjas, splash, pos, vel, host };
}

// ---------------------------------------------------------------------------------
// Welt 2: Studio
// ---------------------------------------------------------------------------------
const PASTEL = ['#ff5a6e', '#f6a9bb', '#5b7bff', '#8b6fd6'];
function buildStudio(T, o) {
  const sc = new T.Scene();
  sc.background = new T.Color('#030208');
  sc.fog = new T.FogExp2('#0a0614', 0.012);
  sc.add(new T.HemisphereLight('#3a3a6a', '#0a0610', 0.55));
  // Spiegelnder Boden: Reflector darunter, halbtransparente Fliesen darüber
  const refl = new T.Reflector(new T.PlaneGeometry(120, 120), { textureWidth: 1024, textureHeight: 576, color: 0x8a8a99, clipBias: 0.003 });
  refl.rotation.x = -Math.PI / 2; refl.position.y = -0.01; sc.add(refl);
  const tiles = canvasTex(T, 256, 256, (g) => { g.fillStyle = '#0c0b16'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(160,140,255,.35)'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256); });
  tiles.wrapS = tiles.wrapT = T.RepeatWrapping; tiles.repeat.set(40, 40); tiles.anisotropy = 8;
  const floor = new T.Mesh(new T.PlaneGeometry(120, 120), new T.MeshStandardMaterial({ map: tiles, color: '#ffffff', roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.72 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
  // XXL-Showtreppe: 14 Stufen, LED-Kanten
  const STEPS = 14; const RISE = 0.42; const RUN = 1.0; const WID = 10;
  const stepMat = std(T, '#14121f', { rough: 0.35, metal: 0.2 });
  const leds = [];
  for (let i = 0; i < STEPS; i++) {
    box(T, sc, WID, (i + 1) * RISE, RUN, null, 0, (i + 1) * RISE / 2, -(i + 0.5) * RUN, { mat: stepMat });
    const led = new T.Mesh(new T.BoxGeometry(WID, 0.07, 0.09), new T.MeshBasicMaterial({ color: '#ffffff' }));
    led.position.set(0, (i + 1) * RISE - 0.035, -i * RUN + 0.02); sc.add(led); leds.push(led);
  }
  box(T, sc, WID, STEPS * RISE, 4, null, 0, STEPS * RISE / 2, -STEPS * RUN - 2, { mat: stepMat });
  // Glühbirnen an den Treppenwangen und auf den Bögen
  const bulbPos = [];
  for (let i = 0; i < STEPS; i++) for (const sx of [-1, 1]) bulbPos.push([sx * (WID / 2 + 0.25), (i + 1) * RISE + 0.25, -(i + 0.5) * RUN, 0]);
  const arches = [];
  for (let k = 0; k < 7; k++) {
    const R = 8.5 + k * 1.25; const z = -19 - k * 2.2;
    const col = PASTEL[k % 4];
    const a = new T.Mesh(new T.TorusGeometry(R, 0.42, 12, 96, Math.PI), std(T, col, { rough: 0.5, em: col, ei: 0.25 }));
    a.position.set(0, 0, z); sc.add(a); arches.push(a);
    for (let j = 0; j <= 20; j++) { const an = (j / 20) * Math.PI; bulbPos.push([Math.cos(an) * R, Math.sin(an) * R, z + 0.45, k + 1]); }
  }
  const bulbs = new T.InstancedMesh(new T.SphereGeometry(0.13, 10, 8), new T.MeshBasicMaterial({ color: '#ffffff' }), bulbPos.length);
  const mtx = new T.Matrix4();
  bulbPos.forEach((p, i) => { mtx.makeTranslation(p[0], p[1], p[2]); bulbs.setMatrixAt(i, mtx); bulbs.setColorAt(i, new T.Color('#ffd27a')); });
  sc.add(bulbs);
  // LED-Würfel
  const ltx = logoTex(T, o.name, o.font, o.colA || '#ff4f6d', o.colB || '#ffd166');
  const cube = new T.Mesh(new T.BoxGeometry(4.2, 4.2, 4.2), new T.MeshStandardMaterial({ map: ltx, emissiveMap: ltx, emissive: new T.Color('#ffffff'), emissiveIntensity: 1.6, roughness: 0.4 }));
  cube.position.set(0, 11.5, -12); sc.add(cube);
  // Traverse mit Moving Heads
  const trussMat = std(T, '#2a2a33', { metal: 0.7, rough: 0.4 });
  box(T, sc, 34, 0.4, 0.4, null, 0, 17, -4, { mat: trussMat, cast: false });
  box(T, sc, 34, 0.4, 0.4, null, 0, 17, -22, { mat: trussMat, cast: false });
  const heads = [];
  for (let i = 0; i < 8; i++) { const b = beam(T, sc, PASTEL[i % 4], 26, 2.3); b.piv.position.set(-15 + i * (30 / 7), 16.6, -4); heads.push(b); }
  for (let i = 0; i < 6; i++) { const b = beam(T, sc, i % 2 ? '#ffffff' : PASTEL[(i + 2) % 4], 28, 2.0); b.piv.position.set(-14 + i * 5.6, 16.6, -22); heads.push(b); }
  // Verfolger
  const follow = [beam(T, sc, '#fff4e0', 26, 1.6), beam(T, sc, '#fff4e0', 26, 1.6)];
  follow[0].piv.position.set(-9, 16.6, 6); follow[1].piv.position.set(9, 16.6, 6);
  const spots = [new T.SpotLight('#fff1dc', 0, 60, 0.22, 0.6, 1.4), new T.SpotLight('#fff1dc', 0, 60, 0.22, 0.6, 1.4)];
  spots.forEach((s, i) => { s.position.copy(follow[i].piv.position); s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0008; sc.add(s, s.target); });
  const rimL = [new T.SpotLight('#ffffff', 0, 40, 0.5, 0.7, 1.2), new T.SpotLight('#ffffff', 0, 40, 0.5, 0.7, 1.2)];
  rimL[0].position.set(-5, 7, -5); rimL[1].position.set(5, 7, -5); rimL.forEach((s) => sc.add(s, s.target));
  const wash = new T.PointLight('#ff6aa0', 2.5, 40, 1.6); wash.position.set(0, 6, -10); sc.add(wash);
  // Podest
  const pod = new T.Group(); pod.position.set(0, 0, 3.2); sc.add(pod);
  const podBase = new T.Mesh(new T.CylinderGeometry(1.9, 2.1, 0.45, 64), std(T, '#15131f', { rough: 0.3, metal: 0.4 })); podBase.position.y = 0.225; podBase.receiveShadow = true; podBase.castShadow = true;
  const podRing = new T.Mesh(new T.TorusGeometry(2.0, 0.05, 8, 96), new T.MeshBasicMaterial({ color: '#ffffff' })); podRing.rotation.x = Math.PI / 2; podRing.position.y = 0.42;
  pod.add(podBase, podRing); pod.visible = false;
  // Dunst und Bodennebel
  const hz = hazeTex(T); hz.userData.keep = false;
  const haze = [];
  for (let i = 0; i < 9; i++) {
    const m = new T.Mesh(new T.PlaneGeometry(40, 22), new T.MeshBasicMaterial({ map: hz, transparent: true, opacity: 0.045, depthWrite: false, blending: T.AdditiveBlending, color: '#b8a8ff', fog: false }));
    m.position.set((Math.random() - 0.5) * 20, 6 + Math.random() * 6, -18 + i * 3); m.renderOrder = 3; sc.add(m); haze.push(m);
  }
  const fog = [];
  for (let i = 0; i < 16; i++) {
    const m = new T.Mesh(new T.PlaneGeometry(9, 3), new T.MeshBasicMaterial({ map: hz, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, color: '#e6dcff' }));
    m.position.set((Math.random() - 0.5) * 22, 0.5 + Math.random() * 0.7, -2 + Math.random() * 12); m.userData.v = 0.2 + Math.random() * 0.4; m.renderOrder = 4; sc.add(m); fog.push(m);
  }
  // Ring für den Match-Cut (Wasser → Studioboden)
  const ring = new T.Mesh(new T.RingGeometry(0.9, 1.0, 96), new T.MeshBasicMaterial({ color: new T.Color('#9ee7f7').multiplyScalar(3), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.03, 4); sc.add(ring);
  return { sc, leds, bulbs, bulbPos, arches, cube, heads, follow, spots, rimL, wash, pod, podRing, haze, fog, ring, STEPS, RISE, RUN };
}

// Gemeinsame Licht-Programme im Studio
function studioTick(T, S, t, beat, mode, opt = {}) {
  const ph = ((beat % 1) + 1) % 1; const pulse = Math.exp(-ph * 5);
  const b = Math.floor(beat);
  const cam = E.cam;
  // Würfel
  S.cube.rotation.y = t * 0.35; S.cube.position.y = 11.5 + Math.sin(t * 0.9) * 0.25;
  S.cube.material.emissiveIntensity = 1.3 + pulse * 0.8;
  // Dunst zur Kamera drehen
  for (const m of S.haze) { m.quaternion.copy(cam.quaternion); m.position.x += Math.sin(t * 0.1 + m.position.z) * 0.002; }
  for (const m of S.fog) { m.quaternion.copy(cam.quaternion); m.position.x += m.userData.v * 0.01; if (m.position.x > 13) m.position.x = -13; m.material.opacity = (opt.fog ?? 0) * (0.07 + 0.025 * Math.sin(t + m.position.z)); }
  // Bögen
  S.arches.forEach((a, k) => { a.material.emissiveIntensity = 0.25 + (opt.archPulse ?? 1) * 0.9 * Math.exp(-(((beat - k * 0.125) % 1 + 1) % 1) * 4); });
  // Glühbirnen: Lauflicht
  const col = new T.Color(); const base = opt.bulbCol || new T.Color('#ffcf7a');
  S.bulbPos.forEach((p, i) => {
    const on = ((i + Math.floor(t * 10)) % 3) === 0;
    col.copy(base).multiplyScalar(on ? 5 + pulse * 3 : 0.9);
    S.bulbs.setColorAt(i, col);
  });
  S.bulbs.instanceColor.needsUpdate = true;
  // LED-Kanten der Treppe
  const ledCol = opt.ledCol || new T.Color('#ffffff');
  S.leds.forEach((l, i) => {
    let v;
    if (opt.ledFn) v = opt.ledFn(i, t, beat);
    else v = 0.3 + 2.2 * Math.exp(-((((beat * 2 - i * 0.25) % 2) + 2) % 2) * 3);
    l.material.color.copy(ledCol).multiplyScalar(v);
  });
  // Moving Heads
  const target = new T.Vector3();
  S.heads.forEach((hd, i) => {
    const back = i >= 8;
    if (opt.headsAt) target.copy(opt.headsAt);
    else if (mode === 'sweep') target.set(Math.sin(t * 0.8 + i * 0.7) * 14, 0, (back ? -10 : 6) + Math.cos(t * 0.6 + i) * 6);
    else if (mode === 'fan') target.set((i % 8 - 3.5) * 5 * (0.6 + 0.4 * Math.sin(t * 1.2)), 0, back ? 4 : 10);
    else target.set(Math.sin(t * 1.6 + i) * 10, 0, 2 + Math.cos(t * 1.1 + i * 2) * 8);
    let I = (opt.heads ?? 0.8) * (0.55 + 0.45 * pulse);
    if (opt.strobe && ((b + i) % 2 === 0) && ph < 0.25) I = 2.2;
    if (opt.headCol) hd.col.copy(opt.headCol);
    hd.m.material.uniforms.uCol.value.copy(hd.col);
    aim(T, hd, target, I);
  });
  S.wash.intensity = 1.5 + pulse * 3;
}

// ---------------------------------------------------------------------------------
// Öffentliche Szenen
// ---------------------------------------------------------------------------------
// c: Kontext aus show-intro.js; opts: { mode: 'auto'|'host'|'coHost'|'team'|'all', font, figures, team }
export function mount3D(c, opts, fallback) {
  if (!can3D()) return false;
  const holder = h('div', { class: 'si-3d-wrap', 'aria-hidden': 'true' });
  const bg = c.root.querySelector('.si-bg');
  if (bg) bg.after(holder); else c.root.prepend(holder);
  c.root.classList.add('si-3don');
  const t0 = run.t0 != null ? run.t0 : performance.now() - c.el * 1000;
  load3D().then((T) => {
    if (!holder.isConnected) return;
    if (!T) { holder.remove(); c.root.classList.remove('si-3don'); if (fallback) fallback(); return; }
    try {
      engine(T);
      if (E.cur) { disposeScene(E.cur.scene); for (const s of E.cur.extra || []) disposeScene(s); E.cur = null; }
      holder.append(E.r.domElement);
      E.W = 0;
      const cur = build(T, c, opts);
      cur.t0 = t0;
      E.cur = cur;
      if (!E.raf) loop();
    } catch (err) {
      console.warn('3D-Bühne nicht verfügbar:', err);
      holder.remove(); c.root.classList.remove('si-3don'); glOk = false; if (fallback) fallback();
    }
  });
  return true;
}

function build(T, c, o) {
  const si = c.si; const tl = si.tl;
  const bpm = tl.bpm || 128; const spb = 60 / bpm;
  const S = buildStudio(T, { name: c.s.show.name, font: o.font, colA: c.L.a, colB: c.L.c });
  if (o.mode === 'auto') return buildAuto(T, c, o, S, tl, spb);
  return buildPerson(T, c, o, S, tl, spb);
}

// ---- Eröffnung: Vorspann in der Treppenwelt, Platsch, Match-Cut ins Studio ----
function buildAuto(T, c, o, S, tl, spb) {
  const boom = tl.boom; const bar = spb * 4;
  const W = buildMuralla(T, o.figures);
  const host = W.host;
  const c1 = tl.teaser; const c2 = boom - 5 * bar; const c3 = boom - 3 * bar; const c4 = boom - 1.5 * bar; const jump = boom - 1.15;
  const cuts = [[c2, 'whip', 1], [c3, 'wipe'], [c4, 'whip', -1], [jump, 'whip', 1]];
  const stairY1 = (x) => clamp(Math.floor(x + 13) + 1, 0, 12) * 0.9;
  const stairY2 = (x) => clamp(Math.floor(25 - x) + 1, 0, 10) * 0.8;
  return {
    scene: W.sc, extra: [S.sc],
    update(t) {
      const U = E.grade.uniforms;
      const beat = (t - boom) / spb;
      // Übergänge auf den Schnitten
      for (const [ct, kind, dir] of cuts) {
        const d = t - ct;
        if (kind === 'whip' && Math.abs(d) < 0.25) { U.uWhip.value = Math.max(U.uWhip.value, Math.exp(-((d / 0.09) ** 2))); U.uWhipDir.value = dir; }
        if (kind === 'wipe' && d > -0.18 && d < 0.2) U.uWipe.value = (d + 0.18) / 0.38 * 1.6 - 0.3;
      }
      if (t < c1) { U.uFade.value = 1; return W.sc; }
      if (t < c1 + 0.35) U.uFlash.value = 1 - (t - c1) / 0.35;
      U.uLetter.value = 0.06;
      if (t < boom) {
        U.uExpo.value = 0.85; U.uVig.value = 0.35; E.bloom.strength = 0.22;
        W.water.material.uniforms.uT.value = t;
        // Ninjas: Lauf-Animation im Takt
        W.ninjas.forEach((n, i) => { const sw = Math.sin(t * Math.PI * 2 / (spb * 2) + i) * 0.9; const L = n.userData.limbs; L[0].rotation.x = sw; L[1].rotation.x = -sw; L[2].rotation.x = -sw * 0.8; L[3].rotation.x = sw * 0.8; });
        const cam = E.cam;
        host.grp.visible = true;
        let pose = 'walk'; let hp; let full = false;
        const bob = Math.abs(Math.sin(t * Math.PI / spb)) * 0.12;
        if (t < c2) {
          const u = (t - c1) / (c2 - c1); const x = lerp(-12.5, -3.2, u);
          hp = [x, stairY1(x) + bob, -10.6];
          rig(cam, [[c1, [-17, 1.0, 5], [-11, 3.5, -11], 32], [c2, [-7, 10, 7], [-4, 8, -11], 40]], t, 1);
          W.ninjas.forEach((n, i) => { const nx = x - 2.4 - i * 1.6; n.position.set(nx, stairY1(nx) + bob * 0.8, -10.6 + (i - 1) * 0.5); n.rotation.y = Math.PI / 2; });
        } else if (t < c3) {
          const u = (t - c2) / (c3 - c2); const x = lerp(24.2, 15.6, u);
          hp = [x, stairY2(x) + bob, -4.6];
          rig(cam, [[c2, [31, 1.6, 7], [22, 2.5, -5], 34], [c3, [21, 7, 6], [16, 7.5, -6], 42]], t, 1);
          W.ninjas.forEach((n, i) => { const nx = x + 2.2 + i * 1.5; n.position.set(nx, stairY2(nx) + bob * 0.8, -4.6 - (i - 1) * 0.5); n.rotation.y = -Math.PI / 2; });
        } else if (t < c4) {
          const u = (t - c3) / (c4 - c3); const x = lerp(0.5, 8.5, u);
          hp = [x, 11 + bob, -13];
          const ang = lerp(-0.7, 0.6, ease(u));
          cam.position.set(x + Math.sin(ang) * 11, 5.2, -13 + Math.cos(ang) * 11);
          cam.lookAt(x, 11.9, -13);
          if (cam.fov !== 30) { cam.fov = 30; cam.updateProjectionMatrix(); }
          W.ninjas.forEach((n, i) => { const nx = x - 2.6 - i * 1.4; n.position.set(nx, 11 + bob * 0.8, -13.2); n.rotation.y = Math.PI / 2; });
        } else {
          pose = t < jump ? 'stand' : 'walk';
          if (t < jump) {
            hp = [9.6, 9, 6];
            rig(cam, [[c4, [-9, 3, 19], [7, 6, 6], 36], [jump, [-5, 4.5, 17], [9, 8, 6], 30]], t, 0.8);
          } else {
            const u = clamp((t - jump) / (boom - jump));
            hp = [lerp(9.6, 1, u), 9 + 3.2 * Math.sin(u * Math.PI) - 9.6 * u * u + 0.85 * u, lerp(6, 7, u)];
            // Kran über das Becken, Blick senkrecht nach unten
            rig(cam, [[jump, [3, 13, 16], [5, 6, 7], 40], [boom, [1.2, 17, 7.6], [1, 0.8, 7], 46]], t, 0.4);
            full = u > 0.35;
            host.grp.rotation.z = 0;
          }
          W.ninjas.forEach((n, i) => { n.position.set(12.8 + (i - 1) * 1.4, 0, 9.5); n.lookAt(cam.position.x, 0, cam.position.z); });
        }
        host.grp.position.set(hp[0], hp[1], hp[2]);
        host.set(pose);
        host.face(cam, full);
        W.splash.visible = false;
        if (t > boom - 0.08) U.uFlash.value = clamp((t - (boom - 0.08)) / 0.08);
        return W.sc;
      }
      // Platsch → Studio
      const d = t - boom;
      U.uFlash.value = clamp(1 - d / 0.45) * 0.9;
      U.uFlashCol.value.set(d < 0.12 ? '#ffffff' : '#bfefff');
      const beat2 = (t - boom) / spb;
      S.ring.material.opacity = clamp(1 - d / 2.2);
      const rr = 1 + d * 9; S.ring.scale.set(rr, rr, rr);
      const cam = E.cam;
      if (d < 4) rig(cam, [[0, [0, 26, 7.5], [0, 0, 4], 46], [0.3, [0, 24, 8], [0, 0, 3], 46], [2 * bar / 1, [0, 3.4, 21], [0, 5.5, -8], 40], [4, [3, 3.8, 20], [0, 6, -8], 40]], d, 0.5);
      else { const a = Math.sin((d - 4) * 0.12) * 0.32; cam.position.set(Math.sin(a) * 21 + 3 * Math.cos(d * 0.1), 3.8 + Math.sin(d * 0.2) * 0.6, Math.cos(a) * 21); cam.lookAt(0, 6, -8); }
      const lines = t > tl.lines;
      studioTick(T, S, t, beat2, lines ? 'fan' : 'sweep', { heads: d < 0.8 ? 2 : 0.9, strobe: d < 2.5 || (t > tl.lines + (c.si.lines.length - 1) * tl.line && t < tl.lines + c.si.lines.length * tl.line + 1.5), fog: 0.6 });
      // Eingangs-Fanfare: Kegel auf die Ringmitte
      if (d < 0.9) S.heads.forEach((hd) => aim(T, hd, new T.Vector3(0, 0, 4), 1.6));
      return S.sc;
    },
  };
}

// ---- Personen: Treppenabgang (Moderation), Hero-Shot (Teams, Co-Moderation), alle zusammen ----
function buildPerson(T, c, o, S, tl, spb) {
  const HIT = o.hit || 1.7;
  const mode = o.mode;
  const fig = figure(T, S.sc, o.figures || {}, mode === 'team' ? 2.3 : 1.85);
  // Alle zusammen: Moderation und Co-Moderation stehen vorn mit Mikro
  const duo = mode === 'all' ? [fig, o.figures2 ? figure(T, S.sc, o.figures2, 1.85) : null].filter(Boolean) : [];
  duo.forEach((f, i) => { f.grp.position.set(duo.length > 1 ? (i ? 1.6 : -1.6) : 0, 0, 3.4); });
  const teamCol = new T.Color(o.color || c.L.a);
  const k = o.k || 0;
  const stairs = mode === 'host' || mode === 'coHost';
  const topY = S.STEPS * S.RISE; const topZ = -S.STEPS * S.RUN - 0.8;
  const stepPos = (i) => [0, (S.STEPS - i) * S.RISE, -(S.STEPS - i) * S.RUN + 0.5]; // i=0 oben … STEPS unten
  if (mode === 'team') {
    S.pod.visible = true;
    fig.grp.position.set(0, 0.45, 3.2);
  }
  const rigsTeam = [
    (d) => { const a = lerp(-0.75, 0.25, easeOut(d / 5)); return [[Math.sin(a) * 9, 1.6, 3.2 + Math.cos(a) * 9], [0, 1.7, 3.2], 34]; },
    (d) => { const u = easeOut(d / 2.4); return [[0, lerp(15, 1.9, u), lerp(13, 10, u)], [0, lerp(0, 1.7, u), 3.2], 36]; },
    (d) => { const u = easeOut(d / 3); return [[0.6, lerp(3.4, 1.7, u), lerp(26, 9, u)], [0, 1.7, 3.2], lerp(26, 34, u)]; },
    (d) => { const u = ease(clamp((d - 0.4) / 1.5)); return [[2.2, 2.4, 11], [0, lerp(11.5, 1.7, u), lerp(-12, 3.2, u)], 34]; },
    (d) => { const a = d * 0.9 + 0.8; const y = lerp(13, 2.2, easeOut(d / 2.6)); const r = lerp(4, 9, easeOut(d / 2.6)); return [[Math.cos(a) * r, y, 3.2 + Math.sin(a) * r], [0, 1.6, 3.2], 38]; },
    (d) => { const u = easeOut(d / 3.2); return [[lerp(-10, -3.4, u), lerp(0.5, 1.3, u), lerp(6, 9.4, u)], [0, 1.9, 3.2], 32]; },
  ];
  return {
    scene: S.sc,
    update(t) {
      const U = E.grade.uniforms;
      const cam = E.cam;
      const beat = (t - HIT) / spb;
      U.uLetter.value = 0.06;
      if (t < 0.25) U.uFade.value = 1 - t / 0.25;
      if (t > HIT - 0.04 && t < HIT + 0.4) U.uFlash.value = clamp(1 - (t - HIT) / 0.4) * 0.8;
      if (stairs) {
        // Kran: von hoch hinten über die Treppe nach vorn
        const walkT0 = HIT + 0.35; const per = spb / 2;
        const i = clamp(Math.floor((t - walkT0) / per), -1, S.STEPS);
        const f = clamp(((t - walkT0) % per) / per);
        let p;
        if (t < walkT0) p = [0, topY, topZ];
        else if (i >= S.STEPS) p = [0, 0, lerp(0.5, 2.2, easeOut((t - walkT0 - S.STEPS * per) / 1.2))];
        else { const a = i < 0 ? [0, topY, topZ] : stepPos(i); const b = stepPos(i + 1); p = [0, lerp(a[1], b[1], f) + Math.sin(f * Math.PI) * 0.12, lerp(a[2], b[2], f)]; }
        fig.grp.position.set(p[0], p[1], p[2]);
        const walking = t >= walkT0 && t < walkT0 + S.STEPS * per + 1.0;
        fig.set(walking ? (Math.floor((t - walkT0) / per) % 2 ? 'walk' : 'stand') : (t < walkT0 ? 'stand' : 'mic'));
        const sx = mode === 'coHost' ? 1 : 0; // Co-Moderation: Kran kommt von der Seite
        if (t < HIT) rig(cam, sx ? [[0, [-26, 15, -10], [0, 6, -14], 44], [HIT, [-6, 8, 9], [0, 5.2, -12], 38]] : [[0, [0, 21, -30], [0, 6, -14], 44], [HIT, [0, 8.5, 9], [0, 5.2, -12], 38]], t, 0);
        else {
          const look = new T.Vector3(p[0], p[1] + 1.1, p[2]);
          const u = easeOut((t - HIT) / 4.5);
          cam.position.set(lerp(sx * -6, sx * -2.4, u) + Math.sin(t * 0.25) * 0.8, lerp(sx ? 8 : 8.5, 1.9, u), lerp(9, 8.2, u));
          cam.lookAt(look);
          if (cam.fov !== 32) { cam.fov = 32; cam.updateProjectionMatrix(); }
        }
        fig.face(cam);
        // Rücklicht oben (Silhouette), danach Verfolger
        const sil = t < HIT;
        fig.m.material.emissiveIntensity = sil ? 0.02 : lerp(0.15, 0.6, clamp((t - HIT) / 0.6));
        fig.rim.material.uniforms.uI.value = sil ? 3 : 1.2;
        fig.rim.material.uniforms.uCol.value.set('#ffe7b8');
        const tgt = new T.Vector3(p[0], p[1], p[2]);
        S.follow.forEach((b, j) => { aim(T, b, tgt, t > HIT ? 1.4 : 0); S.spots[j].intensity = t > HIT ? 5 : 0; S.spots[j].target.position.copy(tgt); });
        // Stufen: vor dem Einschlag von oben nach unten im Sechzehntel, dann Lauf im Beat
        const ledFn = (si) => {
          if (t < HIT) { const lit = Math.floor(t / (spb / 4)); return (S.STEPS - 1 - si) <= lit ? 2.6 : 0.08; }
          if (t < HIT + 0.3) return 4.5;
          const under = Math.floor(clamp((t - walkT0) / per, 0, S.STEPS));
          const at = S.STEPS - 1 - under;
          return 0.35 + (si === at || si === at + 1 ? 3.5 : 0) + 1.4 * Math.exp(-((((beat - si * 0.08) % 1) + 1) % 1) * 4);
        };
        studioTick(T, S, t, beat, 'sweep', { heads: t < HIT ? 0.4 : 0.9, fog: 1, ledFn, headsAt: t < HIT ? new T.Vector3(0, topY, topZ) : null, ledCol: new T.Color('#fff3dc') });
        return S.sc;
      }
      if (mode === 'all') {
        duo.forEach((f) => { f.set(t < 1.2 ? 'stand' : 'mic'); f.face(cam); f.rim.material.uniforms.uI.value = 1.4; f.rim.material.uniforms.uCol.value.set('#ffe7b8'); });
        const mid = new T.Vector3(0, 0, 3.4);
        S.follow.forEach((b, j) => { aim(T, b, duo[j] ? duo[j].grp.position : mid, 1.2); S.spots[j].intensity = 4; S.spots[j].target.position.copy(duo[j] ? duo[j].grp.position : mid); });
        rig(cam, [[0, [0, 2.5, 26], [0, 6, -8], 44], [6, [0, 4, 19], [0, 6.5, -8], 40]], t, 0.5);
        const hue = new T.Color().setHSL((t * 0.15) % 1, 0.9, 0.6);
        studioTick(T, S, t, (t - 0.1) / spb, 'fan', { heads: 1.1, strobe: t < 3.5, fog: 0.6, headCol: t < 4 ? null : hue });
        return S.sc;
      }
      // Hero-Shot auf dem Podest
      const d = t;
      const [p, l, fov] = rigsTeam[k % 6](d);
      cam.position.set(p[0], p[1], p[2]); cam.lookAt(l[0], l[1], l[2]);
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      fig.set('main');
      fig.face(cam);
      const lit = t >= HIT;
      fig.m.material.emissiveIntensity = lit ? 0.32 : 0.0;
      fig.m.material.color.set(lit ? '#ffffff' : '#000000');
      fig.rim.material.uniforms.uCol.value.copy(teamCol);
      fig.rim.material.uniforms.uI.value = lit ? 2.2 + Math.exp(-((beat % 1 + 1) % 1) * 4) * 1.5 : 1.6;
      fig.grp.position.y = 0.45 + Math.sin(t * 1.4) * 0.03 + (lit ? 0 : -0.2 * clamp(1 - t / HIT));
      S.podRing.material.color.copy(teamCol).multiplyScalar(lit ? 6 : 2);
      S.rimL.forEach((s) => { s.color.copy(teamCol); s.intensity = lit ? 6 : 1.5; s.target.position.set(0, 1.5, 3.2); });
      const tgt = new T.Vector3(0, 0.5, 3.2);
      S.follow.forEach((b, j) => { aim(T, b, tgt, lit ? 1 : 0); S.spots[j].intensity = lit ? 3 : 0; S.spots[j].target.position.copy(tgt); });
      const ledFn = (si) => (lit ? 0.4 + 2 * Math.exp(-((((beat * 2 - si * 0.25) % 2) + 2) % 2) * 3) : 0.2);
      studioTick(T, S, t, beat, lit ? 'fan' : 'sweep', { heads: lit ? 0.9 : 0.3, headCol: teamCol, ledCol: teamCol, bulbCol: new T.Color('#ffd9a0'), fog: 0.5, headsAt: lit ? null : new T.Vector3(0, 1, 3.2), strobe: lit && t < HIT + 1.2 });
      return S.sc;
    },
  };
}
