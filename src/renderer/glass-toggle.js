/**
 * <glass-toggle> — 玻璃质感通用开关（Web Component）
 *
 * 由 glass-light-toggle（日夜专用）泛化而来，1:1 保留原作
 * https://experiments.thisiswhitespace.com/glass-light-toggle（Zsolt Kacso）的玻璃/折射/LED 光学。
 * 结构：CPU 端弹簧像素图形（离屏 2D canvas 光栅化）→ 作为纹理，
 *       由单个 WebGL2 片元着色器完成玻璃、折射、磨砂与 LED 散射的全部光学效果。
 * 零依赖；仅要求浏览器支持 WebGL2。
 *
 * 默认即「通用形态」：深色圆角底板（plinth，可嵌任意页面背景）+ 点阵电源符 +
 * 薄荷绿(开)/冷灰(关)灯光，表面明暗固定。`preset="day-night"` 一键回到日/夜场景。
 *
 * 用法：
 *   <script type="module" src="./glass-toggle.js"></script>
 *   <glass-toggle style="width:560px;height:400px"></glass-toggle>                    <!-- 通用默认 -->
 *   <glass-toggle preset="day-night" style="width:100vw;height:100vh"></glass-toggle> <!-- 日/夜场景 -->
 *   <glass-toggle on-icon="pause" off-icon="play" on-color="#60a5fa"></glass-toggle>  <!-- 内置图标对 -->
 *   <glass-toggle on-icon="🌙" off-icon="☀️"></glass-toggle>                          <!-- emoji 采样 -->
 *   <glass-toggle off-icon="....#..../...###.../..#####../.#######./#########/...###.../...###.../...###..."></glass-toggle>
 */

// ---------------------------------------------------------------- layout
const TRACK = { w: 432, h: 224, r: 72 };
const PAD = 13;
const KNOB_HALF = (TRACK.h - PAD * 2) / 2; // 99
const KNOB_R = 58;
const GRID = 17, C0 = 8, PITCH = 5.7, PSIZE = 4.6;

// ---------------------------------------------------------------- sprites
// 精灵 = 17×17 网格点集 {x, y, b, kind}；kind: 'lit'（常亮）| 'star'（闪烁）| 'ray'（流光）

// 把任意点集的包围盒中心移到网格中心（moon/sun 为手工平衡，不走此步）
function recenter(pts) {
  if (!pts.length) return pts;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const ox = Math.round(C0 - (x0 + x1) / 2), oy = Math.round(C0 - (y0 + y1) / 2);
  if (!ox && !oy) return pts;
  return pts.map(p => ({ ...p, x: p.x + ox, y: p.y + oy }));
}

function buildMoon() {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const dx = x - C0, dy = y - C0;
    const inMain = dx * dx + dy * dy <= 6.6 * 6.6;
    const sx = x - 11.3, sy = y - 5.6;
    const inShadow = sx * sx + sy * sy <= 5.4 * 5.4;
    if (inMain && !inShadow) out.push({ x, y, b: 1, kind: 'lit' });
    else if (inMain && inShadow && (x + y) % 2 === 0) out.push({ x, y, b: 0.2, kind: 'earth' });
  }
  for (const c of out) if ((c.x === 3 && c.y === 9) || (c.x === 6 && c.y === 12) || (c.x === 4 && c.y === 12)) c.b = 0.5;
  const stars = [[15, 1, 1], [14, 1, 0.45], [16, 1, 0.45], [15, 0, 0.45], [15, 2, 0.45], [11, 0, 0.75], [16, 5, 0.6]];
  for (const [x, y, b] of stars) out.push({ x, y, b, kind: 'star' });
  return out;
}

function buildSun() {
  const m = new Map();
  const add = (x, y, b, kind, ang = 0) => { const k = x + ',' + y; if (!m.has(k)) m.set(k, { x, y, b, kind, ang }); };
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const dx = x - C0, dy = y - C0;
    if (dx * dx + dy * dy <= 3.7 * 3.7) add(x, y, 1, 'core');
  }
  for (let a = 0; a < 8; a++) {
    const ang = a * Math.PI / 4;
    const rs = a % 2 ? [5.9, 7.2] : [5.6, 6.6, 7.6];
    for (const r of rs) add(Math.round(C0 + Math.cos(ang) * r), Math.round(C0 + Math.sin(ang) * r), 1, 'ray', ang);
  }
  return [...m.values()];
}

// 电源符：顶部开口的圆环 + 竖杆
function buildPower() {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const dx = x - C0, dy = y - C0, d2 = dx * dx + dy * dy;
    const ring = d2 <= 6.8 * 6.8 && d2 >= 5.2 * 5.2;
    const gap = y - C0 <= -3.2 && Math.abs(dx) <= 1.6;
    const stem = dx === 0 && dy >= -6.5 && dy <= -0.5;
    if (stem) out.push({ x, y, b: 1, kind: 'lit' });
    else if (ring && !gap) out.push({ x, y, b: 1, kind: 'lit' });
  }
  return out;
}

function buildPlay() {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const x0 = 4.5, x1 = 13.5, yTop = 3.5, yM = 8;
    if (x < x0 || x > x1) continue;
    const half = (1 - (x - x0) / (x1 - x0)) * (yM - yTop);
    if (Math.abs(y - yM) <= half) out.push({ x, y, b: 1, kind: 'lit' });
  }
  return out;
}

function buildPause() {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (y >= 4 && y <= 12 && ((x >= 5 && x <= 6) || (x >= 10 && x <= 11))) out.push({ x, y, b: 1, kind: 'lit' });
  }
  return out;
}

function buildHeart() {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const px = (x - 8) / 5.4, py = -(y - 9) / 5.4 + 0.12;
    const a = px * px + py * py - 1;
    if (a * a * a - px * px * py * py * py <= 0) out.push({ x, y, b: 1, kind: 'lit' });
  }
  return out;
}

function buildBell() {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const dx = x - 8, dy = y - 8;
    if (dy >= -7 && dy <= 4) {
      const half = Math.min(6.8, 1.2 + Math.max(0, dy + 7) * 0.62);
      if (Math.abs(dx) <= half) out.push({ x, y, b: 1, kind: 'lit' });
    }
    if (dy === -8 && Math.abs(dx) <= 1) out.push({ x, y, b: 0.8, kind: 'lit' });
    if (dy === 5 && Math.abs(dx) <= 7) out.push({ x, y, b: 1, kind: 'lit' });
    if (dy === 6 && Math.abs(dx) <= 5.5) out.push({ x, y, b: 0.85, kind: 'lit' });
    if (dy === 7 && dx === 0) out.push({ x, y, b: 0.9, kind: 'star' });
  }
  return recenter(out);
}

