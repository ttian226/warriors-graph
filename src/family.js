// 家谱视图（2D 星座）：以一只猫为中心，往上 N 代祖先、往下 N 代后代
import cytoscape from 'cytoscape';
import elk from 'cytoscape-elk';
import { CLANS, RELS, catById, relIndex, displayName } from './data.js';
import { avatarUrl } from './util.js';

cytoscape.use(elk);

const rels = (id, rel) => (relIndex.get(id) || []).filter((r) => r.rel === rel).map((r) => r.other);

// 构建子图。「主干」= 祖先、中心、兄弟姐妹、后代；主干成员的另一位亲生父母作为「配偶」加入，但不再往外扩展
export function buildFamily(centerId, up, down) {
  const gen = new Map([[centerId, 0]]);
  const core = new Set([centerId]);

  let frontier = [centerId];
  for (let g = 1; g <= up; g++) {
    const next = [];
    for (const id of frontier) {
      for (const p of [...rels(id, '父母'), ...rels(id, '养父母')]) {
        if (gen.has(p)) continue;
        gen.set(p, -g);
        core.add(p);
        next.push(p);
      }
    }
    frontier = next;
  }

  if (up >= 1) {
    for (const p of rels(centerId, '父母')) {
      for (const s of rels(p, '子女')) {
        if (gen.has(s)) continue;
        gen.set(s, 0);
        core.add(s);
      }
    }
  }

  frontier = [centerId];
  for (let g = 1; g <= down; g++) {
    const next = [];
    for (const id of frontier) {
      for (const c of [...rels(id, '子女'), ...rels(id, '养子女')]) {
        if (gen.has(c)) continue;
        gen.set(c, g);
        core.add(c);
        next.push(c);
      }
    }
    frontier = next;
  }

  // 主干成员（中心以上的祖先除外，他们的父母已在 BFS 里处理）的另一位亲生父母
  for (const id of [...core]) {
    const g = gen.get(id);
    if (g < 0 || (g === 0 && up < 1 && id === centerId)) continue;
    for (const p of rels(id, '父母')) if (!gen.has(p)) gen.set(p, g - 1);
  }
  // 中心的伴侣（即使没有子女）
  for (const m of rels(centerId, '伴侣')) if (!gen.has(m)) gen.set(m, 0);

  const nodes = [];
  const edges = [];
  for (const [id, g] of gen) nodes.push({ id, kind: 'cat', gen: g, core: core.has(id) });

  // 结合点：同一组亲生父母共用一个；只知道一位父母时补「未知」
  const unions = new Map();
  const unionOf = (parents) => {
    const key = parents.join('|');
    if (!unions.has(key)) {
      const uid = `u:${key}`;
      unions.set(key, uid);
      nodes.push({ id: uid, kind: 'union', parents });
      for (const p of parents) edges.push({ source: p, target: uid, kind: 'couple' });
    }
    return unions.get(key);
  };

  for (const [id] of gen) {
    const parents = rels(id, '父母');
    const shown = parents.filter((p) => gen.has(p));
    if (!shown.length) continue;
    const list = [...shown];
    if (parents.length === 1) {
      const unknown = `?:${parents[0]}`;
      if (!nodes.some((n) => n.id === unknown)) nodes.push({ id: unknown, kind: 'unknown', partner: parents[0] });
      list.push(unknown);
    }
    const uid = unionOf(list.sort());
    edges.push({ source: uid, target: id, kind: 'descent' });
  }

  // 养亲：同一组养父母共用一个结合点（与亲生一样经过一跳，同代才能对齐）
  const adopts = new Map();
  for (const [id] of gen) {
    const parents = rels(id, '养父母').filter((p) => gen.has(p)).sort();
    if (!parents.length) continue;
    const key = parents.join('|');
    if (!adopts.has(key)) {
      const aid = `a:${key}`;
      adopts.set(key, aid);
      nodes.push({ id: aid, kind: 'adopt', parents });
      for (const p of parents) edges.push({ source: p, target: aid, kind: 'adoptive' });
    }
    edges.push({ source: adopts.get(key), target: id, kind: 'adoptive' });
  }

  // 没有共同子女的伴侣也连到一个结合点上，表示「一对」
  for (const m of rels(centerId, '伴侣')) {
    const key = [centerId, m].sort().join('|');
    if (![...unions.keys()].some((k) => k.split('|').includes(centerId) && k.split('|').includes(m))) unionOf(key.split('|'));
  }

  // 分层：第 g 代在 2(g-最小代) 层，结合点在父母下一层，「未知」与伴侣同层
  const minGen = Math.min(...gen.values());
  const catLayer = (id) => 2 * (gen.get(id) - minGen);
  for (const n of nodes) {
    if (n.kind === 'cat') n.layer = catLayer(n.id);
  }
  for (const n of nodes) {
    if (n.kind === 'unknown') n.layer = catLayer(n.partner);
  }
  for (const n of nodes) {
    if (n.kind === 'union' || n.kind === 'adopt') {
      n.layer = Math.max(...n.parents.map((p) => (p.startsWith('?:') ? catLayer(p.slice(2)) : catLayer(p)))) + 1;
    }
  }

  return { nodes, edges };
}

