import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MAX_ITEMS = 4;
const OVERLAP = 0.07;                    // items nestle slightly into each other, like reference 1
const SIGNATURE = ['strawberry', 'moe', 'strawberry', 'moe'];   // bottom -> top, reference 1
const NAMES = { moe: '萌物', strawberry: '草莓' };
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

const ui = {
  stage: $('stage'), canvas: $('scene'),
  loader: $('loader'), loaderFill: $('loaderFill'), loaderPct: $('loaderPct'), loaderMsg: $('loaderMsg'),
  hint: $('hint'), progress: [...$('progress').children], toast: $('toast'), rotateTip: $('rotateTip'),
  tray: $('tray'), moeBtn: $('moeBtn'), strawBtn: $('strawBtn'), milkBtn: $('milkBtn'), milkSub: $('milkSub'),
  undoBtn: $('undoBtn'),
  done: $('done'), doneKicker: $('doneKicker'), doneTitle: $('doneTitle'), againBtn: $('againBtn'), spinBtn: $('spinBtn'),
  soundBtn: $('soundBtn'), made: $('made'), bgm: $('bgm'), meow: $('meow'),
};

const state = { items: [], milk: false, finished: false, busy: false, ready: false, sound: true, made: 0 };
try { state.made = Number(localStorage.getItem('sunny-bird-tanghulu-made') || 0); } catch { /* private mode */ }

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
const key = new THREE.DirectionalLight(0xffffff, 1.45);
key.position.set(-3, 5, 6);
scene.add(key);
const rimLight = new THREE.DirectionalLight(0xe8fff0, 0.7);
rimLight.position.set(4, 2, -5);
scene.add(rimLight);
scene.add(new THREE.HemisphereLight(0xdff2ff, 0xe4f7d6, 0.55));

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const controls = new OrbitControls(camera, ui.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.9;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = Math.PI - 0.35;
controls.autoRotateSpeed = 2.4;

// ------------------------------------------------------------------ model handles
const model = {
  root: null, tpl: {}, placed: [], stackBase: 0, tipY: 4,
  milk: null, milkPivot: null, milkBottom: -0.2, milkHeight: 4,
  box: new THREE.Box3(), center: new THREE.Vector3(), fitDist: 12,
};

// ------------------------------------------------------------------ tweens
const tweens = [];
function tween(dur, update, done) {
  const t = { t0: performance.now(), dur: REDUCED ? Math.min(dur, 200) : dur, update, done };
  tweens.push(t);
  return t;
}
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeInQuad = (p) => p * p;
const easeOutBack = (p) => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

// ------------------------------------------------------------------ sugar sparkles (VFX only)
function makeSparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? 31 : 9;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const sparkTex = makeSparkTexture();
const SPARK_COLORS = { moe: [0xffffff, 0xd9c8ff, 0xffd84f, 0x9fe3ff], strawberry: [0xffffff, 0xff8a8f, 0xffe08a, 0x9be27a], milk: [0xffffff, 0xfff1c4, 0xffe08a, 0xbfe8ff] };
function burst(origin, n = 18, spread = 1.0, life = 900, palette = 'milk') {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const vel = [];
  const c = new THREE.Color();
  const pal = SPARK_COLORS[palette];
  for (let i = 0; i < n; i++) {
    pos.set([origin.x, origin.y, origin.z], i * 3);
    const a = Math.random() * Math.PI * 2;
    const up = 0.4 + Math.random() * 1.2;
    vel.push(new THREE.Vector3(Math.cos(a) * spread * (0.6 + Math.random()), up * spread, Math.sin(a) * spread * (0.6 + Math.random())));
    c.set(pal[i % pal.length]);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.22, map: sparkTex, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  let last = performance.now();
  tween(life, (p) => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const arr = geo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      vel[i].y -= 3.2 * dt;
      arr[i * 3] += vel[i].x * dt;
      arr[i * 3 + 1] += vel[i].y * dt;
      arr[i * 3 + 2] += vel[i].z * dt;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 1 - p * p;
  }, () => { scene.remove(pts); geo.dispose(); mat.dispose(); });
}

// ------------------------------------------------------------------ audio
let actx = null;
function blip(f0, f1, dur = 0.12, vol = 0.18, type = 'sine') {
  if (!state.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* audio unavailable */ }
}
function startBgm() {
  if (!state.sound) return;
  ui.bgm.volume = 0.35;
  ui.bgm.play().catch(() => {});
}
ui.soundBtn.addEventListener('click', () => {
  state.sound = !state.sound;
  ui.soundBtn.dataset.on = state.sound ? '1' : '0';
  if (state.sound) startBgm(); else ui.bgm.pause();
});
window.addEventListener('pointerdown', startBgm, { once: true });

// ------------------------------------------------------------------ load the Blender-built GLB
const loader = {
  shown: 0, phase: 0, done: false,
  set(p, msg) {
    ui.loaderFill.style.width = `${Math.round(this.shown * 100)}%`;
    ui.loaderPct.textContent = `${Math.round(this.shown * 100)}%`;
    if (msg) ui.loaderMsg.textContent = msg;
  },
  tickTo(target, msg) { this.shown += (target - this.shown) * 0.35; this.set(target, msg); },
};
new GLTFLoader().load(
  './assets/model/model-sunny-bird-tanghulu-runtime.glb',
  (gltf) => { loader.phase = 1; loader.tickTo(0.9, '裹上糖衣…'); setupModel(gltf.scene); },
  (ev) => loader.tickTo(ev.total ? 0.05 + 0.8 * (ev.loaded / ev.total) : 0.4, '正在熬糖…'),
  (err) => { loader.set(1, '糖熬糊了…刷新再试一次'); console.error(err); },
);

function setupModel(root) {
  model.root = root;
  scene.add(root);
  root.updateMatrixWorld(true);

  // item templates: detach from the scene, keep for cloning
  for (const kind of ['moe', 'strawberry']) {
    const tpl = root.getObjectByName(kind === 'moe' ? 'tpl_moe' : 'tpl_strawberry');
    tpl.removeFromParent();
    tpl.position.set(0, 0, 0);
    tpl.traverse((o) => {
      if (o.isMesh && o.material && o.material.name === 'halo_gold') o.material.emissiveIntensity = 0.35;
    });
    model.tpl[kind] = { obj: tpl, bottom: tpl.userData.stack_bottom, top: tpl.userData.stack_top };
  }
  const base = root.getObjectByName('stack_base');
  model.stackBase = base ? base.position.y : 0;
  const tip = root.getObjectByName('stick_tip');
  if (tip) model.tipY = tip.position.y;

  const milk = root.getObjectByName('milk_skin');
  milk.traverse((o) => {
    if (o.isMesh) {
      o.material.alphaTest = 0.5;
      o.material.transparent = false;
      o.material.side = THREE.DoubleSide;
    }
  });
  root.updateMatrixWorld(true);
  model.box.setFromObject(root);           // skewer + full milk sheet = framing box
  model.box.expandByPoint(new THREE.Vector3(0, model.tipY + 0.1, 0));
  model.box.getCenter(model.center);

  const mb = new THREE.Box3().setFromObject(milk);
  model.milkBottom = mb.min.y;
  model.milkHeight = mb.max.y - mb.min.y;
  const pivot = new THREE.Group();
  pivot.position.set(0, mb.min.y, 0);
  milk.parent.add(pivot);
  pivot.updateMatrixWorld(true);
  pivot.attach(milk);
  model.milk = milk;
  model.milkPivot = pivot;

  resetBuild(false);
  onResize();
  frontView(false);
  loader.shown = 1;
  loader.set(1, '可以开串啦！');
  setTimeout(() => {
    loader.done = true;
    ui.loader.classList.add('hide');
    $('app').setAttribute('aria-hidden', 'false');
  }, 350);
  state.ready = true;
  window.__sceneReady = true;
}

// ------------------------------------------------------------------ camera framing
function onResize() {
  const w = ui.stage.clientWidth;
  const h = ui.stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (!model.root) return;
  const size = model.box.getSize(new THREE.Vector3());
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const distH = (size.y * 0.5) / Math.tan(vfov / 2);
  const distW = (Math.max(size.x, size.z) * 0.62) / Math.tan(hfov / 2);
  model.fitDist = Math.max(distH, distW) * 0.92 + 0.3;
  controls.minDistance = model.fitDist * 0.45;
  controls.maxDistance = model.fitDist * 1.5;
  controls.target.copy(model.center);
}
new ResizeObserver(onResize).observe(ui.stage);

function frontView(animated = true) {
  const to = new THREE.Vector3(model.center.x, model.center.y + model.fitDist * 0.08, model.center.z + model.fitDist);
  if (!animated) { camera.position.copy(to); controls.update(); return; }
  const sFrom = new THREE.Spherical().setFromVector3(camera.position.clone().sub(model.center));
  const sTo = new THREE.Spherical().setFromVector3(to.clone().sub(model.center));
  let dTheta = sTo.theta - sFrom.theta;
  dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
  tween(700, (p) => {
    const e = easeOutCubic(p);
    const s = new THREE.Spherical(
      sFrom.radius + (sTo.radius - sFrom.radius) * e,
      sFrom.phi + (sTo.phi - sFrom.phi) * e,
      sFrom.theta + dTheta * e,
    );
    camera.position.setFromSpherical(s).add(model.center);
  });
}

// ------------------------------------------------------------------ stacking
function stackCursor() {          // y where the next item's bottom will sit
  let cursor = model.stackBase;
  for (const it of model.placed) cursor = it.y + model.tpl[it.kind].top - OVERLAP;
  return cursor;
}

// ------------------------------------------------------------------ game flow
function resetBuild(withFx = true) {
  for (const it of model.placed) it.obj.removeFromParent();
  model.placed = [];
  state.items = [];
  state.milk = false;
  state.finished = false;
  state.busy = false;
  model.milk.visible = false;
  model.milkPivot.scale.set(1, 1, 1);
  controls.autoRotate = false;
  ui.done.classList.remove('show');
  ui.done.setAttribute('aria-hidden', 'true');
  ui.tray.style.visibility = '';
  ui.rotateTip.classList.remove('show');
  if (withFx) frontView(true);
  refreshUi();
}

function refreshUi() {
  const n = state.items.length;
  ui.progress.forEach((el, i) => { el.className = state.items[i] || ''; });
  ui.moeBtn.classList.toggle('is-full', n >= MAX_ITEMS);
  ui.strawBtn.classList.toggle('is-full', n >= MAX_ITEMS);
  ui.milkBtn.classList.toggle('is-locked', n === 0);
  ui.milkBtn.classList.toggle('is-ready', n > 0 && !state.milk);
  ui.milkSub.textContent = n === 0 ? '最后再加' : '收尾！';
  ui.undoBtn.hidden = n === 0 || state.milk;
  let hint = '点「萌物」或「草莓」，一颗颗串上签子';
  if (n > 0 && n < MAX_ITEMS) hint = `已串 ${n} 颗 · 可继续，或铺「奶皮」`;
  if (n >= MAX_ITEMS) hint = '串满啦！最后铺上「奶皮」';
  if (state.finished) hint = '拖动 360° 转着看你的糖葫芦';
  if (ui.hint.textContent !== hint) {
    ui.hint.textContent = hint;
    ui.hint.classList.remove('bump');
    void ui.hint.offsetWidth;
    ui.hint.classList.add('bump');
  }
  ui.made.innerHTML = state.made > 0 ? `已做<br>${state.made} 串` : '';
}

let toastTimer = 0;
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1700);
}
function shake(btn) {
  btn.classList.remove('shake');
  void btn.offsetWidth;
  btn.classList.add('shake');
}
function deny(btn, msg) {
  shake(btn);
  toast(msg);
  blip(300, 200, 0.12, 0.12);
}

