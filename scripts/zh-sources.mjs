// 大陆版中文名来源：中文维基百科「猫武士」两岸转换表 + 中文 Fandom 条目。
// 输出 config/zh-sources.csv（自动导入，可重跑）；人工校对写 config/zh-overrides.csv，优先级更高。
// 用法：node scripts/zh-sources.mjs
import { writeFile } from 'node:fs/promises';
import { api, apiAll, WIKIS, stats } from './lib/wiki.mjs';

const root = new URL('../', import.meta.url).pathname;
const rows = []; // [page, en, zh, source]

// 转换表里个别 zh-cn 值仍是繁体字形，只修正出现过的字
const T2S = { 薊: '蓟', 櫻: '樱', 鬚: '须', 貓: '猫', 鷹: '鹰', 鴉: '鸦', 鳥: '鸟', 鵝: '鹅', 蘆: '芦', 葉: '叶', 風: '风', 雲: '云', 條: '条', 紋: '纹', 腳: '脚', 鷲: '鹫' };
const toSimplified = (s) => [...s].map((ch) => T2S[ch] || ch).join('');

// 1. 维基百科转换组：Module 版本与 Template 版本都读，规则形如 zh-cn:沙风;zh-tw:沙暴
for (const page of ['Module:CGroup/Warriors', 'Template:CGroup/Warriors']) {
  const text = (await api({ action: 'parse', page, prop: 'wikitext' }, WIKIS.zhWikipedia)).parse.wikitext;
  const items = [
    ...[...text.matchAll(/original\s*=\s*"([^"]+)",\s*rule\s*=\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
    ...[...text.matchAll(/\{\{CItemLan\|2=([^|]+)\|1=([^}]+)\}\}/g)].map((m) => [m[1], m[2]]),
  ];
  for (const [en, rule] of items) {
    const cn = /zh-cn:([^;]+)/.exec(rule)?.[1]?.trim();
    if (cn && !rows.some((r) => r[0] === '*' && r[1] === en.trim())) rows.push(['*', en.trim(), toSimplified(cn), 'zh.wikipedia CGroup/Warriors']);
  }
}
const fromWikipedia = rows.length;

// 2. 中文 Fandom：条目标题是大陆版现用名，通过语言链接对应英文页名（只对该猫的最后一个名字生效）
await apiAll(
  { action: 'query', generator: 'allpages', gapnamespace: '0', gaplimit: '50', gapfilterredir: 'nonredirects', prop: 'langlinks', lllang: 'en' },
  (d) => {
    for (const p of d.query.pages) {
      const en = p.langlinks?.[0]?.title;
      if (en) rows.push([en, '*', p.title, 'warriors.fandom.com/zh']);
    }
  },
  WIKIS.zhFandom,
);

const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
await writeFile(
  `${root}config/zh-sources.csv`,
  ['page,en,zh,source', ...rows.map((r) => r.map(cell).join(','))].join('\n') + '\n',
);
console.log(`维基百科转换表 ${fromWikipedia} 条，中文 Fandom ${rows.length - fromWikipedia} 条；请求：新抓 ${stats.fetched}，缓存 ${stats.cached}`);
