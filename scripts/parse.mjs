// 解析：data/raw/ → data/cats.json、data/edges.json、data/zh-names.csv（待人工校对）。
// 纯离线，可反复重跑。用法：node scripts/parse.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { templateParams, stripRefs, linkTargets, nameList, plain } from './lib/wikitext.mjs';

const root = new URL('../', import.meta.url).pathname;
const readJson = async (p) => JSON.parse(await readFile(`${root}${p}`, 'utf8'));
const pages = await readJson('data/raw/pages.json');
const redirects = await readJson('data/raw/redirects.json');
const { arcs } = await readJson('config/arcs.json');

// —— 字段映射 ——

// 名字字段 → 阶段；未列出的字段（starclan resident、alias 等）不算名字
const NAME_FIELDS = {
  kit: 'kit', kkittypet: 'kit',
  kittypet: 'other', loner: 'other', bloner: 'other', rogue: 'other', brogue: 'other', rrogue: 'other',
  refugee: 'other', rrefugee: 'other', prisoner: 'other', pprisoner: 'other', bloodclan: 'other', 'cave-guard': 'other',
  apprentice: 'apprentice', mca: 'apprentice',
  warrior: 'warrior', 'senior warrior': 'warrior', queen: 'warrior', mc: 'warrior', tmc: 'warrior',
  deputy: 'warrior', elder: 'warrior', elderloner: 'warrior',
  leader: 'leader', temporaryleader: 'leader',
};

// 关系字段 → [边类型, 方向]；self→other 表示「本猫是 source」
const REL_FIELDS = {
  father: ['parent', 'in'], mother: ['parent', 'in'],
  son: ['parent', 'out'], sons: ['parent', 'out'], daughter: ['parent', 'out'], daughters: ['parent', 'out'],
  child: ['parent', 'out'], children: ['parent', 'out'],
  'adoptive mother': ['adoptive', 'in'], 'adoptive father': ['adoptive', 'in'],
  'foster mother': ['adoptive', 'in'], 'foster mothers': ['adoptive', 'in'], 'foster father': ['adoptive', 'in'],
  'adopted son': ['adoptive', 'out'], 'adopted sons': ['adoptive', 'out'],
  'adopted daughter': ['adoptive', 'out'], 'adopted daughters': ['adoptive', 'out'],
  'foster son': ['adoptive', 'out'], 'foster daughter': ['adoptive', 'out'], 'foster daughters': ['adoptive', 'out'],
  mate: ['mate', 'out'], mates: ['mate', 'out'], formermate: ['mate', 'out'], formermates: ['mate', 'out'],
  mentor: ['mentor', 'in'], mentors: ['mentor', 'in'],
  'temporary mentor': ['mentor', 'in'], 'temporary mentors': ['mentor', 'in'],
  'unofficial mentor': ['mentor', 'in'], 'unofficial mentors': ['mentor', 'in'],
  app: ['mentor', 'out'], apps: ['mentor', 'out'],
  'temporary app': ['mentor', 'out'], 'temporary apps': ['mentor', 'out'],
  'unofficial app': ['mentor', 'out'], 'unofficial apps': ['mentor', 'out'],
};

// 族群模板 → 族群 key；null 表示忽略（临时联盟、无归属等）
const CLAN_TEMPLATES = {
  ThunderClan: 'ThunderClan', RiverClan: 'RiverClan', WindClan: 'WindClan', ShadowClan: 'ShadowClan', SkyClan: 'SkyClan',
  StarClan: 'StarClan', 'Place of No Stars': 'DarkForest', BloodClan: 'BloodClan',
  Kittypet: 'Kittypet', Loner: 'Loner', Rogue: 'Loner', 'Tribe of Rushing Water': 'Tribe',
  'LionClan (modern)': null, 'TigerClan (modern)': null, None: null,
  'Ghost residence': null, 'Unnamed afterlife': null, 'Tribe of Endless Hunting': null,
};
const AFTERLIFE = new Set(['StarClan', 'DarkForest']);

const arcByCategory = new Map(arcs.map((a) => [a.category, a.id]));
const arcByCode = new Map(arcs.map((a) => [a.code, a.id]));

// 字段给的阶段不可靠（如 mca=Cinderpaw, Cinderpelt），按名字后缀校正
function stageOf(en, field) {
  const l = en.toLowerCase();
  if (l.endsWith('kit')) return 'kit';
  if (l.endsWith('paw')) return 'apprentice';
  if (field === 'apprentice' || field === 'kit') return field === 'kit' ? 'kit' : 'warrior';
  return field;
}

