// 极简 wikitext 工具：只处理本项目需要的 {{Charcat}} 信息框。

// 找到 {{Name ...}} 的内部文本（不含外层花括号），正确处理嵌套
export function findTemplate(text, name) {
  const re = new RegExp(`\\{\\{\\s*${name}\\s*(\\||\\}\\})`, 'i');
  const m = re.exec(text);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; }
    else if (text[i] === '}' && text[i + 1] === '}') {
      depth--; i++;
      if (depth === 0) return text.slice(m.index + 2, i - 1);
    }
  }
  return null;
}

// 按顶层 | 切分模板参数（忽略嵌套模板和链接里的 |）
export function templateParams(inner) {
  const parts = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; buf += two; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; buf += two; i++; continue; }
    if (inner[i] === '|' && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += inner[i];
  }
  parts.push(buf);

  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  return params;
}

// 去掉引用、注释和说明类模板，保留正文与其他模板
export function stripRefs(v) {
  return v
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\{\s*(r\/[^|}]*|cic|i|note|citation needed)\b(?:[^{}]|\{\{[^{}]*\}\})*\}\}/gi, '');
}

// 所有内部链接的目标页名（去掉 #锚点）
export function linkTargets(v) {
  const out = [];
  for (const m of v.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const t = m[1].trim();
    if (t && !/^(file|image|category):/i.test(t)) out.push(t.charAt(0).toUpperCase() + t.slice(1));
  }
  return out;
}

// 纯文本：链接取显示文字，去掉剩余模板和 HTML
export function plain(v) {
  return stripRefs(v)
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\{\{(?:[^{}]|\{\{[^{}]*\}\})*\}\}/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 名字字段：可能多个名字，用逗号或 <br> 分隔
export function nameList(v) {
  return stripRefs(v)
    .split(/<br\s*\/?>|,|\n/i)
    .map((s) => plain(s))
    .filter((s) => s && !/^(unknown|none)$/i.test(s));
}
