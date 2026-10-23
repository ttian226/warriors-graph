// 星系视图（3D 主视图）
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CLANS, RELS, cats, edges, relIndex, displayName } from './data.js';
import { readPref, writePref } from './util.js';

const el = document.getElementById('graph');
let paused = false;

const nodes = cats.map((cat) => ({ id: cat.id, cat, clan: cat.home, deg: 0 }));
const nodeById = new Map(nodes.map((nd) => [nd.id, nd]));
const links = edges
  .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
  .map((e) => ({ ...e }));
for (const l of links) {
  nodeById.get(l.source).deg++;
  nodeById.get(l.target).deg++;
}

// —— 贴图与材质 ——
const starTexture = (() => {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.08, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();

const LINK_OPACITY = { normal: 0.14, hl: 0.75, dim: 0.025 };
const linkMats = {};
for (const [type, { color }] of Object.entries(RELS)) {
  for (const [state, opacity] of Object.entries(LINK_OPACITY)) {
    linkMats[`${type}:${state}`] = new THREE.LineBasicMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), state === 'hl' ? 0.1 : 0.45),
      transparent: true,
      opacity,
      depthWrite: false,
    });
  }
}

const starSize = (nd) => 10 + Math.sqrt(nd.deg) * 6;


function makeNodeObject(nd) {
  const group = new THREE.Group();
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: starTexture,
      color: CLANS[nd.clan]?.color || '#ffffff',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const s = starSize(nd);
  sprite.scale.set(s, s, 1);
  group.add(sprite);

  // 标签用 HTML 渲染：不被辉光晕糊，iPad 上文字清晰
  const div = document.createElement('div');
  div.className = 'star-label';
  div.textContent = displayName(nd.cat);
  const label = new CSS2DObject(div);
  label.center.set(0.5, 0);
  label.position.y = -starSize(nd) * 0.12;
  label.visible = false;
  group.add(label);

  nd.__sprite = sprite;
  nd.__label = label;
  return group;
}

// —— 图 ——
const graph = new ForceGraph3D(el, { controlType: 'orbit', extraRenderers: [new CSS2DRenderer()] })
  .backgroundColor('#04050c')
  .showNavInfo(false)
  .enableNodeDrag(false)
  .nodeLabel(() => '')
  .nodeThreeObject(makeNodeObject)
  .linkMaterial((l) => linkMats[`${l.type}:normal`])
  .linkDirectionalParticleWidth(1.6)
  .linkDirectionalParticleSpeed(0.006)
  .linkDirectionalParticleColor((l) => RELS[l.type].color)
  .cooldownTime(12000)
  .d3AlphaDecay(0.018)
  .d3VelocityDecay(0.35)
  .graphData({ nodes, links });

if (import.meta.env.DEV) window.__graph = graph; // 调试用

graph.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

graph.d3Force('charge').strength(-55);
graph
  .d3Force('link')
  .distance((l) => ({ mate: 18, parent: 28, adoptive: 32, mentor: 40 })[l.type] ?? 40)
  .strength((l) => ({ mate: 0.9, parent: 0.6, adoptive: 0.4, mentor: 0.25 })[l.type] ?? 0.25);
graph.d3Force('cluster', clusterForce(0.025));
graph.d3Force('gravity', gravityForce(0.012));

// 弱向心力：防止没有连线的猫飘得太远
function gravityForce(strength) {
  let ns = [];
  function force(alpha) {
    const k = strength * alpha;
    for (const nd of ns) {
      nd.vx -= nd.x * k;
      nd.vy -= nd.y * k;
      nd.vz -= nd.z * k;
    }
  }
  force.initialize = (n) => { ns = n; };
  return force;
}

function clusterForce(strength) {
  let ns = [];
  function force(alpha) {
    const acc = {};
    for (const nd of ns) {
      const a = (acc[nd.clan] ||= { x: 0, y: 0, z: 0, n: 0 });
      a.x += nd.x; a.y += nd.y; a.z += nd.z; a.n++;
    }
    const k = strength * alpha;
    for (const nd of ns) {
      const a = acc[nd.clan];
      nd.vx += (a.x / a.n - nd.x) * k;
      nd.vy += (a.y / a.n - nd.y) * k;
      nd.vz += (a.z / a.n - nd.z) * k;
    }
  }
  force.initialize = (n) => { ns = n; };
  return force;
}

// 远景星尘：与数据无关，只营造景深
{
  const count = 2500;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 1500 + Math.random() * 2500;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: '#7d88b0', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  graph.scene().add(dust);
}