function addItem(kind) {
  if (!state.ready || state.busy) return;
  const btn = kind === 'moe' ? ui.moeBtn : ui.strawBtn;
  if (state.finished || state.milk) { deny(btn, '这串已经裹好奶皮啦～点「再做一串」'); return; }
  if (state.items.length >= MAX_ITEMS) { deny(btn, '签子串满啦～最后铺上奶皮吧'); return; }

  const tpl = model.tpl[kind];
  const obj = tpl.obj.clone(true);
  const y = stackCursor() - tpl.bottom;
  model.root.add(obj);
  const item = { kind, obj, y };
  model.placed.push(item);
  state.items.push(kind);
  state.busy = true;

  const startY = model.tipY + 0.2 - tpl.bottom;
  const spin = new THREE.Quaternion();
  const axisY = new THREE.Vector3(0, 1, 0);
  obj.position.set(0, startY, 0);
  obj.scale.setScalar(0.001);
  if (kind === 'moe') blip(560, 920, 0.1, 0.16); else blip(420, 720, 0.1, 0.16, 'triangle');

  tween(780, (p) => {
    if (p < 0.22) {
      obj.scale.setScalar(Math.max(0.001, easeOutBack(p / 0.22)));
      obj.position.y = startY;
    } else {
      obj.scale.setScalar(1);
      const q = (p - 0.22) / 0.78;
      obj.position.y = startY + (y - startY) * easeInQuad(q);
      spin.setFromAxisAngle(axisY, (1 - easeOutCubic(q)) * Math.PI * 2);
      obj.quaternion.copy(spin);
    }
  }, () => {
    obj.position.y = y;
    obj.quaternion.identity();
    blip(240, 130, 0.09, 0.22);
    burst(new THREE.Vector3(0, y, 0.35), 14, 0.9, 700, kind);
    tween(240, (p) => {
      const s = Math.sin(p * Math.PI) * (1 - p);
      obj.scale.set(1 + 0.10 * s, 1 - 0.12 * s, 1 + 0.10 * s);
    }, () => { obj.scale.setScalar(1); state.busy = false; });
  });
  refreshUi();
}

