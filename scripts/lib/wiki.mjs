// Warriors Wiki MediaWiki API 客户端：响应缓存到 data/raw/api/，限速，带明确的 User-Agent。
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://warriors.fandom.com/api.php';
const UA = 'warriors-graph/0.1 (personal non-commercial fan project; static family-tree viewer)';
const CACHE_DIR = new URL('../../data/raw/api/', import.meta.url).pathname;
const MIN_INTERVAL_MS = 1000;

let lastRequest = 0;
export const stats = { cached: 0, fetched: 0 };

export async function api(params) {
  const query = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  query.sort();
  const key = createHash('sha1').update(query.toString()).digest('hex');
  const file = join(CACHE_DIR, `${key}.json`);

  try {
    const hit = JSON.parse(await readFile(file, 'utf8'));
    stats.cached++;
    return hit;
  } catch {}

  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  const res = await fetch(`${API}?${query}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${query}`);
  const data = await res.json();
  if (data.error) throw new Error(`API error ${data.error.code}: ${data.error.info}`);

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(data));
  stats.fetched++;
  return data;
}

// 自动跟随 continue 翻页，把每页结果交给 onPage
export async function apiAll(params, onPage) {
  let cont = {};
  for (;;) {
    const data = await api({ ...params, ...cont });
    onPage(data);
    if (!data.continue) return;
    cont = data.continue;
  }
}

export async function categoryMembers(category) {
  const titles = [];
  await apiAll(
    { action: 'query', list: 'categorymembers', cmtitle: `Category:${category}`, cmnamespace: '0', cmlimit: 'max' },
    (d) => titles.push(...d.query.categorymembers.map((m) => m.title)),
  );
  return titles;
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
