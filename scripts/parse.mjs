// 解析：data/raw/ → data/cats.json、data/edges.json、data/zh-names.csv（待人工校对）。
// 纯离线，可反复重跑。用法：node scripts/parse.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { templateParams, stripRefs, linkTargets, nameList, plain } from './lib/wikitext.mjs';

const root = new URL('../', import.meta.url).pathname;
const readJson = async (p) => JSON.parse(await readFile(`${root}${p}`, 'utf8'));
const pages = await readJson('data/raw/pages.json');
const redirects = await readJson('data/raw/redirects.json');
const books = await readJson('data/raw/books.json');

// 链接目标可能是重定向页，统一解析到实际页名
const resolve = (t) => {
  let cur = t;
  for (let i = 0; i < 5 && redirects[cur]; i++) cur = redirects[cur];
  return cur;
};
const { arcs } = await readJson('config/arcs.json');

// —— 字段映射 ——

// 名字字段 → 阶段；未列出的字段（starclan resident、alias 等）不算名字
const NAME_FIELDS = {
  kit: 'kit', kkittypet: 'kit',
  kittypet: 'other', loner: 'other', bloner: 'other', rogue: 'other', brogue: 'other', rrogue: 'other',
  refugee: 'other', rrefugee: 'other', prisoner: 'other', pprisoner: 'other', bloodclan: 'other',
  apprentice: 'apprentice', mca: 'apprentice',
  warrior: 'warrior', 'senior warrior': 'warrior', queen: 'warrior', mc: 'warrior', tmc: 'warrior',
  deputy: 'warrior', elder: 'warrior', elderloner: 'warrior',
  leader: 'leader', temporaryleader: 'leader',
  // 部落、远古猫、族群黎明等特殊称谓
  'to-be': 'kit', trainee: 'apprentice', 'ancestor app': 'apprentice',
  'prey-hunter': 'warrior', 'cave-guard': 'warrior', prowler: 'warrior', sharpclaw: 'warrior', healer: 'warrior',
  'kit-mother': 'warrior', ancient: 'warrior', aancient: 'warrior', 'ancestor guide': 'warrior', 'medicine cat': 'warrior',
  unknown: 'other', 'guardian cats': 'other', 'cats of the park': 'other', ancestors: 'other',
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
  // 族群黎明：各营地是五大族的前身
  "Clear Sky's camp": 'SkyClan', 'SkyClan ancestor': 'SkyClan', "Tall Shadow's camp": 'ShadowClan',
  "River Ripple's camp": 'RiverClan', "Wind Runner's camp": 'WindClan', "Thunder's camp": 'ThunderClan',
  'Ancient Tribe': 'Tribe', 'The Ancients': 'Ancients', 'The ancestors': 'Ancients',
  'The Sisters': 'Sisters', 'The Kin': 'Kin', StormClan: 'StormClan',
  'Cats of the Park': 'Loner', 'The wildcats': 'Loner', "Slash's group": 'Loner', "Slash's camp": 'Loner',
  "Stick's group": 'Loner', "Dodge's group": 'Loner',
  'The rebels': null, 'The guardian cats': null, WarriorClan: null, Unknown: null, Custom: null,
  'LionClan (mythological)': null, 'TigerClan (mythological)': null, LeopardClan: null,
};
const AFTERLIFE = new Set(['StarClan', 'DarkForest']);

const arcByCategory = new Map(arcs.filter((a) => a.category).map((a) => [a.category.toLowerCase(), a.id]));
const arcByCode = new Map(arcs.filter((a) => a.code).map((a) => [a.code, a.id]));
const arcOrder = new Map(arcs.map((a, i) => [a.id, i]));

// 书名 → 部：正传各部的书（如 os1 Into the Wild）与部名本身（如 The Prophecies Begin (novel arc)）
const arcByTitle = new Map();
for (const [code, title] of Object.entries(books)) {
  const arc = arcByCode.get(code.replace(/\d+$/, ''));
  if (arc) arcByTitle.set(title.toLowerCase(), arc);
}
for (const a of arcs) if (a.code) arcByTitle.set(`${a.en} (novel arc)`.toLowerCase(), a.id);

// 分类 → 部：整部分类（如 The Prophecies Begin characters）之外，单本书的分类也算（第九部的整部分类在页面上取不到）
for (const [title, arc] of arcByTitle) {
  arcByCategory.set(`${title} characters`, arc);
  arcByCategory.set(`${title.replace(/ \((book|novel arc)\)$/, '')} characters`, arc);
}

// 死于哪一部：death 字段引用的书属于正传某部就用它；否则（死在外传里）取 deadbooks 中最早的正传部
function deathArcOf(f) {
  const code = /r\/book\|([a-z]+)\d*/.exec(f.death || '')?.[1];
  if (code && arcByCode.has(code)) return arcByCode.get(code);
  const deadArcs = linkTargets(f.deadbooks || '')
    .map((t) => arcByTitle.get(t.toLowerCase()))
    .filter(Boolean)
    .sort((a, b) => arcOrder.get(a) - arcOrder.get(b));
  return deadArcs[0] || null;
}

