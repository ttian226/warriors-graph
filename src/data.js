// 数据层：常量、索引和查询函数，星系视图与家谱视图共用。
import catsJson from '../data/cats.json';
import edgesJson from '../data/edges.json';
import arcsJson from '../config/arcs.json';

export const CLANS = {
  ThunderClan: { zh: '雷族', color: '#ffad6e' },
  RiverClan: { zh: '河族', color: '#6cc4ff' },
  WindClan: { zh: '风族', color: '#d6e98c' },
  ShadowClan: { zh: '影族', color: '#a58dff' },
  SkyClan: { zh: '天族', color: '#8ff0e4' },
  StarClan: { zh: '星族', color: '#dfeaff' },
  DarkForest: { zh: '黑森林', color: '#ff6b8a' },
  BloodClan: { zh: '血族', color: '#ff5c5c' },
  Tribe: { zh: '急水部落', color: '#e5c89c' },
  Kittypet: { zh: '宠物猫', color: '#ffc9ee' },
  Loner: { zh: '独行猫', color: '#c4c8d4' },
};
export const RELS = {
  parent: { zh: '血缘', color: '#ffd27a' },
  adoptive: { zh: '养亲', color: '#ffb36b' },
  mate: { zh: '伴侣', color: '#ff8fc8' },
  mentor: { zh: '师徒', color: '#8fe3ff' },
};
// 边类型 → [source 看 target 的称呼, target 看 source 的称呼]
const REL_ROLES = {
  parent: ['子女', '父母'],
  adoptive: ['养子女', '养父母'],
  mate: ['伴侣', '伴侣'],
  mentor: ['徒弟', '导师'],
};
export const REL_ORDER = ['父母', '养父母', '伴侣', '子女', '养子女', '兄弟姐妹', '导师', '徒弟'];
export const STAGES = { kit: '幼崽', apprentice: '学徒', warrior: '武士', leader: '族长', other: '其他' };
export const STATUS = { alive: '存活', dead: '已故' };
export const ARCS = arcsJson.arcs;
export const arcById = new Map(ARCS.map((a) => [a.id, a]));

const params = new URLSearchParams(location.search);
export const { cats, edges } = withStress(catsJson, edgesJson, Number(params.get('stress')) || 0);

export const catById = new Map(cats.map((c) => [c.id, c]));
export const relIndex = new Map(cats.map((c) => [c.id, []]));
for (const e of edges) {
  if (!catById.has(e.source) || !catById.has(e.target)) continue;
  const [a, b] = REL_ROLES[e.type];
  relIndex.get(e.source).push({ other: e.target, rel: a, type: e.type });
  relIndex.get(e.target).push({ other: e.source, rel: b, type: e.type });
}

export function displayName(cat) {
  const last = cat.names.at(-1);
  return last.zh || last.en;
}

// 兄弟姐妹：共享至少一个亲生父母
export function siblingsOf(id) {
  const sibs = new Set();
  for (const p of relIndex.get(id)) {
    if (p.rel !== '父母') continue;
    for (const r of relIndex.get(p.other)) if (r.rel === '子女' && r.other !== id) sibs.add(r.other);
  }
  return [...sibs];
}

// 按称呼分组的全部关系（含推导出的兄弟姐妹）
export function relationsOf(id) {
  const groups = Object.fromEntries(REL_ORDER.map((k) => [k, []]));
  for (const r of relIndex.get(id)) if (!groups[r.rel].includes(r.other)) groups[r.rel].push(r.other);
  groups['兄弟姐妹'] = siblingsOf(id);
  return groups;
}

// ?stress=N：追加 N 只假猫，用于在 iPad 上测性能
function withStress(cats, edges, count) {
  if (!count) return { cats, edges };
  const clans = ['ThunderClan', 'RiverClan', 'WindClan', 'ShadowClan', 'SkyClan'];
  const fake = [];
  const fakeEdges = [];
  for (let i = 0; i < count; i++) {
    const clan = clans[i % clans.length];
    const id = `Stress${i}`;
    fake.push({ id, names: [{ stage: 'warrior', en: `Testcat ${i}`, zh: `测试猫${i}` }], clans: [{ clan }], home: clan, arcs: [], status: 'alive' });
    if (i >= clans.length) {
      const pick = () => `Stress${Math.floor(Math.random() * Math.floor(i / clans.length)) * clans.length + (i % clans.length)}`;
      fakeEdges.push({ source: pick(), target: id, type: 'parent' });
      if (Math.random() < 0.4) fakeEdges.push({ source: pick(), target: id, type: Math.random() < 0.5 ? 'mate' : 'mentor' });
    }
  }
  return { cats: [...cats, ...fake], edges: [...edges, ...fakeEdges.filter((e) => e.source !== e.target)] };
}
