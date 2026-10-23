// 程序生成的简笔猫脸：底色 + 花纹 + 族群色外圈。相同组合共用一张 canvas。
const BASE_COLORS = {
  ginger: '#e8944c',
  gray: '#979ea8',
  silver: '#c8cfd8',
  black: '#3b3a42',
  white: '#f3f0ea',
  golden: '#e2b664',
  cream: '#eed8b0',
  brown: '#8b6449',
  tortie: '#3d3437',
  unknown: '#b8ada1',
};

const SIZE = 128;
const cache = new Map();

export function avatarCanvas(pelt, ringColor) {
  const base = pelt?.base || 'unknown';
  const pattern = pelt?.pattern || 'solid';
  const key = `${base}|${pattern}|${ringColor}`;
  if (cache.has(key)) return cache.get(key);

  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  drawFace(cv.getContext('2d'), base, pattern, ringColor);
  cache.set(key, cv);
  return cv;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function drawFace(ctx, base, pattern, ring) {
  const c = SIZE / 2;
  const fur = BASE_COLORS[base] || BASE_COLORS.unknown;
  const dark = base === 'black' || base === 'tortie';
  const stripe = base === 'white' ? '#b9b4ab' : shade(fur, dark ? 0.6 : 0.62);

  // 族群色外圈 + 深色底盘
  ctx.beginPath();
  ctx.arc(c, c, 60, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, 54, 0, Math.PI * 2);
  ctx.fillStyle = '#10131f';
  ctx.fill();

  // 头部轮廓（耳朵 + 脸）作为裁剪区，花纹只画在里面
  const head = new Path2D();
  head.moveTo(30, 54);
  head.lineTo(34, 22);
  head.lineTo(54, 40);
  head.quadraticCurveTo(64, 37, 74, 40);
  head.lineTo(94, 22);
  head.lineTo(98, 54);
  head.bezierCurveTo(104, 76, 92, 98, 64, 99);
  head.bezierCurveTo(36, 98, 24, 76, 30, 54);
  head.closePath();

  ctx.save();
  ctx.clip(head);
  ctx.fillStyle = fur;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.fillStyle = stripe;
  ctx.strokeStyle = stripe;
  ctx.lineCap = 'round';
  if (pattern === 'tabby') {
    ctx.lineWidth = 4;
    for (const [x1, y1, x2, y2] of [[56, 42, 58, 56], [64, 40, 64, 56], [72, 42, 70, 56]]) line(ctx, x1, y1, x2, y2);
    ctx.lineWidth = 3.5;
    for (const s of [-1, 1]) {
      line(ctx, c + s * 34, 66, c + s * 24, 68);
      line(ctx, c + s * 35, 75, c + s * 25, 76);
    }
  } else if (pattern === 'spotted') {
    for (const [x, y, r] of [[48, 50, 4], [80, 52, 4.5], [62, 46, 3], [40, 70, 3.5], [88, 70, 3.5], [70, 60, 2.5]]) dot(ctx, x, y, r);
  } else if (pattern === 'tortie') {
    ctx.fillStyle = '#e08a44';
    blob(ctx, 40, 44, 18, 14);
    blob(ctx, 86, 72, 16, 18);
    ctx.fillStyle = '#c9a07a';
    blob(ctx, 74, 38, 9, 7);
  }
  if (pattern === 'bicolor' || base === 'tortie') {
    // 白色口鼻与下巴
    ctx.fillStyle = '#f3f0ea';
    blob(ctx, c, 88, 22, 16);
    blob(ctx, c, 70, 7, 16);
  }
  ctx.restore();

  // 内耳
  ctx.fillStyle = dark ? '#7a5560' : '#f2b8bf';
  tri(ctx, 37, 31, 39, 47, 49, 41);
  tri(ctx, 91, 31, 89, 47, 79, 41);

  // 眼睛
  const eye = dark ? '#c9e07a' : '#2a2a33';
  for (const s of [-1, 1]) {
    ctx.fillStyle = eye;
    ctx.beginPath();
    ctx.ellipse(c + s * 15, 66, 5.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (dark) {
      ctx.fillStyle = '#1b1b20';
      ctx.beginPath();
      ctx.ellipse(c + s * 15, 66, 2, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    dot(ctx, c + s * 15 + 2, 63.5, 1.8);
  }

  // 鼻子和嘴
  ctx.fillStyle = '#e88a98';
  tri(ctx, c - 4, 76, c + 4, 76, c, 80.5);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(40,30,30,0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(c, 80.5);
  ctx.quadraticCurveTo(c - 3, 85, c - 7, 83);
  ctx.moveTo(c, 80.5);
  ctx.quadraticCurveTo(c + 3, 85, c + 7, 83);
  ctx.stroke();

  // 胡须
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.2;
  for (const s of [-1, 1]) {
    line(ctx, c + s * 10, 79, c + s * 30, 75);
    line(ctx, c + s * 10, 82, c + s * 30, 83);
  }
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function blob(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function tri(ctx, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}