const STYLE = [
  {
    selector: 'node[kind = "cat"]',
    style: {
      width: 44,
      height: 44,
      shape: 'ellipse',
      'background-color': '#10131f',
      'background-image': 'data(img)',
      'background-fit': 'cover',
      'border-width': 2,
      'border-color': 'data(color)',
      'underlay-color': 'data(color)',
      'underlay-padding': 7,
      'underlay-opacity': 0.18,
      'underlay-shape': 'ellipse',
      label: 'data(label)',
      color: '#dfe3f2',
      'font-size': 11,
      'font-family': '-apple-system, "PingFang SC", sans-serif',
      'text-valign': 'bottom',
      'text-margin-y': 6,
      'text-outline-color': '#05060d',
      'text-outline-width': 2,
    },
  },
  { selector: 'node[kind = "cat"][!core]', style: { opacity: 0.75 } },
  {
    selector: 'node.center',
    style: { width: 64, height: 64, 'border-width': 3, 'underlay-opacity': 0.35, 'underlay-padding': 10, 'font-size': 14, 'font-weight': 600, color: '#fff' },
  },
  {
    selector: 'node[kind = "unknown"]',
    style: {
      width: 30,
      height: 30,
      shape: 'ellipse',
      'background-opacity': 0,
      'border-width': 1.5,
      'border-style': 'dashed',
      'border-color': 'rgba(190, 200, 240, 0.4)',
      label: '未知',
      color: 'rgba(190, 200, 240, 0.5)',
      'font-size': 10,
      'text-valign': 'bottom',
      'text-margin-y': 5,
    },
  },
  { selector: 'node[kind = "adopt"]', style: { width: 4, height: 4, 'background-color': RELS.adoptive.color, 'background-opacity': 0.6, 'border-width': 0 } },
  {
    selector: 'node[kind = "union"]',
    style: { width: 6, height: 6, 'background-color': RELS.parent.color, 'background-opacity': 0.9, 'border-width': 0 },
  },
  {
    selector: 'edge',
    style: {
      width: 1.4,
      'line-color': RELS.parent.color,
      opacity: 0.5,
      'curve-style': 'taxi',
      'taxi-direction': 'downward',
      'taxi-turn': '50%',
    },
  },
  // 父母→结合点用斜直线（V 字），同一行多对伴侣时不会叠成一条水平线
  { selector: 'edge[kind = "couple"]', style: { 'line-color': RELS.mate.color, opacity: 0.55, 'curve-style': 'straight' } },
  {
    selector: 'edge[kind = "adoptive"]',
    style: { 'line-color': RELS.adoptive.color, 'line-style': 'dashed', 'line-dash-pattern': [5, 4], opacity: 0.6 },
  },
];

const LAYOUT = {
  name: 'elk',
  // 按代数分区，保证同一代在同一行
  nodeLayoutOptions: (n) => ({ 'elk.partitioning.partition': n.data('layer') }),
  fit: true,
  padding: 40,
  animate: true,
  animationDuration: 450,
  elk: {
    algorithm: 'layered',
    'elk.partitioning.activate': true,
    'elk.direction': 'DOWN',
    'elk.spacing.nodeNode': 28,
    'elk.layered.spacing.nodeNodeBetweenLayers': 34,
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  },
};

export function initFamily({ onPick }) {
  const el = document.getElementById('family');
  let cy = null;

  function ensure() {
    if (cy) return cy;
    cy = cytoscape({
      container: el,
      style: STYLE,
      minZoom: 0.2,
      maxZoom: 3,
      boxSelectionEnabled: false,
      autoungrabify: true,
    });
    cy.on('tap', 'node[kind = "cat"]', (ev) => onPick(ev.target.id()));
    return cy;
  }

  function show(centerId, up, down) {
    const c = ensure();
    const { nodes, edges } = buildFamily(centerId, up, down);
    c.elements().remove();
    c.add([
      ...nodes.map((n) => {
        const data = { id: n.id, kind: n.kind, layer: n.layer };
        if (n.kind === 'cat') {
          const cat = catById.get(n.id);
          Object.assign(data, { label: displayName(cat), img: avatarUrl(cat), color: CLANS[cat.home]?.color || '#c4c8d4', core: n.core });
        }
        return { group: 'nodes', data, classes: n.id === centerId ? 'center' : '' };
      }),
      ...edges.map((e, i) => ({ group: 'edges', data: { id: `e${i}`, ...e } })),
    ]);
    const layout = c.layout(LAYOUT);
    layout.one('layoutstop', capZoom);
    layout.run();
    return nodes.filter((n) => n.kind === 'cat').length;
  }

  // 节点很少时 fit 会放得过大，限制在 MAX_FIT_ZOOM 以内
  const MAX_FIT_ZOOM = 1.3;
  function capZoom() {
    if (cy.zoom() > MAX_FIT_ZOOM) {
      cy.zoom(MAX_FIT_ZOOM);
      cy.center();
    }
  }

  // 容器尺寸变化（面板开合、转屏）后重新适配
  function refit() {
    if (!cy) return;
    cy.resize();
    cy.fit(undefined, 40);
    capZoom();
  }

  return { show, refit, el };
}
