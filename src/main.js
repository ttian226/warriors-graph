import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { avatarCanvas } from './avatar.js';
import { CLANS, RELS, STAGES, STATUS, arcById, cats, edges, catById, relIndex, displayName, relationsOf } from './data.js';

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
const avatarSize = (nd) => 9 + Math.sqrt(nd.deg) * 2;

const avatarScene = new THREE.Scene();
const avatarTextures = new Map();
function avatarTexture(cat) {
  const cv = avatarCanvas(cat.pelt, CLANS[cat.home]?.color || '#c4c8d4');
  if (!avatarTextures.has(cv)) {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    avatarTextures.set(cv, tex);
  }
  return avatarTextures.get(cv);
}

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

  // 拉近后显示的猫脸头像（LOD）：放在 avatarScene 里，辉光之后再画，避免被晕成白光
  const avatar = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: avatarTexture(nd.cat), transparent: true, opacity: 0, depthWrite: false }),
  );
  const a = avatarSize(nd);
  avatar.scale.set(a, a, 1);
  avatar.renderOrder = 2;
  avatar.visible = false;
  avatarScene.add(avatar);

  // 标签用 HTML 渲染：不被辉光晕糊，iPad 上文字清晰
  const div = document.createElement('div');
  div.className = 'star-label';
  div.textContent = displayName(nd.cat);
  const label = new CSS2DObject(div);
  label.center.set(0.5, 0);
  label.position.y = -avatarSize(nd) * 0.55;
  label.visible = false;
  group.add(label);

  nd.__sprite = sprite;
  nd.__avatar = avatar;
  nd.__label = label;
  nd.__focus = 1;
  return group;
}

// —— 图 ——
const el = document.getElementById('graph');
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
const avatarPass = new RenderPass(avatarScene, graph.camera());
avatarPass.clear = false;
graph.postProcessingComposer().addPass(avatarPass);
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

function select(id, { fly = true } = {}) {
  const nd = nodeById.get(id);
  if (!nd) return;
  selectedId = id;
  controls.autoRotate = false;
  focusSet = new Set([id, ...relIndex.get(id).map((r) => r.other)]);
  applyHighlight();
  if (fly) flyTo(nd);
  renderPanel(nd.cat);
}

function clearSelection() {
  if (!selectedId) return;
  selectedId = null;
  focusSet = new Set();
  applyHighlight();
  panel.hidden = true;
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
    nd.__focus = on ? 1 : 0.07;
    const k = nd.id === selectedId ? 1.25 : 1;
    nd.__sprite.scale.set(starSize(nd) * k, starSize(nd) * k, 1);
    nd.__avatar.scale.set(avatarSize(nd) * k, avatarSize(nd) * k, 1);
    nd.__label.element.classList.toggle('selected', nd.id === selectedId);
  }
  graph
    .linkMaterial((l) => linkMats[`${l.type}:${linkState(l)}`])
    .linkDirectionalParticles((l) => (linkState(l) === 'hl' ? 3 : 0));
  updateLod();
  updateLabels(true);
}

function flyTo(nd, ms = 1200) {
  const dist = 150;
  const len = Math.hypot(nd.x, nd.y, nd.z) || 1;
  const r = 1 + dist / len;
  graph.cameraPosition({ x: nd.x * r, y: nd.y * r, z: nd.z * r }, { x: nd.x, y: nd.y, z: nd.z }, ms);
}

graph.onNodeClick((nd) => select(nd.id));
graph.onBackgroundClick(() => clearSelection());

// 名字标签：选中的猫及其邻居，或离相机很近的星
const NEAR = 165; // 与头像 LOD 的过渡区间中点一致：看得到脸就看得到名字
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

// 头像 LOD：相机距离在 AVATAR_FAR→AVATAR_NEAR 之间时，星点渐隐、猫脸渐显
const AVATAR_FAR = 200;
const AVATAR_NEAR = 130;
function updateLod() {
  const cam = graph.camera().position;
  for (const nd of nodes) {
    if (!nd.__sprite || nd.x === undefined) continue;
    const d = Math.hypot(cam.x - nd.x, cam.y - nd.y, cam.z - nd.z);
    const t = Math.min(1, Math.max(0, (AVATAR_FAR - d) / (AVATAR_FAR - AVATAR_NEAR)));
    const ease = t * t * (3 - 2 * t);
    nd.__sprite.material.opacity = (1 - 0.85 * ease) * nd.__focus;
    // 合成在线性空间进行，低透明度经 sRGB 输出会被放大，所以压暗的头像要用更小的系数
    nd.__avatar.material.opacity = ease * (nd.__focus === 1 ? 1 : 0.012);
    nd.__avatar.visible = ease > 0.01;
    if (nd.__avatar.visible) nd.__avatar.position.set(nd.x, nd.y, nd.z);
  }
}