function undo() {
  if (!state.ready || state.busy || state.milk || !model.placed.length) return;
  const it = model.placed.pop();
  state.items.pop();
  state.busy = true;
  const y0 = it.obj.position.y;
  blip(700, 380, 0.12, 0.14);
  tween(380, (p) => {
    it.obj.position.y = y0 + p * 1.2;
    it.obj.scale.setScalar(Math.max(0.001, 1 - easeInQuad(p)));
  }, () => { it.obj.removeFromParent(); state.busy = false; refreshUi(); });
  refreshUi();
}

function addMilk() {
  if (!state.ready || state.finished || state.busy || state.milk) return;
  if (state.items.length === 0) { deny(ui.milkBtn, '先串上萌物或草莓哦，奶皮要最后加～'); return; }
  state.busy = true;
  state.milk = true;
  const needTop = stackCursor() + OVERLAP + 0.22;
  const targetY = Math.min(1, (needTop - model.milkBottom) / model.milkHeight);
  const pv = model.milkPivot;
  model.milk.visible = true;
  pv.scale.set(0.35, 0.01, 1);
  blip(330, 660, 0.25, 0.14);
  tween(820, (p) => {
    const e = easeOutBack(p);
    pv.scale.set(0.35 + 0.65 * Math.min(1, e), Math.max(0.01, targetY * e), 1);
  }, () => {
    pv.scale.set(1, targetY, 1);
    finish();
  });
  refreshUi();
}