function buildLock() {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const dx = x - 8, dy = y - 8;
    if (dy >= 0 && dy <= 6 && Math.abs(dx) <= 4.5) {
      const keyhole = dx === 0 && dy >= 2 && dy <= 3.5;
      out.push({ x, y, b: keyhole ? 0.15 : 1, kind: 'lit' });
    }
    const rr = Math.hypot(dx, dy + 4.5);
    if (rr <= 4.4 && rr >= 2.6 && dy < 0) out.push({ x, y, b: 1, kind: 'lit' });
  }
  return out;
}

function buildStar() {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const dx = x - 8, dy = 8 - y;
    if (dx === 0 && dy === 0) { out.push({ x, y, b: 1, kind: 'lit' }); continue; }
    const a = Math.atan2(dy, dx) + Math.PI / 2;
    const r = Math.hypot(dx, dy);
    const k = (((a / (Math.PI * 2)) % 1) + 1) % 1 * 5;
    const spike = 1 - Math.abs(k - Math.round(k)) * 1.4;
    if (r <= 2.6 + Math.max(spike, 0) * (7.2 - 2.6)) out.push({ x, y, b: 1, kind: 'lit' });
  }
  return out;
}

// 线段栅格化（勾/十字等线状图形）
function fromSegments(segs, width = 1.1) {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    for (const [x0, y0, x1, y1] of segs) {
      const vx = x1 - x0, vy = y1 - y0;
      const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)));
      if (Math.hypot(x - (x0 + vx * t), y - (y0 + vy * t)) <= width) { out.push({ x, y, b: 1, kind: 'lit' }); break; }
    }
  }
  return out;
}

const buildCheck = () => fromSegments([[3.5, 9, 6.5, 13], [6.5, 13, 13.5, 4]]);
const buildPlus = () => fromSegments([[8, 2.5, 8, 13.5], [2.5, 8, 13.5, 8]]);

function buildWifi() {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const dx = x - 8, dy = y - 13;
    const r = Math.hypot(dx, dy);
    if (dy < 0 && dy > -12 &&
        ((r >= 3 && r <= 4.6) || (r >= 6.2 && r <= 7.8) || (r >= 9.4 && r <= 11))) out.push({ x, y, b: 1, kind: 'lit' });
    if (r <= 1.4) out.push({ x, y, b: 1, kind: 'lit' });
  }
  return out;
}

const SPRITES = {
  moon: buildMoon, sun: buildSun, power: buildPower, play: buildPlay, pause: buildPause,
  heart: buildHeart, bell: buildBell, lock: buildLock, star: buildStar,
  check: buildCheck, plus: buildPlus, wifi: buildWifi,
};

// 像素字符串 → 点集（'#'=亮、'+'=0.55、'*'=闪烁 star、'.'/空格=空），自动居中
function spriteFromBitmap(src) {
  const rows = src.split('/').map(s => [...s]);
  const out = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '#') out.push({ x, y, b: 1, kind: 'lit' });
      else if (ch === '+') out.push({ x, y, b: 0.55, kind: 'lit' });
      else if (ch === '*') out.push({ x, y, b: 1, kind: 'star' });
    }
  }
  return recenter(out);
}

// emoji / 短文本 → 离屏 canvas 绘制后按 17×17 采样 alpha 成点
function spriteFromGlyph(text) {
  const N = 64;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '48px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText(text, N / 2, N / 2 + 2);
  const data = ctx.getImageData(0, 0, N, N).data;
  const out = [];
  const cell = N / GRID;
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    let a = 0;
    for (let py = Math.floor(gy * cell); py < Math.floor((gy + 1) * cell); py++)
      for (let px = Math.floor(gx * cell); px < Math.floor((gx + 1) * cell); px++) {
        const al = data[(py * N + px) * 4 + 3];
        if (al > a) a = al;
      }
    if (a > 48) out.push({ x: gx, y: gy, b: Math.min(1, a / 255 * 1.2), kind: 'lit' });
  }
  return recenter(out);
}

function resolveSprite(value) {
  const v = (value || '').trim();
  if (!v) return null;
  if (SPRITES[v]) return SPRITES[v]();
  if (v.includes('#') || v.includes('*') || v.length > 2) {
    const s = spriteFromBitmap(v);
    if (s.length) return s;
    console.warn('[glass-toggle] 图标解析为空，回退 power：', v);
    return buildPower();
  }
  const s = spriteFromGlyph(v);
  if (!s.length) {
    console.warn('[glass-toggle] 图标采样为空，回退 power：', v);
    return buildPower();
  }
  return s;
}

// Pair any two sprite point sets by sweeping angle, so the morph reads as one coherent swirl.
function pairUp(A, B) {
  const a = [...A].sort((p, q) => angKey(p) - angKey(q));
  const b = [...B].sort((p, q) => angKey(p) - angKey(q));
  const pairs = [];
  const big = a.length >= b.length ? a : b, small = big === a ? b : a;
  let last = -1;
  for (let i = 0; i < big.length; i++) {
    const j = Math.floor(i * small.length / big.length);
    const first = j !== last; last = j;
    const s = { ...small[j], b: first ? small[j].b : 0 };
    pairs.push(big === a ? [big[i], s] : [s, big[i]]);
  }
  return pairs.map(([a, b]) => {
    const lead = 1 - a.x / (GRID - 1); // right-hand pixels lead when travelling right
    return {
      a, b,
      delay: 0.04 + lead * 0.26 + rnd(0, 0.06),
      curl: rnd(-1, 1) * 16 + (a.y - C0) * 0.9,
      lift: rnd(2, 12),
      k: rnd(260, 460),
      drag: rnd(0.004, 0.016),
      phase: rnd(0, Math.PI * 2),
      tw: rnd(1.5, 3.2),
      x: 0, y: 0, vx: 0, vy: 0, inited: false,
    };
  });
}