// 冒名：信息框把冒用的名字也写进名字字段（如第七部 Ashfur 附身冒充 Bramblestar 当族长），不算本猫的名字
const IMPOSTOR_NAMES = { 'Ashfur (TC)': ['Bramblestar'] };

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
// 自动导入的大陆版名字（scripts/zh-sources.mjs）：*|英文名 按名字匹配；页名|* 只对该猫的最后一个名字生效
const sources = new Map(
  parseCsv(await readFile(`${root}config/zh-sources.csv`, 'utf8')).map((o) => [`${resolve(o.page)}|${o.en}`, o]),
);

// 优先级：人工校对 → 自动导入 → 幼崽名留英文 → 词根拼合
function zhName(page, en, stage, isLast) {
  const o = overrides.get(`${page}|${en}`) || overrides.get(`*|${en}`);
  if (o) return { zh: o.zh || null, source: 'override', check: o.verified !== '1' };
  const src = sources.get(`*|${en}`) || (isLast && sources.get(`${page}|*`));
  if (src) return { zh: src.zh, source: 'import', check: true };
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
const CLAN_NOTES = { exiled: '被流放', prisoner: '囚禁', temporarily: '短暂', temporary: '短暂', unwillingly: '被迫', 'later prisoner': '后被囚禁', 'formerly exiled': '曾被流放', 'formerly prisoner': '曾被囚禁', refugee: '避难', birth: '出生', born: '出生', formerly: '曾经', captive: '被俘', 'mind-controlled': '被控制' };
const MAIN_CLANS = new Set(['ThunderClan', 'RiverClan', 'WindClan', 'ShadowClan', 'SkyClan']);
const WEAK_NOTES = /prisoner|temporar|refugee|birth|born|captive|hostage|exiled/i;

// 组合备注如 "formerly and refugee"：逐个翻译，认不出的保留英文
function noteZh(note) {
  return note
    .split(/\s*(?:,|\band\b)\s*/i)
    .filter(Boolean)
    .map((w) => CLAN_NOTES[w.toLowerCase()] || w)
    .join('、');
}

function clanEntries(value, id) {
  const out = [];
  for (const seg of value.split(/<br\s*\/?>/i)) {
    const raw = /\{\{\s*([^|}]+)/.exec(stripRefs(seg).replace(/\{\{\s*i\s*\|[^}]*\}\}/gi, ''))?.[1]?.trim();
    if (!raw) continue;
    const clan = raw in CLAN_TEMPLATES ? CLAN_TEMPLATES[raw] : null;
    if (!(raw in CLAN_TEMPLATES)) warnings.push(`${id}: 未知族群模板 ${raw}（已忽略）`);
    if (!clan) continue;
    const note = /\{\{\s*i\s*\|([^}]*)\}\}/i.exec(seg)?.[1]?.trim() || '';
    out.push({ clan, ...(note ? { note: noteZh(note), rawNote: note } : {}) });
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

const cats = [];
const rawEdges = [];
const zhRows = [];

for (const page of Object.values(pages)) {
  if (!page.infobox || /^#redirect/i.test(page.wikitext || '')) continue;
  const id = page.title;
  const f = templateParams(page.infobox);

  // 名字：按信息框字段顺序，去重
  const raw = [];
  for (const [key, val] of Object.entries(f)) {
    const stage = NAME_FIELDS[key];
    if (!stage) continue;
    for (const en of nameList(val)) {
      if (raw.some((n) => n.en === en) || IMPOSTOR_NAMES[id]?.includes(en)) continue;
      raw.push({ stage: stageOf(en, stage), en });
    }
  }
  if (!raw.length) {
    raw.push({ stage: 'other', en: id.replace(/ \(.*\)$/, '') });
    warnings.push(`${id}: 信息框里没有名字字段，用页名代替`);
  }
  const names = raw.map(({ stage, en }, i) => {
    const z = zhName(id, en, stage, i === raw.length - 1);
    zhRows.push([id, stage, en, z.zh || '', z.source, z.check ? 1 : 0]);
    return { stage, en, zh: z.zh, ...(z.check ? { check: true } : {}) };
  });

  // 族群：Wiki 的 pastaffie 不按时间排序，只记录经历过哪些及备注；主族群另行推断
  const current = clanEntries(f.affie || f.lastknown || '', id); // lastknown：下落不明的猫的最后归属
  const past = clanEntries(f.pastaffie || '', id);
  const clans = [];
  for (const c of [...past, ...current]) if (!clans.some((x) => x.clan === c.clan)) clans.push(c);

  // 出场的部、死亡的部
  const arcSet = new Set(page.categories.map((c) => arcByCategory.get(c.toLowerCase())).filter(Boolean));
  const dead = page.categories.includes('Deceased characters');

  const cat = {
    id,
    names,
    clans,
    home: homeClan(current, past),
    arcs: arcSet.size ? arcs.map((a) => a.id).filter((a) => arcSet.has(a)) : ['extra'],
    status: dead ? 'dead' : 'alive',
    ...(dead ? { deathArc: deathArcOf(f) } : {}),
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