// —— 中文名 ——
const parseCsv = (text) => {
  const [head, ...rows] = text.trim().split('\n').map((l) => l.split(','));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
};
const parts = parseCsv(await readFile(`${root}config/zh-parts.csv`, 'utf8'));
const prefixes = new Map(parts.filter((p) => p.type === 'prefix').map((p) => [p.part.toLowerCase(), p.zh]));
const suffixes = parts.filter((p) => p.type === 'suffix').sort((a, b) => b.part.length - a.part.length);
const overrides = new Map(
  parseCsv(await readFile(`${root}config/zh-overrides.csv`, 'utf8')).map((o) => [`${o.page}|${o.en}`, o]),
);

function zhName(page, en, stage) {
  const o = overrides.get(`${page}|${en}`) || overrides.get(`*|${en}`);
  if (o) return { zh: o.zh || null, source: 'override', check: o.verified !== '1' };
  if (stage === 'kit') return { zh: null, source: 'kit', check: false }; // 幼崽名一律显示英文
  const lower = en.toLowerCase();
  for (const s of suffixes) {
    if (!lower.endsWith(s.part) || lower.length === s.part.length) continue;
    const pre = prefixes.get(lower.slice(0, -s.part.length));
    if (pre) return { zh: pre + s.zh, source: 'parts', check: true };
  }
  return { zh: null, source: 'none', check: false };
}

// —— 毛色 ——
const BASES = [
  ['tortie', /tortoiseshell|calico/],
  ['ginger', /\b(ginger|orange|flame|red|russet|reddish)/],
  ['silver', /\bsilver/],
  ['gray', /\b(gr[ae]y|blue)/],
  ['black', /\bblack/],
  ['white', /\bwhite/],
  ['golden', /\bgold/],
  ['cream', /\b(cream|pale yellow)/],
  ['brown', /\b(brown|tawny|chocolate|dusky)/],
];
function parsePelt(wikitext) {
  const text = plain(stripRefs(wikitext.replace(/\{\{(?:[^{}]|\{\{(?:[^{}]|\{\{[^{}]*\}\})*\}\})*\}\}/g, '')));
  const m = /\b(?:is|was) an? ([^.]{0,160}?)\b(tom|she-cat|kit|cat|molly)\b/i.exec(text);
  if (!m) return null;
  const d = m[1].toLowerCase();
  let base = null;
  let best = Infinity;
  for (const [k, re] of BASES) {
    const i = d.search(re);
    if (i >= 0 && (k === 'tortie' || i < best)) {
      base = k;
      if (k === 'tortie') break;
      best = i;
    }
  }
  let pattern = 'solid';
  if (base === 'tortie') pattern = 'tortie';
  else if (/tabby|striped|stripes/.test(d)) pattern = 'tabby';
  else if (/spotted|dappled|speckled|mottled|flecked/.test(d)) pattern = 'spotted';
  if (base !== 'white' && /and[- ]white|white (?:paws|chest|patches|markings|muzzle|belly)/.test(d)) pattern = pattern === 'solid' ? 'bicolor' : pattern;
  return { base: base || 'unknown', pattern }; // 不保留 Wiki 原文描述
}

const warnings = [];

// —— 族群 ——
const CLAN_NOTES = { exiled: '被流放', prisoner: '囚禁', temporarily: '短暂', refugee: '避难', birth: '出生', born: '出生', formerly: '曾经', captive: '被俘', 'mind-controlled': '被控制' };
const MAIN_CLANS = new Set(['ThunderClan', 'RiverClan', 'WindClan', 'ShadowClan', 'SkyClan']);
const WEAK_NOTES = /prisoner|temporar|refugee|birth|born|captive|hostage|exiled/i;

function clanEntries(value, id) {
  const out = [];
  for (const seg of value.split(/<br\s*\/?>/i)) {
    const raw = /\{\{\s*([^|}]+)/.exec(stripRefs(seg).replace(/\{\{\s*i\s*\|[^}]*\}\}/gi, ''))?.[1]?.trim();
    if (!raw) continue;
    const clan = raw in CLAN_TEMPLATES ? CLAN_TEMPLATES[raw] : null;
    if (!(raw in CLAN_TEMPLATES)) warnings.push(`${id}: 未知族群模板 ${raw}（已忽略）`);
    if (!clan) continue;
    const note = /\{\{\s*i\s*\|([^}]*)\}\}/i.exec(seg)?.[1]?.trim() || '';
    out.push({ clan, ...(note ? { note: CLAN_NOTES[note.toLowerCase()] || note, rawNote: note } : {}) });
  }
  return out;
}

// 当前归属是活着的族群就用它；否则从过去的族群里挑：排除囚禁/短暂等，优先五大族
function homeClan(current, past) {
  const live = current.find((c) => !AFTERLIFE.has(c.clan));
  if (live) return live.clan;
  const pool = past.filter((c) => !AFTERLIFE.has(c.clan));
  const strong = pool.filter((c) => !WEAK_NOTES.test(c.rawNote || ''));
  for (const list of [strong, pool]) {
    const main = list.find((c) => MAIN_CLANS.has(c.clan));
    if (main) return main.clan;
  }
  return (strong[0] || pool[0])?.clan || 'Loner';
}