// 辉光（可开关）
// 用不透明的 scene.background，否则 bloom 会把透明背景晕成灰雾
graph.scene().background = new THREE.Color('#04050c');
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.5, 0.1);
graph.postProcessingComposer().addPass(bloom);
graph.postProcessingComposer().addPass(new OutputPass());
const bloomBtn = document.getElementById('bloomBtn');
let bloomOn = readPref('bloom', true);
applyBloom();
bloomBtn.addEventListener('click', () => {
  bloomOn = !bloomOn;
  writePref('bloom', bloomOn);
  applyBloom();
});
function applyBloom() {
  bloom.enabled = bloomOn;
  bloomBtn.textContent = bloomOn ? '辉光 开' : '辉光 关';
}

// 开场：从近处看星系成形，然后缓慢自转，触摸即停
const controls = graph.controls();
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
let touched = false;
controls.addEventListener('start', () => {
  touched = true;
  controls.autoRotate = false;
});
graph.cameraPosition({ x: 0, y: 60, z: 420 });
graph.onEngineStop(() => {
  if (!touched && !selectedId) graph.zoomToFit(1600, 60);
});

// —— 选中与聚焦 ——
let selectedId = null;
let focusSet = new Set();

function select(id, { fly = true, force = false } = {}) {
  const nd = nodeById.get(id);
  if (!nd) return;
  const changed = id !== selectedId;
  selectedId = id;
  controls.autoRotate = false;
  focusSet = new Set([id, ...relIndex.get(id).map((r) => r.other)]);
  applyHighlight();
  if (fly && (changed || force)) flyTo(nd);
}

function clearSelection() {
  if (!selectedId) return;
  selectedId = null;
  focusSet = new Set();
  applyHighlight();
  graph.zoomToFit(1200, 60);
}

function linkKey(l) {
  const s = typeof l.source === 'object' ? l.source.id : l.source;
  const t = typeof l.target === 'object' ? l.target.id : l.target;
  return [s, t];
}

function linkState(l) {
  if (!selectedId) return 'normal';
  const [s, t] = linkKey(l);
  return s === selectedId || t === selectedId ? 'hl' : 'dim';
}

function applyHighlight() {
  for (const nd of nodes) {
    if (!nd.__sprite) continue;
    const on = !selectedId || focusSet.has(nd.id);
    nd.__sprite.material.opacity = on ? 1 : 0.07;
    const k = nd.id === selectedId ? 1.25 : 1;
    nd.__sprite.scale.set(starSize(nd) * k, starSize(nd) * k, 1);
    nd.__label.element.classList.toggle('selected', nd.id === selectedId);
  }
  graph
    .linkMaterial((l) => linkMats[`${l.type}:${linkState(l)}`])
    .linkDirectionalParticles((l) => (linkState(l) === 'hl' ? 3 : 0));
  updateLabels(true);
}

function flyTo(nd, ms = 1200) {
  const dist = 150;
  const len = Math.hypot(nd.x, nd.y, nd.z) || 1;
  const r = 1 + dist / len;
  graph.cameraPosition({ x: nd.x * r, y: nd.y * r, z: nd.z * r }, { x: nd.x, y: nd.y, z: nd.z }, ms);
}

graph.onNodeClick((nd) => handlers.onPick(nd.id));
graph.onBackgroundClick(() => handlers.onBackground());

// 名字标签：选中的猫及其邻居，或离相机很近的星
const NEAR = 90;
let frame = 0;
function updateLabels(force = false) {
  if (!force && frame++ % 6) return;
  const cam = graph.camera().position;
  for (const nd of nodes) {
    if (!nd.__label || nd.x === undefined) continue;
    const near = Math.hypot(cam.x - nd.x, cam.y - nd.y, cam.z - nd.z) < NEAR;
    nd.__label.visible = focusSet.has(nd.id) || (near && !selectedId);
  }
}


// FPS 计数
const fpsEl = document.getElementById('fps');
let fpsFrames = 0;
let fpsT = performance.now();
(function loop() {
  requestAnimationFrame(loop);
  if (paused) return;
  updateLabels();
  fpsFrames++;
  const now = performance.now();
  if (now - fpsT >= 1000) {
    fpsEl.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsT))} fps · ${nodes.length} 星`;
    fpsFrames = 0;
    fpsT = now;
  }
})();

addEventListener('resize', () => {
  graph.width(innerWidth).height(innerHeight);
});

// 切到家谱视图时暂停渲染，省电
function pause() {
  paused = true;
  graph.pauseAnimation();
}
function resume() {
  paused = false;
  graph.resumeAnimation();
}

const handlers = { onPick: () => {}, onBackground: () => {} };
export function initGalaxy(h) {
  Object.assign(handlers, h);
  return { select, clear: clearSelection, pause, resume };
}

