// 入口：URL hash 路由（#galaxy[/猫] 或 #family/猫），在两个视图之间切换
import { CLANS, RELS, cats, catById, displayName } from './data.js';
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

function applyHash() {
  const next = parseHash();
  const viewChanged = next.view !== state.view;
  Object.assign(state, next);
  document.body.dataset.view = state.view;
  galaxyTools.hidden = state.view !== 'galaxy';
  familyTools.hidden = state.view !== 'family';
  legend.hidden = state.view !== 'galaxy';
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

// 图例
const usedClans = [...new Set(cats.map((c) => c.home))];
legend.innerHTML = `
  <div class="row">${usedClans.map((k) => `<span><i class="dot" style="color:${CLANS[k]?.color}"></i>${CLANS[k]?.zh || k}</span>`).join('')}</div>
  <div class="row">${Object.values(RELS).map((r) => `<span><i class="bar" style="color:${r.color}"></i>${r.zh}</span>`).join('')}</div>
`;

applyHash();