// —— 主流程 ——
const resolve = (t) => {
  let cur = t;
  for (let i = 0; i < 5 && redirects[cur]; i++) cur = redirects[cur];
  return cur;
};

const cats = [];
const rawEdges = [];
const zhRows = [];

for (const page of Object.values(pages)) {
  if (!page.infobox || /^#redirect/i.test(page.wikitext || '')) continue;
  const id = page.title;
  const f = templateParams(page.infobox);

  // 名字：按信息框字段顺序，去重
  const names = [];
  for (const [key, val] of Object.entries(f)) {
    const stage = NAME_FIELDS[key];
    if (!stage) continue;
    for (const en of nameList(val)) {
      if (names.some((n) => n.en === en)) continue;
      const st = stageOf(en, stage);
      const z = zhName(id, en, st);
      names.push({ stage: st, en, zh: z.zh, ...(z.check ? { check: true } : {}) });
      zhRows.push([id, st, en, z.zh || '', z.source, z.check ? 1 : 0]);
    }
  }
  if (!names.length) {
    names.push({ stage: 'other', en: id.replace(/ \(.*\)$/, ''), zh: null });
    warnings.push(`${id}: 信息框里没有名字字段，用页名代替`);
  }

  // 族群：Wiki 的 pastaffie 不按时间排序，只记录经历过哪些及备注；主族群另行推断
  const current = clanEntries(f.affie || f.lastknown || '', id); // lastknown：下落不明的猫的最后归属
  const past = clanEntries(f.pastaffie || '', id);
  const clans = [];
  for (const c of [...past, ...current]) if (!clans.some((x) => x.clan === c.clan)) clans.push(c);

  // 出场的部、死亡的部
  const arcSet = new Set(page.categories.map((c) => arcByCategory.get(c)).filter(Boolean));
  const deathCode = /r\/book\|([a-z]+)\d*/.exec(f.death || '')?.[1];
  const dead = page.categories.includes('Deceased characters');

  const cat = {
    id,
    names,
    clans,
    home: homeClan(current, past),
    arcs: arcs.map((a) => a.id).filter((a) => arcSet.has(a)),
    status: dead ? 'dead' : 'alive',
    ...(dead && deathCode ? { deathArc: arcByCode.get(deathCode) || null, deathBook: deathCode } : {}),
    gender: page.categories.includes('Toms') ? 'male' : page.categories.includes('She-cats') ? 'female' : undefined,
    pelt: parsePelt(page.wikitext || ''),
  };
  cats.push(cat);

  // 关系
  for (const [key, val] of Object.entries(f)) {
    const rel = REL_FIELDS[key];
    if (!rel) continue;
    const [type, dir] = rel;
    for (const t of linkTargets(stripRefs(val))) {
      const other = resolve(t);
      rawEdges.push(dir === 'in' ? { source: other, target: id, type } : { source: id, target: other, type });
    }
  }
}

// 边：只保留两端都在数据里的，去重（伴侣无向）
const ids = new Set(cats.map((c) => c.id));
const seen = new Set();
const edges = [];
let dropped = 0;
for (const e of rawEdges) {
  if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) { dropped++; continue; }
  const key = e.type === 'mate' ? `mate|${[e.source, e.target].sort().join('|')}` : `${e.type}|${e.source}|${e.target}`;
  if (seen.has(key)) continue;
  seen.add(key);
  edges.push(e);
}
// 同一对既是亲生又被记为养育时，只留亲生
const bio = new Set(edges.filter((e) => e.type === 'parent').map((e) => `${e.source}|${e.target}`));
const finalEdges = edges.filter((e) => !(e.type === 'adoptive' && bio.has(`${e.source}|${e.target}`)));

cats.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(`${root}data/cats.json`, JSON.stringify(cats, null, 1));
await writeFile(`${root}data/edges.json`, JSON.stringify(finalEdges, null, 1));

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
zhRows.sort((a, b) => a[0].localeCompare(b[0]));
await writeFile(
  `${root}data/zh-names.csv`,
  ['page,stage,en,zh,source,check', ...zhRows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n',
);

// —— 报告 ——
const count = (arr, fn) => arr.reduce((acc, x) => ((acc[fn(x)] = (acc[fn(x)] || 0) + 1), acc), {});
console.log(`猫 ${cats.length} 只；边 ${finalEdges.length} 条`, count(finalEdges, (e) => e.type), `（另有 ${dropped} 条指向数据范围外的猫，已丢弃）`);
console.log('名字中文来源', count(zhRows, (r) => r[4]));
console.log('毛色', count(cats, (c) => c.pelt?.base || '无'));
console.log('主族群', count(cats, (c) => c.home));
if (warnings.length) console.log(`警告 ${warnings.length} 条：\n  ${warnings.slice(0, 20).join('\n  ')}`);
