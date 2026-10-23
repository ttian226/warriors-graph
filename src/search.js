// 搜索：任意阶段的中英文名
import { CLANS, cats, catById, displayName } from './data.js';
import { esc, avatarUrl } from './util.js';

export function initSearch({ onPick }) {
  const searchEl = document.getElementById('search');
  const resultsEl = document.getElementById('results');
  const index = cats.map((cat) => ({
    id: cat.id,
    keys: cat.names.flatMap((nm) => [nm.en.toLowerCase(), nm.zh || '']).filter(Boolean),
  }));

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim().toLowerCase();
    if (!q) {
      resultsEl.hidden = true;
      return;
    }
    const hits = index.filter((s) => s.keys.some((k) => k.includes(q))).slice(0, 8);
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
    onPick(li.dataset.id);
  });
}