const angKey = c => {
  const a = Math.atan2(c.y - C0, c.x - C0);
  return ((a + Math.PI * 0.75 + Math.PI * 2) % (Math.PI * 2)) + Math.hypot(c.x - C0, c.y - C0) * 1e-3;
};
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- pixel canvases
const HAS_FILTER = (() => {
  const c = document.createElement('canvas').getContext('2d');
  return typeof c.filter === 'string' && (c.filter = 'blur(1px)', c.filter === 'blur(1px)');
})();

// ---------------------------------------------------------------- helpers
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

function inRoundRect(x, y, hx0, hy0, hw, hh, r) {
  const qx = Math.abs(x - hx0) - hw + r, qy = Math.abs(y - hy0) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
}

function compileShader(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// ---------------------------------------------------------------- GL
const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes; uniform float uDpr; uniform float uScale;
uniform vec2 uC; uniform vec2 uTH; uniform float uTR;
uniform vec2 uK; uniform vec2 uKH; uniform float uKR;
uniform float uTheme, uTime, uLed, uLift;
uniform vec4 uBox;
uniform float uSurface;          // 0 = scene（全场景环境底）, 1 = plinth（圆角底板 + 透明羽化边）
uniform sampler2D uPix, uGlow;

uniform vec3 uLight;
uniform float uTheta, uHalfW, uRefract, uFrost, uGlowAmt, uMode, uStripLen;
uniform vec2 uStrip;
#define AMBER uLight
float gPixA = 0.;

// One glow model for both themes. On dark, light adds. On a bright surface adding does
// nothing, so emit as a saturated tint with the same falloff: same perceived strength.
vec3 glow(vec3 col, float amt){
  vec3 dark = col + uLight * amt;
  vec3 lit  = mix(col, uLight * 1.04 + 0.03, clamp(1. - exp(-amt * 1.3), 0., 0.88));
  return mix(dark, lit, uTheme);
}

float sdRB(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.)) + min(max(q.x,q.y),0.) - r; }
float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }

float tex(sampler2D s, vec2 p){
  vec2 uv = (p - uBox.xy) / uBox.zw;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return 0.;
  return texture(s, uv).a;
}

// The light strip hugs the glass from outside and travels around its perimeter.
// uTheta = angular centre of the strip, uHalfW = angular half-length.
float ledSd(vec2 p){
  if (uMode > 0.5) {
    // Track mode: strip runs along the inside wall of the container, centred on uStrip.
    float rad = sdRB(p - uC, uTH, uTR) + 6.5;
    float tang = max(length(p - uStrip) - uStripLen, 0.);
    return length(vec2(rad, tang)) - 1.5;
  }
  vec2 q = p - uK;
  float sk = sdRB(q, uKH, uKR);
  float a = atan(q.y, q.x);
  float da = abs(atan(sin(a - uTheta), cos(a - uTheta)));
  float tang = max(da - uHalfW, 0.) * 104.;
  float rad = sk - 6.5;
  return length(vec2(rad, tang)) - 1.5;
}

// light from the LED as it washes the track floor
float ledFloor(vec2 p){
  float ls = max(ledSd(p), 0.);
  return (exp(-ls/14.)*0.85 + exp(-ls/55.)*0.32) * uLed;
}

// The world under the glass: track floor + LED wash + pixel matrix.
vec3 floorScene(vec2 p, float frost, vec2 ca){
  float th = uTheme;
  vec3 base = mix(vec3(0.030), vec3(0.900), th);
  base *= 1. + (p.y - uC.y)/uTH.y * mix(0.05, 0.012, th);
  float sOff = sdRB(p - uC - vec2(0., 7.), uTH, uTR);
  float inner = smoothstep(-14., 3., sOff);
  base = mix(base * (1. - inner*0.6), base - inner*0.085, th);

  float g = ledFloor(p);
  base = glow(base, g*0.55);

  vec3 a;
  a.r = mix(tex(uPix, p - ca), tex(uGlow, p - ca)*1.35, frost);
  a.g = mix(tex(uPix, p     ), tex(uGlow, p     )*1.35, frost);
  a.b = mix(tex(uPix, p + ca), tex(uGlow, p + ca)*1.35, frost);
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float inkT = smoothstep(0.40, 0.56, lum);
  vec3 pc = mix(vec3(1.0, 0.965, 0.925), vec3(0.11, 0.105, 0.10), inkT);
  pc = mix(pc + AMBER*g*0.9, pc + vec3(0.25,0.08,0.0)*g, th);
  gPixA = clamp(a.g, 0., 1.);
  vec3 col = mix(base, pc, clamp(a, 0., 1.));
  col += vec3(1.0, 0.78, 0.55) * tex(uGlow, p) * uGlowAmt * (1. - th);
  return col;
}

