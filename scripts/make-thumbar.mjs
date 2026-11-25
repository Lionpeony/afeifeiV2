/**
 * 生成任务栏缩略图按钮图标（P1 系统集成）：thumb-{prev,play,pause,next}.png（32×32）。
 *
 * 零依赖：程序画形 + 4× 超采样降噪 → 手工 PNG 编码（同 scripts/make-icon.mjs）。
 * Windows 缩略图按钮只有 16px 可视区，先在 32px 出图让系统按 DPI 缩。
 * 产物落 src/renderer/ui/af/assets/，scripts/build.mjs 会整体拷进 dist/renderer/assets。
 *
 * 跑法：node scripts/make-thumbar.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIZE = 32;
const SS = 4; // 每像素 4×4 采样
const OUT_DIR = path.resolve("src/renderer/ui/af/assets");

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** 三角形：用三条边的叉积同号判断（顺时针/逆时针都能过） */
function inTri(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

const PLAY = [[0.34, 0.2], [0.34, 0.8], [0.8, 0.5]];
const PREV_TRI = [[0.8, 0.2], [0.8, 0.8], [0.35, 0.5]];
const NEXT_TRI = [[0.2, 0.2], [0.2, 0.8], [0.65, 0.5]];

const SHAPES = {
  play: (x, y) => inTri(x, y, ...PLAY),
  pause: (x, y) => inRect(x, y, 0.31, 0.2, 0.45, 0.8) || inRect(x, y, 0.55, 0.2, 0.69, 0.8),
  prev: (x, y) => inRect(x, y, 0.2, 0.2, 0.31, 0.8) || inTri(x, y, ...PREV_TRI),
  next: (x, y) => inRect(x, y, 0.69, 0.2, 0.8, 0.8) || inTri(x, y, ...NEXT_TRI),
};

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(raw, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const scanlines = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) raw.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, hit] of Object.entries(SHAPES)) {
  const raw = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          if (hit((x + (sx + 0.5) / SS) / SIZE, (y + (sy + 0.5) / SS) / SIZE)) hits += 1;
        }
      }
      const i = (y * SIZE + x) * 4;
      // 白色字形（任务栏缩略图按钮固定深底，白图最稳）
      raw[i] = 255;
      raw[i + 1] = 255;
      raw[i + 2] = 255;
      raw[i + 3] = Math.round((hits / (SS * SS)) * 255);
    }
  }
  const file = path.join(OUT_DIR, `thumb-${name}.png`);
  fs.writeFileSync(file, encodePng(raw, SIZE));
  console.log(`✓ ${path.relative(process.cwd(), file)}`);
}
