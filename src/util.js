import { avatarCanvas } from './avatar.js';
import { CLANS } from './data.js';

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export function avatarCanvasFor(cat) {
  return avatarCanvas(cat.pelt, CLANS[cat.home]?.color || '#c4c8d4');
}

const avatarUrls = new Map();
export function avatarUrl(cat) {
  const cv = avatarCanvasFor(cat);
  if (!avatarUrls.has(cv)) avatarUrls.set(cv, cv.toDataURL());
  return avatarUrls.get(cv);
}

// 浏览器存储可能不可用（隐私模式等），读写失败时退回默认值
export function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(`wg:${key}`);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
export function writePref(key, value) {
  try {
    localStorage.setItem(`wg:${key}`, JSON.stringify(value));
  } catch {}
}