void main(){
  vec2 praw = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 p = uC + (praw - uC) / uScale; // design space: everything below is authored at desktop size
  vec2 vp = uRes / uDpr;
  vec2 uv = praw / vp;
  float th = uTheme;

  // ---- base: scene page background, or a feathered plinth plate
  float pm = 1.0;
  vec3 col;
  if (uSurface < 0.5) {
    float sky = smoothstep(1.5, 0.0, length((uv - vec2(0.92, -0.08)) * vec2(1.0, 1.25)));
    vec3 dBg = mix(vec3(0.040), vec3(0.120), sky);
    vec3 lBg = mix(vec3(0.800), vec3(0.925), sky);
    col = mix(dBg, lBg, th);
  } else {
    float pd = sdRB(p - uC, uTH + 56., uTR + 56.);
    pm = 1. - smoothstep(0., 26., pd);
    col = mix(vec3(0.032), vec3(0.880), th);
    col *= 0.92 + 0.08 * (1. - smoothstep(18., 56., pd));
  }

  float st = sdRB(p - uC, uTH, uTR);
  float sh = 1. - smoothstep(-10., 34., sdRB(p - uC - vec2(0., 14.), uTH, uTR));
  col *= 1. - sh * mix(0.5, 0.17, th);
  float sh2 = 1. - smoothstep(-2., 4., sdRB(p - uC - vec2(0., 1.5), uTH, uTR));
  col *= 1. - sh2 * mix(0.3, 0.08, th);

  // LED spill onto the page / plate
  float ls = max(ledSd(p), 0.);
  float spill = (exp(-ls/18.)*0.5 + exp(-ls/85.)*0.34) * uLed;
  col = glow(col, spill*0.6);

  // ---- track
  if (st < 2.) {
    vec3 tc = floorScene(p, 0., vec2(0.));
    float sk0 = sdRB(p - uK - vec2(0., 7. + uLift*5.), uKH, uKR);
    float ksh = 1. - smoothstep(-8., 20. + uLift*8., sk0);
    tc *= 1. - ksh * mix(0.6, 0.2, th);
    float rim = 1. - smoothstep(0., 1.3, abs(st + 0.75));
    float bottom = smoothstep(-uTH.y*0.6, uTH.y, p.y - uC.y);
    tc += rim * mix(mix(0.035, 0.09, bottom), mix(-0.07, 0.07, bottom), th);
    col = mix(tc, col, smoothstep(-0.6, 0.6, st));
  }

  // ---- glass knob
  float sk = sdRB(p - uK, uKH, uKR);
  if (sk < 2.) {
    vec2 e = vec2(0.5, 0.);
    vec2 n = vec2(sdRB(p + e.xy - uK, uKH, uKR) - sdRB(p - e.xy - uK, uKH, uKR),
                  sdRB(p + e.yx - uK, uKH, uKR) - sdRB(p - e.yx - uK, uKH, uKR));
    n = n / max(length(n), 1e-4);
    float d = max(-sk, 0.);
    float t = clamp(d / 26., 0., 1.);
    float slope = pow(1. - t, 2.6);

    // refraction: bevel bends rays inward, centre magnifies slightly
    vec2 off = -n * slope * uRefract - (p - uK) * 0.055;
    float frost = 0.06 + uFrost * slope;
    vec3 g = floorScene(p + off, frost, n * slope * 3.2 + (p - uK) * 0.006);

    float vy = clamp((p.y - (uK.y - uKH.y)) / (2. * uKH.y), 0., 1.);
    vec3 dGlass = g * 0.84 + vec3(0.135) * (1. - vy * 0.55);
    vec3 lGlass = mix(g, vec3(0.99), 0.5 * (1. - gPixA * 0.8));
    vec3 kc = mix(dGlass, lGlass, th);

    // LED light entering the glass from below and scattering inside it
    float lq = max(ledSd(p), 0.);
    float sc = (exp(-lq / 24.) * 0.8 + exp(-lq / 64.) * 0.2) * uLed;
    kc = glow(kc, sc * 0.8);
    // light trapped in the bevel (total internal reflection), strongest near the source
    float rg = exp(-d / 2.2) * exp(-lq / 40.) * uLed;
    kc = glow(kc, rg * 1.3);

    // specular
    vec2 Ld = normalize(vec2(-0.35, -1.0));
    float ndl = dot(n, Ld);
    kc += pow(max(ndl, 0.), 2.) * exp(-d / 1.25) * mix(0.42, 0.7, th);
    kc += max(ndl, 0.) * slope * mix(0.07, 0.16, th);
    kc *= 1. - max(-ndl, 0.) * slope * mix(0.28, 0.07, th);
    kc += exp(-d / 0.7) * mix(0.07, 0.12, th);

    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }

  // ---- the light source itself
  float lsd = ledSd(p);
  float lm = 1. - smoothstep(-0.6, 0.6, lsd);
  vec3 lc = mix(uLight * 1.05, mix(uLight, vec3(1.0), 0.65), smoothstep(-0.2, -1.4, lsd));
  col = mix(col, lc * (0.8 + 0.35 * uLed), lm);
  col = glow(col, exp(-max(lsd, 0.) / 4.5) * 0.55 * uLed * (1. - lm));

  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.022;
  o = vec4(clamp(col, 0., 1.), uSurface < 0.5 ? 1.0 : pm);
}`;

// ---------------------------------------------------------------- config
// 通用默认值：开箱即一颗可嵌任意页面的中性开关；日/夜场景经 preset="day-night" 恢复。
const DEFAULTS = {
  surface: 'plinth',      // 'plinth' = 圆角底板 + 透明羽化边；'scene' = 全场景环境底色（占满元素盒）
  theme: 'dark',          // 'dark' / 'light' = 固定表面明暗；'auto' = 跟随开关位置（日/夜行为）
  onIcon: 'power',
  offIcon: 'power',
  onColor: '#34d399',     // 开（薄荷绿）
  offColor: '#7c8598',    // 关（冷灰）
  path: 'glass',          // 'glass' = light strip hugs the knob, 'track' = it runs inside the container wall
  intensity: 1.89,
  lightWidth: 0.92,       // strip length (rad around the glass; ×130 px along the track)
  orbit: true,            // strip travels bottom ⇄ top
  trackIcons: false,      // dim copies of both icons printed on the track
  refraction: 40,
  frost: 0.76,
  swirl: 1.62,
  burst: 0.38,
  glow: 0.64,
  stiffness: 129,
};

const PRESET_DAY_NIGHT = {
  surface: 'scene', theme: 'auto',
  onIcon: 'sun', offIcon: 'moon',
  onColor: '#ffa82e', offColor: '#6f86ff',
};

const HEX_RE = /^#[0-9a-f]{6}$/i;

const SHADOW_CSS = `
  :host { display: block; position: relative; }
  :host([hidden]) { display: none; }
  canvas {
    position: absolute; inset: 0; width: 100%; height: 100%; display: block;
    /* pan-y：触屏竖向滑动交给页面滚动，横向拖拽仍由组件接管（把手拖动是横向为主） */
    touch-action: pan-y; -webkit-tap-highlight-color: transparent;
  }
  canvas { overscroll-behavior: none; -webkit-user-select: none; user-select: none; }
  canvas:focus-visible { outline: 2px solid rgba(128, 128, 128, 0.65); outline-offset: 6px; }
  .hint {
    position: absolute; left: 0; right: 0; bottom: calc(36px + env(safe-area-inset-bottom));
    text-align: center;
    font: 500 11px/1 -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: rgba(255,255,255,0.28); pointer-events: none; user-select: none;
    transition: color 0.6s ease;
  }
  .fallback {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: #0d0d0d; color: rgba(255,255,255,0.55); text-align: center;
    font: 13px/1.6 -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif; padding: 16px;
  }