// FPS 计数
const fpsEl = document.getElementById('fps');
let fpsFrames = 0;
let fpsT = performance.now();
(function loop() {
  updateLod();
  updateLabels();
  fpsFrames++;
  const now = performance.now();
  if (now - fpsT >= 1000) {
    fpsEl.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsT))} fps · ${nodes.length} 星`;
    fpsFrames = 0;
    fpsT = now;
  }
  requestAnimationFrame(loop);
})();

addEventListener('resize', () => {
  graph.width(innerWidth).height(innerHeight);
});

// —— 详情面板 ——
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panelBody');
document.getElementById('panelClose').addEventListener('click', () => clearSelection());

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

function nameHtml(nm) {
  if (!nm.zh) return nm.stage === 'kit' ? esc(nm.en) : `${esc(nm.en)} <span class="tag">待译</span>`;
  return `${esc(nm.zh)}${nm.check ? ' <span class="tag">待核</span>' : ''}`;
}

const avatarUrls = new Map();
function avatarUrl(cat) {
  const cv = avatarCanvas(cat.pelt, CLANS[cat.home]?.color || '#c4c8d4');
  if (!avatarUrls.has(cv)) avatarUrls.set(cv, cv.toDataURL());
  return avatarUrls.get(cv);
}

function catChip(id) {
  const cat = catById.get(id);
  const clan = CLANS[cat.home];
  return `<button class="chip" data-id="${esc(id)}"><span class="dot" style="color:${clan?.color}"></span>${esc(displayName(cat))}</button>`;
}

function renderPanel(cat) {
  const last = cat.names.at(-1);
  const names = cat.names
    .map((nm) => `<span class="chip"><span class="stage">${STAGES[nm.stage] || ''}</span>${nameHtml(nm)}</span>`)
    .join('<span class="arrow">→</span>');
  // Wiki 的族群经历不保证时间顺序，这里只列出，不画箭头
  const clans = cat.clans
    .map((c) => `<span class="chip"><span class="dot" style="color:${CLANS[c.clan]?.color}"></span>${CLANS[c.clan]?.zh || esc(c.clan)}${c.note ? `<span class="stage">${esc(c.note)}</span>` : ''}</span>`)
    .join('');
  const arcs = cat.arcs.map((a) => `<span class="chip">${arcById.get(a)?.zh || a}</span>`).join('');
  const rels = Object.entries(relationsOf(cat.id))
    .filter(([, ids]) => ids.length)
    .map(([k, ids]) => `<h3>${k}</h3><div class="chips">${ids.map((id) => catChip(id)).join('')}</div>`)
    .join('');
  const death = cat.status === 'dead' && cat.deathArc ? `（死于${arcById.get(cat.deathArc)?.zh || cat.deathArc}）` : '';
  const meta = [{ male: '公猫', female: '母猫' }[cat.gender], STATUS[cat.status] + death, CLANS[cat.home]?.zh].filter(Boolean);

  panelBody.innerHTML = `
    <img class="avatar" src="${avatarUrl(cat)}" alt="" />
    <h2>${nameHtml(last)}</h2>
    <div class="en">${esc(cat.names.map((nm) => nm.en).join(' → '))}</div>
    <div class="meta">${meta.join(' · ')}</div>
    <h3>名字</h3><div class="chips">${names}</div>
    <h3>族群经历</h3><div class="chips">${clans || '<span class="meta">暂无记录</span>'}</div>
    ${arcs ? `<h3>出场</h3><div class="chips">${arcs}</div>` : ''}
    ${rels || '<h3>关系</h3><div class="meta">暂无记录</div>'}
  `;
  panel.hidden = false;
  panel.scrollTop = 0;
}

panelBody.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-id]');
  if (btn) select(btn.dataset.id);
});

// —— 搜索 ——
const searchEl = document.getElementById('search');
const resultsEl = document.getElementById('results');
const searchIndex = cats.map((cat) => ({
  id: cat.id,
  keys: cat.names.flatMap((nm) => [nm.en.toLowerCase(), nm.zh || '']).filter(Boolean),
}));

searchEl.addEventListener('input', () => {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) {
    resultsEl.hidden = true;
    return;
  }
  const hits = searchIndex.filter((s) => s.keys.some((k) => k.includes(q))).slice(0, 8);
  resultsEl.innerHTML = hits.length
    ? hits
        .map((h) => {
          const cat = catById.get(h.id);
          const clan = CLANS[cat.home];
          return `<li data-id="${esc(h.id)}"><img class="avatar-sm" src="${avatarUrl(cat)}" alt="" />${esc(displayName(cat))}<span class="sub">${esc(cat.names.at(-1).en)} · ${clan?.zh || ''}</span></li>`;
        })
        .join('')
    : '<li class="sub">没有找到</li>';
  resultsEl.hidden = false;
});

resultsEl.addEventListener('click', (ev) => {
  const li = ev.target.closest('li[data-id]');
  if (!li) return;
  searchEl.value = '';
  resultsEl.hidden = true;
  searchEl.blur();
  select(li.dataset.id);
});

// —— 图例 ——
const usedClans = [...new Set(nodes.map((nd) => nd.clan))];
document.getElementById('legend').innerHTML = `
  <div class="row">${usedClans.map((k) => `<span><i class="dot" style="color:${CLANS[k]?.color}"></i>${CLANS[k]?.zh || k}</span>`).join('')}</div>
  <div class="row">${Object.values(RELS).map((r) => `<span><i class="bar" style="color:${r.color}"></i>${r.zh}</span>`).join('')}</div>
`;

// —— 工具 ——
function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(`wg:${key}`);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function writePref(key, value) {
  try {
    localStorage.setItem(`wg:${key}`, JSON.stringify(value));
  } catch {}
}
