// 抓取：全部角色 → 角色页正文 + 分类 + 信息框子页 + 关系链接的重定向 + 书目数据。
// 输出 data/raw/pages.json 与 data/raw/redirects.json，供 parse.mjs 离线解析。
// 用法：node scripts/fetch.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { api, apiAll, categoryMembers, chunk, stats } from './lib/wiki.mjs';
import { findTemplate, linkTargets } from './lib/wikitext.mjs';

const root = new URL('../', import.meta.url).pathname;

// 1. 角色列表：全部角色分类（各部归属由页面分类决定，parse 阶段处理）
const { sourceCategory } = JSON.parse(await readFile(`${root}config/arcs.json`, 'utf8'));
const titles = new Set(await categoryMembers(sourceCategory));
console.log(`${sourceCategory}: ${titles.size} 个页面`);

// 2. 正文 + 分类（每批 50 页）
const pages = {};
async function fetchPages(list, into) {
  for (const batch of chunk([...list], 50)) {
    await apiAll(
      {
        action: 'query',
        titles: batch.join('|'),
        prop: 'revisions|categories',
        rvprop: 'content',
        rvslots: 'main',
        cllimit: 'max',
        clshow: '!hidden',
      },
      (d) => {
        for (const p of d.query.pages) {
          if (p.missing) continue;
          const page = (into[p.title] ||= { title: p.title, wikitext: null, categories: [] });
          const content = p.revisions?.[0]?.slots?.main?.content;
          if (content) page.wikitext = content;
          for (const c of p.categories || []) page.categories.push(c.title.replace(/^Category:/, ''));
        }
      },
    );
  }
}
await fetchPages(titles, pages);

// 3. 信息框写在 Template:Charcat/<页名> 子页里的，补抓子页
const templates = {};
const needTemplate = Object.values(pages)
  .map((p) => /\{\{\s*Charcat\/([^}|]+)\}\}/i.exec(p.wikitext || '')?.[1]?.trim())
  .filter(Boolean)
  .map((name) => `Template:Charcat/${name}`);
await fetchPages(needTemplate, templates);
for (const p of Object.values(pages)) {
  const name = /\{\{\s*Charcat\/([^}|]+)\}\}/i.exec(p.wikitext || '')?.[1]?.trim();
  p.infobox = findTemplate((name && templates[`Template:Charcat/${name}`]?.wikitext) || p.wikitext || '', 'Charcat');
}

// 4. 信息框里的链接可能是重定向（如 [[Squirrelstar]] → 实际页名），统一解析
const targets = new Set();
for (const p of Object.values(pages)) if (p.infobox) linkTargets(p.infobox).forEach((t) => targets.add(t));
const redirects = {};
for (const batch of chunk([...targets], 50)) {
  const d = await api({ action: 'query', titles: batch.join('|'), redirects: '1' });
  for (const n of d.query.normalized || []) redirects[n.from] = n.to;
  for (const r of d.query.redirects || []) redirects[r.from] = r.to;
}

// 5. 书目数据（书名 ↔ 书目代码），用于从 deadbooks 推断死于哪一部
const bookLua = (await api({ action: 'parse', page: 'Module:References/Book Data', prop: 'wikitext' })).parse.wikitext;
const books = {};
for (const m of bookLua.matchAll(/\['([a-z]+\d*)'\]\s*=\s*\{[^{}]*?\['base'\]\s*=\s*["']([^"']+)["']/g)) books[m[1]] = m[2];

await mkdir(`${root}data/raw`, { recursive: true });
await writeFile(`${root}data/raw/books.json`, JSON.stringify(books, null, 1));
await writeFile(`${root}data/raw/pages.json`, JSON.stringify(pages, null, 1));
await writeFile(`${root}data/raw/redirects.json`, JSON.stringify(redirects, null, 1));

const noBox = Object.values(pages).filter((p) => !p.infobox).map((p) => p.title);
console.log(`页面 ${Object.keys(pages).length}，无信息框 ${noBox.length}${noBox.length ? `：${noBox.slice(0, 15).join(', ')}${noBox.length > 15 ? ' …' : ''}` : ''}`);
console.log(`重定向/规范化 ${Object.keys(redirects).length} 条；请求：新抓 ${stats.fetched}，缓存命中 ${stats.cached}`);