function finish() {
  state.finished = true;
  state.busy = false;
  state.made += 1;
  try { localStorage.setItem('sunny-bird-tanghulu-made', String(state.made)); } catch { /* ignore */ }
  if (state.sound) { ui.meow.currentTime = 0; ui.meow.play().catch(() => {}); }
  const top = stackCursor();
  for (let i = 0; i < 3; i++) {
    setTimeout(() => burst(new THREE.Vector3(0, model.stackBase + ((top - model.stackBase) * (i + 1)) / 3, 0.4), 26, 1.5, 1300, i === 1 ? 'strawberry' : 'moe'), i * 140);
  }
  const moe = state.items.filter((k) => k === 'moe').length;
  const straw = state.items.length - moe;
  const signature = state.items.length === SIGNATURE.length && state.items.every((k, i) => k === SIGNATURE[i]);
  ui.doneKicker.textContent = signature ? '招牌串 · 和图里一模一样！' : '完成一串！';
  const parts = [];
  if (moe) parts.push(`萌物 ×${moe}`);
  if (straw) parts.push(`草莓 ×${straw}`);
  ui.doneTitle.textContent = parts.join(' · ');
  controls.autoRotate = !REDUCED;
  ui.spinBtn.textContent = controls.autoRotate ? '暂停旋转' : '自动旋转';
  ui.tray.style.visibility = 'hidden';
  ui.done.classList.add('show');
  ui.done.setAttribute('aria-hidden', 'false');
  ui.rotateTip.classList.add('show');
  setTimeout(() => ui.rotateTip.classList.remove('show'), 3200);
  refreshUi();
}

ui.moeBtn.addEventListener('click', () => addItem('moe'));
ui.strawBtn.addEventListener('click', () => addItem('strawberry'));
ui.milkBtn.addEventListener('click', addMilk);
ui.undoBtn.addEventListener('click', undo);
ui.againBtn.addEventListener('click', () => resetBuild(true));
ui.spinBtn.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  ui.spinBtn.textContent = controls.autoRotate ? '暂停旋转' : '自动旋转';
});

// ------------------------------------------------------------------ loop
function frame(now) {
  if (!loader.done && loader.phase < 1) loader.tickTo(Math.min(0.85, loader.shown + 0.004));
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i];
    const p = Math.min(1, (now - t.t0) / t.dur);
    t.update(p);
    if (p >= 1) { tweens.splice(i, 1); t.done && t.done(); }
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__game = { state, addItem, addMilk, undo, resetBuild, controls, camera, model };
