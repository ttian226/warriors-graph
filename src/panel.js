// 详情面板：两个视图共用
import { CLANS, STAGES, STATUS, arcById, catById, displayName, relationsOf } from './data.js';
import { esc, avatarUrl } from './util.js';

const panel = document.getElementById('panel');
const panelBody = document.getElementById('panelBody');

function nameHtml(nm) {
  if (!nm.zh) return nm.stage === 'kit' ? esc(nm.en) : `${esc(nm.en)} <span class="tag">待译</span>`;
  return `${esc(nm.zh)}${nm.check ? ' <span class="tag">待核</span>' : ''}`;
}

function catChip(id) {
  const cat = catById.get(id);
  const clan = CLANS[cat.home];
  return `<button class="chip" data-id="${esc(id)}"><span class="dot" style="color:${clan?.color}"></span>${esc(displayName(cat))}</button>`;
}

export function initPanel({ onPick, onClose, onFamily, onLocate }) {
  document.getElementById('panelClose').addEventListener('click', () => onClose());
  panelBody.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.id) onPick(btn.dataset.id);
    else if (btn.dataset.action === 'family') onFamily(btn.dataset.cat);
    else if (btn.dataset.action === 'locate') onLocate(btn.dataset.cat);
  });

  function show(cat, view) {
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
    const id = esc(cat.id);

    panelBody.innerHTML = `
      <img class="avatar" src="${avatarUrl(cat)}" alt="" />
      <h2>${nameHtml(last)}</h2>
      <div class="en">${esc(cat.names.map((nm) => nm.en).join(' → '))}</div>
      <div class="meta">${meta.join(' · ')}</div>
      <div class="actions">
        <button class="action" data-action="family" data-cat="${id}" ${view === 'family' ? 'disabled' : ''}>看家谱</button>
        <button class="action" data-action="locate" data-cat="${id}" ${view === 'galaxy' ? 'disabled' : ''}>在星系中定位</button>
      </div>
      <h3>名字</h3><div class="chips">${names}</div>
      <h3>族群经历</h3><div class="chips">${clans || '<span class="meta">暂无记录</span>'}</div>
      ${arcs ? `<h3>出场</h3><div class="chips">${arcs}</div>` : ''}
      ${rels || '<h3>关系</h3><div class="meta">暂无记录</div>'}
    `;
    panel.hidden = false;
    panel.scrollTop = 0;
    document.body.classList.add('panel-open');
  }

  function hide() {
    panel.hidden = true;
    document.body.classList.remove('panel-open');
  }

  return { show, hide, isOpen: () => !panel.hidden };
}
