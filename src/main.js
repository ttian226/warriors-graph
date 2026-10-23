// 入口：URL hash 路由（#galaxy[/猫] 或 #family/猫），在两个视图之间切换
import { ARCS, CLANS, RELS, cats, catById, displayName } from './data.js';
import { initGalaxy } from './galaxy.js';
import { initFamily } from './family.js';
import { initPanel } from './panel.js';
import { initSearch } from './search.js';
import { readPref, writePref } from './util.js';

const state = { view: 'galaxy', id: null };
const depth = { up: readPref('famUp', 2), down: readPref('famDown', 2) };

function navigate(view, id) {
  const hash = id ? `#${view}/${encodeURIComponent(id)}` : `#${view}`;
  if (location.hash === hash) applyHash();
  else location.hash = hash;
}

function parseHash() {
  const [view, raw] = location.hash.replace(/^#/, '').split('/');
  const id = raw ? decodeURIComponent(raw) : null;
  if (view === 'family' && catById.has(id)) return { view, id };
  return { view: 'galaxy', id: catById.has(id) ? id : null };
}

const galaxy = initGalaxy({
  onPick: (id) => navigate('galaxy', id),
  onBackground: () => navigate('galaxy', null),
});
const family = initFamily({ onPick: (id) => navigate('family', id) });
const panel = initPanel({
  onPick: (id) => navigate(state.view, id),
  onClose: () => (state.view === 'galaxy' ? navigate('galaxy', null) : (panel.hide(), family.refit())),
  onFamily: (id) => navigate('family', id),
  onLocate: (id) => navigate('galaxy', id),
});
initSearch({ onPick: (id) => navigate(state.view, id) });

const galaxyTools = document.getElementById('galaxyTools');
const familyTools = document.getElementById('familyTools');
const legend = document.getElementById('legend');
const bottom = document.getElementById('bottom');

function applyHash() {
  const next = parseHash();
  const viewChanged = next.view !== state.view;
  Object.assign(state, next);
  document.body.dataset.view = state.view;
  galaxyTools.hidden = state.view !== 'galaxy';
  familyTools.hidden = state.view !== 'family';
  bottom.hidden = state.view !== 'galaxy';
  family.el.hidden = state.view !== 'family';

  if (state.view === 'family') {
    galaxy.pause();
    panel.show(catById.get(state.id), 'family');
    renderFamily();
  } else {
    if (viewChanged) galaxy.resume();
    if (state.id) {
      galaxy.select(state.id, { force: viewChanged });
      panel.show(catById.get(state.id), 'galaxy');
    } else {
      galaxy.clear();
      panel.hide();
    }
  }
}

function renderFamily() {
  const count = family.show(state.id, depth.up, depth.down);
  document.getElementById('famTitle').textContent = `${displayName(catById.get(state.id))} 的家谱 · ${count} 只`;
  document.getElementById('upVal').textContent = depth.up;
  document.getElementById('downVal').textContent = depth.down;
}

// 家谱代数调整
familyTools.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-step]');
  if (!btn) {
    if (ev.target.closest('#backBtn')) navigate('galaxy', state.id);
    return;
  }
  const key = btn.dataset.dir;
  depth[key] = Math.max(0, Math.min(6, depth[key] + Number(btn.dataset.step)));
  writePref(key === 'up' ? 'famUp' : 'famDown', depth[key]);
  renderFamily();
});

addEventListener('hashchange', applyHash);
addEventListener('resize', () => family.refit());

// —— 图例兼筛选：点击族群 / 关系类型切换显示 ——
const hiddenClans = new Set();
const hiddenRels = new Set();
const clanCount = {};
for (const c of cats) clanCount[c.home] = (clanCount[c.home] || 0) + 1;
const usedClans = Object.keys(CLANS).filter((k) => clanCount[k]);
legend.innerHTML = `
  <div class="row">${usedClans.map((k) => `<button type="button" data-clan="${k}"><i class="dot" style="color:${CLANS[k].color}"></i>${CLANS[k].zh}</button>`).join('')}</div>
  <div class="row">${Object.entries(RELS).map(([k, r]) => `<button type="button" data-rel="${k}"><i class="bar" style="color:${r.color}"></i>${r.zh}</button>`).join('')}</div>
`;
legend.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  const [set, key] = btn.dataset.clan ? [hiddenClans, btn.dataset.clan] : [hiddenRels, btn.dataset.rel];
  set.has(key) ? set.delete(key) : set.add(key);
  btn.classList.toggle('off', set.has(key));
  galaxy.setFilter({ hiddenClans, hiddenRels });
});

// —— 时间轴：按部播放 ——
const tl = document.getElementById('timeline');
const tlToggle = document.getElementById('tlToggle');
const tlPlay = document.getElementById('tlPlay');
const tlRange = document.getElementById('tlRange');
const tlLabel = document.getElementById('tlLabel');
const debuts = galaxy.debutCounts();
tlRange.max = ARCS.length - 1;
let tlOn = false;
let playTimer = null;
const PLAY_STEP_MS = 2500;

function renderTimeline() {
  const i = Number(tlRange.value);
  tl.classList.toggle('active', tlOn);
  tlToggle.classList.toggle('on', tlOn);
  tlPlay.textContent = playTimer ? '❚❚' : '▶';
  tlLabel.innerHTML = tlOn ? `<b>${ARCS[i].zh}</b> · 新出场 ${debuts[i]}` : '显示全部';
  galaxy.setFilter({ timeline: tlOn ? i : null });
}

function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
}

tlToggle.addEventListener('click', () => {
  tlOn = !tlOn;
  if (!tlOn) stopPlay();
  renderTimeline();
});
tlRange.addEventListener('input', () => {
  tlOn = true;
  stopPlay();
  renderTimeline();
});
tlPlay.addEventListener('click', () => {
  if (playTimer) {
    stopPlay();
    renderTimeline();
    return;
  }
  // 从头播放（已在最后一部时也从头开始）
  tlOn = true;
  if (Number(tlRange.value) >= ARCS.length - 1) tlRange.value = 0;
  playTimer = setInterval(() => {
    if (Number(tlRange.value) >= ARCS.length - 1) {
      stopPlay();
    } else {
      tlRange.value = Number(tlRange.value) + 1;
    }
    renderTimeline();
  }, PLAY_STEP_MS);
  renderTimeline();
});
renderTimeline();

applyHash();