`;

export class GlassToggle extends HTMLElement {
  static get observedAttributes() {
    return ['checked', 'zoom', 'path', 'theme', 'surface', 'preset',
      'on-icon', 'off-icon', 'on-color', 'off-color', 'disabled', 'hint', 'label'];
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${SHADOW_CSS}</style>
      <canvas part="canvas" tabindex="0" role="switch" aria-checked="false"></canvas>
      <div class="hint" part="hint"></div>
    `;
    this._canvas = root.querySelector('canvas');
    this._hintEl = root.querySelector('.hint');
    this._fallbackEl = null;

    // ---------------------------------------------------------------- tunables
    this._P = { ...DEFAULTS };
    this._zoom = 1;
    this._themeMode = DEFAULTS.theme;   // 'auto' | 'dark' | 'light'
    this._surface = DEFAULTS.surface;   // 'scene' | 'plinth'
    this._disabled = false;
    this._iconKey = '';
    this._sprOff = null;
    this._sprOn = null;

    // ---------------------------------------------------------------- state
    this._state = {
      p: 0, v: 0, target: 0,
      dragging: false, dragStartX: 0, dragStartP: 0, moved: 0, lastX: 0, lastT: 0, dragV: 0,
      hover: 0, hoverT: 0, press: 0, pressT: 0, led: 1, kick: 0, dir: 1, sp: 0, spv: 0,
      pendingClick: false,
    };
    this._PIX = pairUp(buildPower(), buildPower());
    this._lit = false;
    this._connected = false;
    this._visible = true; // IntersectionObserver 报告前先乐观假设可见
    this._raf = 0;
    this._lastT = performance.now();

    // per-instance buffers, sized to the toggle plus glow margin
    this._box = { x: 0, y: 0, w: TRACK.w + 120, h: TRACK.h + 120 };
    this._pcan = document.createElement('canvas');
    this._pctx = this._pcan.getContext('2d');
    this._gcan = document.createElement('canvas');
    this._gctx = this._gcan.getContext('2d');

    this._dpr = 1; this._vw = 0; this._vh = 0;
    this._cx = 0; this._cy = 0; this._S = 1;
    this._leftX = 0; this._rightX = 0;

    this._gl = null;
    this._initGL();

    this._readAttrs();
    this._applyHintText();

    this._bindInput();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this);
    // 视口外的实例暂停整个渲染循环（多实例页面只给可见实例花 GPU/CPU）
    this._io = new IntersectionObserver(entries => {
      const vis = entries.some(e => e.isIntersecting);
      if (vis === this._visible) return;
      this._visible = vis;
      if (vis) {
        if (this._connected && this._gl) {
          this._lastT = performance.now();
          this._raf = requestAnimationFrame(t => this._frame(t));
        }
      } else {
        cancelAnimationFrame(this._raf);
      }
    }, { rootMargin: '120px' });
    this._io.observe(this);
  }

  // ---------------------------------------------------------------- public API
  /** 当前是否为「开」状态 */
  get checked() { return this._state.target > 0.5; }
  set checked(v) { this._setTarget(v ? 1 : 0, 0.6); }

  /** 在开/关之间切换 */
  toggle() { this._setTarget(this._state.target > 0.5 ? 0 : 1, 1); }

  // ---------------------------------------------------------------- lifecycle
  connectedCallback() {
    this._connected = true;
    this._applyLabel();
    this._applyDisabled();
    this._resize();
    if (this._visible && this._gl) {
      this._lastT = performance.now();
      this._raf = requestAnimationFrame(t => this._frame(t));
    }
  }

  disconnectedCallback() {
    this._connected = false;
    cancelAnimationFrame(this._raf);
  }

  attributeChangedCallback(name, _old, value) {
    if (this._P == null) return;
    switch (name) {
      case 'zoom': {
        const z = parseFloat(value);
        this._zoom = Number.isFinite(z) ? Math.max(0.5, z) : 1;
        this._resize();
        break;
      }
      case 'checked': {
        const v = value !== null && value !== 'false' && value !== '0';
        if ((v ? 1 : 0) !== this._state.target) this._setTarget(v ? 1 : 0, 0.6);
        break;
      }
      case 'disabled':
        this._applyDisabled();
        break;
      case 'hint':
        this._applyHintText();
        break;
      case 'label':
        this._applyLabel();
        break;
      default:
        // path / theme / surface / preset / on-icon / off-icon / on-color / off-color
        this._syncConfig();
        break;
    }
  }

  // preset 提供基底值，显式属性优先
  _syncConfig() {
    const get = n => this.getAttribute(n);
    const preset = get('preset') === 'day-night' ? PRESET_DAY_NIGHT : {};
    const cfg = {
      surface: get('surface') || preset.surface || DEFAULTS.surface,
      theme: get('theme') || preset.theme || DEFAULTS.theme,
      onIcon: get('on-icon') || preset.onIcon || DEFAULTS.onIcon,
      offIcon: get('off-icon') || preset.offIcon || DEFAULTS.offIcon,
      onColor: get('on-color') || preset.onColor || DEFAULTS.onColor,
      offColor: get('off-color') || preset.offColor || DEFAULTS.offColor,
    };
    this._P.path = get('path') === 'track' ? 'track' : 'glass';
    this._P.onColor = HEX_RE.test(cfg.onColor) ? cfg.onColor : DEFAULTS.onColor;
    this._P.offColor = HEX_RE.test(cfg.offColor) ? cfg.offColor : DEFAULTS.offColor;
    this._themeMode = ['auto', 'dark', 'light'].includes(cfg.theme) ? cfg.theme : DEFAULTS.theme;
    this._surface = cfg.surface === 'scene' ? 'scene' : 'plinth';

    const onKey = cfg.onIcon + '|' + cfg.offIcon;
    if (onKey !== this._iconKey) {
      this._iconKey = onKey;
      this._sprOff = resolveSprite(cfg.offIcon) || buildPower();
      this._sprOn = resolveSprite(cfg.onIcon) || buildPower();
      this._PIX = pairUp(this._sprOff, this._sprOn);
      for (const px of this._PIX) px.inited = false;
    }
  }

  _applyLabel() {
    this._canvas.setAttribute('aria-label', this.getAttribute('label') || 'Glass toggle');
  }

  _applyDisabled() {
    const v = this.getAttribute('disabled');
    this._disabled = v !== null && v !== 'false' && v !== '0';
    this._canvas.setAttribute('aria-disabled', String(this._disabled));
    if (this._disabled) {
      this._state.hoverT = 0;
      this._canvas.style.cursor = 'default';
    }
  }

  _applyHintText() {
    if (!this._hintEl) return;
    const attr = this.getAttribute('hint');
    if (attr !== null) {
      if (attr === 'none' || attr === '') { this._hintEl.textContent = ''; this._hintEl.hidden = true; return; }
      this._hintEl.hidden = false; this._hintEl.textContent = attr; return;
    }
    this._hintEl.hidden = false;
    this._hintEl.textContent = matchMedia('(hover: none)').matches ? 'Tap or drag' : 'Click or drag';
  }

  _readAttrs() {
    for (const name of GlassToggle.observedAttributes) {
      this.attributeChangedCallback(name, null, this.getAttribute(name));
    }
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  _setTarget(v, kick = 0) {
    const s = this._state;
    const nv = v > 0.5 ? 1 : 0;
    const changed = s.target !== nv;
    s.target = nv;
    s.kick = Math.max(s.kick, kick);
    if (!changed) return;
    this._canvas.setAttribute('aria-checked', String(nv > 0.5));
    if (nv > 0.5) { if (!this.hasAttribute('checked')) this.setAttribute('checked', ''); }
    else if (this.hasAttribute('checked')) this.removeAttribute('checked');
    this._emit('change', { checked: nv > 0.5 });
  }

  // ---------------------------------------------------------------- geometry
  // Point on the track's inner wall (inset 6.5px), by arc length u measured from
  // bottom-centre heading right (bottom → right end → top → left end → bottom).
  _trackPoint(u) {
    const cx = this._cx, cy = this._cy;
    const ins = 6.5, hx = TRACK.w / 2 - ins, hy = TRACK.h / 2 - ins, r = TRACK.r - ins;
    const a = hx - r, b = 2 * (hy - r), q = Math.PI * r / 2;
    const segs = [
      [a, t => [t, hy]],
      [q, t => { const th = Math.PI / 2 - t / r; return [a + r * Math.cos(th), (hy - r) + r * Math.sin(th)]; }],
      [b, t => [hx, (hy - r) - t]],
      [q, t => { const th = -t / r; return [a + r * Math.cos(th), -(hy - r) + r * Math.sin(th)]; }],
      [2 * a, t => [a - t, -hy]],
      [q, t => { const th = -Math.PI / 2 - t / r; return [-a + r * Math.cos(th), -(hy - r) + r * Math.sin(th)]; }],
      [b, t => [-hx, -(hy - r) + t]],
      [q, t => { const th = Math.PI - t / r; return [-a + r * Math.cos(th), (hy - r) + r * Math.sin(th)]; }],
      [a, t => [-a + t, hy]],
    ];
    const per = segs.reduce((s, [l]) => s + l, 0);
    u = ((u % per) + per) % per;
    for (const [l, fn] of segs) { if (u <= l) { const [x, y] = fn(u); return [cx + x, cy + y]; } u -= l; }
    return [cx, cy + hy];
  }

  _trackPerimeter() {
    const ins = 6.5, hx = TRACK.w / 2 - ins, hy = TRACK.h / 2 - ins, r = TRACK.r - ins;
    return 4 * (hx - r) + 4 * (hy - r) + 2 * Math.PI * r;
  }

  // ---------------------------------------------------------------- GL setup
  _initGL() {
    const canvas = this._canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
    if (!gl) return this._fallback('此组件需要支持 WebGL2 的浏览器');
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
    } catch (err) {
      console.error('[glass-toggle]', err);
      return this._fallback('着色器初始化失败');
    }
    this._gl = gl;
    this._prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    for (const n of ['uScale', 'uMode', 'uStrip', 'uStripLen', 'uLight', 'uTheta', 'uHalfW', 'uRefract', 'uFrost', 'uGlowAmt', 'uRes', 'uDpr', 'uC', 'uTH', 'uTR', 'uK', 'uKH', 'uKR', 'uTheme', 'uTime', 'uLed', 'uLift', 'uBox', 'uSurface', 'uPix', 'uGlow'])
      U[n] = gl.getUniformLocation(prog, n);
    this._U = U;

    const mkTex = unit => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this._texPix = mkTex(0);
    this._texGlow = mkTex(1);
    gl.uniform1i(U.uPix, 0);
    gl.uniform1i(U.uGlow, 1);
  }

  _fallback(msg) {
    this._gl = null;
    if (this._fallbackEl) return;
    const div = document.createElement('div');
    div.className = 'fallback';
    div.textContent = msg;
    this.shadowRoot.appendChild(div);
    this._fallbackEl = div;
    this._hintEl && this._hintEl.remove();
    this._hintEl = null;
  }

  _resize() {
    if (!this._gl) return;
    const vw = this.clientWidth, vh = this.clientHeight;
    if (vw < 12 || vh < 12) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._dpr = dpr; this._vw = vw; this._vh = vh;
    const canvas = this._canvas;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    this._cx = vw / 2; this._cy = vh / 2 - 10;
    // screen px per design px: the toggle is laid out at desktop size and scaled to fit
    this._S = Math.min(this._zoom, (vw - 36) / (TRACK.w + 24), (vh - 120) / (TRACK.h + 160));
    const inner = TRACK.w / 2 - PAD - KNOB_HALF;
    this._leftX = this._cx - inner;
    this._rightX = this._cx + inner;
    const box = this._box;
    box.x = this._cx - box.w / 2;
    box.y = this._cy - box.h / 2;
    this._pcan.width = Math.round(box.w * dpr);
    this._pcan.height = Math.round(box.h * dpr);
    this._gcan.width = Math.round(box.w * dpr / 2);
    this._gcan.height = Math.round(box.h * dpr / 2);
    this._gl.viewport(0, 0, canvas.width, canvas.height);
    for (const px of this._PIX) px.inited = false;
  }

  // ---------------------------------------------------------------- simulation
  _pixelTarget(px, p, time, kx) {
    // Translation is carried by the glass; the morph is a local rearrangement around it.
    const P = this._P;
    const t = Math.min(1, Math.max(0, (p - px.delay) / 0.62));
    const e = easeIO(t);
    const ox = (px.a.x - C0) * PITCH, oy = (px.a.y - C0) * PITCH;
    const tx = (px.b.x - C0) * PITCH, ty = (px.b.y - C0) * PITCH;
    const dx = tx - ox, dy = ty - oy, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const arc = Math.sin(Math.PI * e);
    let x = ox + dx * e + nx * px.curl * P.swirl * arc;
    let y = oy + dy * e + ny * px.curl * P.swirl * arc;
    // breathe outward mid-morph, like the icon exhales and re-forms
    const r = Math.hypot(x, y) || 1;
    x += (x / r) * px.lift * arc * 1.4 * P.burst;
    y += (y / r) * px.lift * arc * 1.4 * P.burst;

    let ba = px.a.b, bb = px.b.b;
    if (px.a.kind === 'star') ba *= 0.45 + 0.55 * Math.pow(Math.sin(time * px.tw + px.phase), 2);
    if (px.b.kind === 'ray') bb *= 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(time * 2.2 - px.b.ang));
    const bright = (ba + (bb - ba) * e) * (1 + 0.3 * arc);
    const size = PSIZE * (1 - 0.45 * arc);
    return { x: kx + x, y: this._cy + y, bright, size };
  }

  _drawGhost(set, ox, alpha) {
    const pctx = this._pctx;
    for (const c of set) {
      pctx.globalAlpha = alpha * Math.max(c.b, 0.35);
      pctx.fillRect(ox + (c.x - C0) * PITCH - PSIZE / 2, this._cy + (c.y - C0) * PITCH - PSIZE / 2, PSIZE, PSIZE);
    }
  }

  // ---------------------------------------------------------------- frame loop
  _frame(now) {
    if (this._connected && this._visible) this._raf = requestAnimationFrame(t => this._frame(t));
    if (!this._gl) return;

    const dt = Math.min(1 / 30, (now - this._lastT) / 1000);
    this._lastT = now;
    const time = now / 1000;
    const s = this._state;
    const P = this._P;
    const gl = this._gl;
    const U = this._U;
    const canvas = this._canvas;
    const dpr = this._dpr;
    const cx = this._cx, cy = this._cy;
    const leftX = this._leftX, rightX = this._rightX;
    const S = this._S;

    if (canvas.width < 24 || canvas.height < 24) return;

    // knob position spring (scrubbed directly while dragging)
    if (!s.dragging) {
      const k = P.stiffness, c = 2 * Math.sqrt(k) * 0.6;
      const steps = 4, h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const a = -k * (s.p - s.target) - c * s.v;
        s.v += a * h; s.p += s.v * h;
      }
    }
    s.hover += (s.hoverT - s.hover) * Math.min(1, dt * 10);
    s.press += (s.pressT - s.press) * Math.min(1, dt * 18);
    s.kick *= Math.exp(-dt * 3.5);
    s.led = 1 + s.hover * 0.08 + Math.min(Math.abs(s.v) * 0.05, 0.18) + s.kick * 0.12;

    const pc = Math.min(1, Math.max(0, s.p));
    const over = Math.max(-s.p, s.p - 1, 0);
    const speed = Math.abs(s.v);
    const stretch = Math.min(speed * 6.5, 16);
    let khx = KNOB_HALF + stretch - over * 110;
    let khy = Math.min(KNOB_HALF - stretch * 0.45 + over * 30, KNOB_HALF + 5);
    const squeeze = 1 - s.press * 0.035;
    khx *= squeeze; khy *= squeeze;
    let kx = leftX + (rightX - leftX) * pc;
    if (s.p > 1) kx += over * 110; else if (s.p < 0) kx -= over * 110;
    // 表面明暗：auto 跟随开关位置；dark/light 固定
    const theme = this._themeMode === 'auto' ? smooth(0.18, 0.82, pc) : (this._themeMode === 'light' ? 1 : 0);

    // Light orbit. Leaving dark (p≈0) it sweeps bottom → leading (right) side → top;
    // leaving light it continues top → left side → bottom, so it keeps circling one way.
    // Direction is latched only at rest, so reversing mid-drag retraces the same arc.
    // The strip has its own eased, slightly lagging phase so it glides rather than being
    // welded to the knob: ease-in-out on the knob position, then a critically damped follow.
    {
      const goal = easeIO(pc), k = 70, c = 2 * Math.sqrt(k);
      s.spv += (-k * (s.sp - goal) - c * s.spv) * dt;
      s.sp += s.spv * dt;
    }
    const sp = Math.min(1, Math.max(0, s.sp));
    if (sp < 0.015) s.dir = 1; else if (sp > 0.985) s.dir = -1;
    const HALF = Math.PI / 2;
    let theta = s.dir > 0 ? HALF - Math.PI * sp : -HALF - Math.PI * (1 - sp);
    if (!P.orbit) theta = HALF;
    const cm = hex(P.offColor), cs = hex(P.onColor);
    // 灯光色跟随开关位置（表面明暗独立）：auto 模式下与原版逐位一致
    const colorMix = smooth(0.18, 0.82, pc);

    // Track mode: same story along the container wall. Dark rests on the bottom under the knob,
    // light rests on the top above it; the strip travels the long way round the end of the track.
    let strip = [kx, cy + TRACK.h / 2];
    {
      const ins = 6.5, hx = TRACK.w / 2 - ins, hy = TRACK.h / 2 - ins, r = TRACK.r - ins;
      const a = hx - r, b = 2 * (hy - r), q = Math.PI * r / 2;
      const u0 = 0;                     // middle of the bottom edge
      const u1 = a + q + b + q + a;     // middle of the top edge (exactly half the perimeter)
      const per = this._trackPerimeter();
      let u = s.dir > 0 ? u0 + (u1 - u0) * sp : u1 + (per - u1) * (1 - sp);
      if (!P.orbit) u = (kx - cx); // stays on the bottom, following the knob
      strip = this._trackPoint(u);
    }

    // pixels: each one springs toward its path position (organic trailing)
    const kvx = s.v * (rightX - leftX); // knob speed, px/s
    for (const px of this._PIX) {
      const tg = this._pixelTarget(px, pc, time, 0);
      const rx = tg.x, ry = tg.y - cy; // offset relative to the glass centre
      if (!px.inited) { px.x = rx; px.y = ry; px.vx = 0; px.vy = 0; px.inited = true; }
      const kk = px.k, cc = 2 * Math.sqrt(kk) * 0.72;
      px.vx += (-kk * (px.x - rx) - cc * px.vx) * dt;
      px.vy += (-kk * (px.y - ry) - cc * px.vy) * dt;
      px.x += px.vx * dt; px.y += px.vy * dt;
      const drag = Math.max(-14, Math.min(14, -kvx * px.drag));
      px.sx = kx + px.x + drag; px.sy = cy + px.y;
      px.bright = tg.bright; px.size = tg.size;
    }

    // raster pixels
    const pctx = this._pctx, gctx = this._gctx;
    const pcan = this._pcan, gcan = this._gcan;
    const box = this._box;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, pcan.width, pcan.height);
    pctx.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr);
    pctx.fillStyle = '#fff';
    pctx.globalCompositeOperation = 'source-over';
    for (const px of this._PIX) {
      if (px.bright <= 0.002) continue;
      pctx.globalAlpha = Math.min(1, px.bright);
      const sz = px.size;
      pctx.fillRect(px.sx - sz / 2, px.sy - sz / 2, sz, sz);
    }
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, gcan.width, gcan.height);
    if (HAS_FILTER) {
      gctx.filter = `blur(${4 * dpr / 2}px)`;
      gctx.drawImage(pcan, 0, 0, gcan.width, gcan.height);
      gctx.filter = 'none';
    } else {
      // poor man's blur: a ring of offset, faint copies
      const r = 3 * dpr / 2;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        gctx.globalAlpha = 0.16;
        gctx.drawImage(pcan, Math.cos(a) * r, Math.sin(a) * r, gcan.width, gcan.height);
      }
      gctx.globalAlpha = 1;
    }
    // dim "unlit" icons sit underneath
    pctx.globalCompositeOperation = 'destination-over';
    if (P.trackIcons) {
      this._drawGhost(this._sprOff, leftX, 0.12);
      this._drawGhost(this._sprOn, rightX, 0.12);
    }
    pctx.globalCompositeOperation = 'source-over';
    pctx.globalAlpha = 1;

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this._texPix);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pcan);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this._texGlow);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gcan);

    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uScale, S);
    gl.uniform2f(U.uC, cx, cy);
    gl.uniform2f(U.uTH, TRACK.w / 2, TRACK.h / 2);
    gl.uniform1f(U.uTR, TRACK.r);
    gl.uniform2f(U.uK, kx, cy);
    gl.uniform2f(U.uKH, khx, khy);
    gl.uniform1f(U.uKR, Math.min(KNOB_R, khx - 1, khy - 1));
    gl.uniform1f(U.uTheme, theme);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uLed, s.led * P.intensity * (this._disabled ? 0.25 : 1));
    gl.uniform3f(U.uLight, cm[0] + (cs[0] - cm[0]) * colorMix, cm[1] + (cs[1] - cm[1]) * colorMix, cm[2] + (cs[2] - cm[2]) * colorMix);
    gl.uniform1f(U.uTheta, theta);
    gl.uniform1f(U.uHalfW, P.lightWidth);
    gl.uniform1f(U.uMode, P.path === 'track' ? 1 : 0);
    gl.uniform2f(U.uStrip, strip[0], strip[1]);
    gl.uniform1f(U.uStripLen, P.lightWidth * 130);
    gl.uniform1f(U.uRefract, P.refraction);
    gl.uniform1f(U.uFrost, P.frost);
    gl.uniform1f(U.uGlowAmt, P.glow);
    gl.uniform1f(U.uLift, s.hover * (1 - s.press));
    gl.uniform4f(U.uBox, box.x, box.y, box.w, box.h);
    gl.uniform1f(U.uSurface, this._surface === 'plinth' ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (this._hintEl) this._hintEl.style.color = theme > 0.5 ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.26)';
    if (this._themeMode === 'auto') {
      const lit = theme > 0.5;
      if (lit !== this._lit) {
        this._lit = lit;
        this._emit('themechange', { lit, checked: this.checked });
      }
    }
  }

  // ---------------------------------------------------------------- input
  _overTrack(x, y) {
    return inRoundRect(x, y, this._cx, this._cy, TRACK.w / 2, TRACK.h / 2, TRACK.r);
  }
  _knobX() {
    return this._leftX + (this._rightX - this._leftX) * Math.min(1, Math.max(0, this._state.p));
  }
  _overKnob(x, y) {
    return inRoundRect(x, y, this._knobX(), this._cy, KNOB_HALF, KNOB_HALF, KNOB_R);
  }
  _toD(x, y) {
    return [this._cx + (x - this._cx) / this._S, this._cy + (y - this._cy) / this._S];
  }
  _local(e) {
    const r = this._canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  _bindInput() {
    const canvas = this._canvas;

    canvas.addEventListener('pointermove', e => {
      const s = this._state;
      const [lx, ly] = this._local(e);
      const [dxp, dyp] = this._toD(lx, ly);
      const ot = this._overTrack(dxp, dyp) && !this._disabled;
      canvas.style.cursor = s.dragging ? 'grabbing' : ot ? 'pointer' : 'default';
      s.hoverT = ot && e.pointerType === 'mouse' ? 1 : 0;
      if (!s.dragging) return;
      const dx = (lx - s.dragStartX) / this._S;
      s.moved = Math.max(s.moved, Math.abs(dx) * this._S);
      const rightX = this._rightX, leftX = this._leftX;
      let p = s.dragStartP + dx / (rightX - leftX);
      if (p > 1) p = 1 + (p - 1) * 0.22;
      if (p < 0) p = p * 0.22;
      const t = performance.now();
      const ddt = Math.max(1, t - s.lastT) / 1000;
      s.dragV = s.dragV * 0.6 + ((p - s.p) / ddt) * 0.4;
      s.v = s.dragV; s.p = p; s.lastT = t;
    });

    canvas.addEventListener('pointerdown', e => {
      if (this._disabled) return;
      const [lx, ly] = this._local(e);
      const [dxp, dyp] = this._toD(lx, ly);
      if (!this._overTrack(dxp, dyp)) return;
      const s = this._state;
      canvas.setPointerCapture(e.pointerId);
      s.pressT = 1; s.moved = 0;
      if (this._overKnob(dxp, dyp)) {
        s.dragging = true; s.dragStartX = lx; s.dragStartP = s.p; s.lastT = performance.now(); s.dragV = 0;
      } else {
        s.pendingClick = true;
      }
    });

    const release = () => {
      const s = this._state;
      s.pressT = 0;
      if (this._disabled) { s.pendingClick = false; return; }
      if (s.dragging) {
        s.dragging = false;
        if (s.moved < 4) this.toggle();
        else this._setTarget((s.p + s.dragV * 0.15) > 0.5 ? 1 : 0, 0.6);
      } else if (s.pendingClick) this.toggle();
      s.pendingClick = false;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => { this._state.hoverT = 0; });

    canvas.addEventListener('keydown', e => {
      if (this._disabled) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        this.toggle();
      }
    });
  }
}

customElements.define('glass-toggle', GlassToggle);

export default GlassToggle;
