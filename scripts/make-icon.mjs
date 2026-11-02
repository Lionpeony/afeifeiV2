/**
 * 生成 build/icon.ico（M8-3：exe 属性里要有图标）。
 *
 * 零依赖：RGBA 像素 → 手工 PNG 编码（node:zlib 压缩 + CRC32）→ ICO 封装
 * （256×256 的 PNG-in-ICO，Vista 起原生支持）。图案是程序画的：
 * 深底 + 品牌红圆 + 同心圆槽——黑胶唱机的极简形。
 *
 * 跑法：node scripts/make-icon.mjs（产物 build/icon.ico，electron-builder 自动拾取）
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIZE = 256;
const OUT = path.resolve("build/icon.ico");

/* ---- 画：黑胶唱机极简形（中心距判定，无抗锯齿字模） ---- */
function drawPixel(x, y) {
  const dx = x - SIZE / 2;
  const dy = y - SIZE / 2;
  const r = Math.hypot(dx, dy);
  const R = SIZE / 2 - 4;
  if (r > R) return [0, 0, 0, 0]; // 圆外透明
  if (r > R * 0.92) return [26, 26, 28, 255]; // 边缘暗环
  if (r > R * 0.18) {
    // 唱片槽：同心明暗条纹
    const groove = Math.sin((r / R) * 60) > 0 ? [42, 42, 46, 255] : [30, 30, 34, 255];
    return groove;
  }
  if (r > R * 0.08) return [224, 92, 92, 255]; // 品牌红标
  return [250, 245, 240, 255]; // 中孔
}

const raw = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const [r, g, b, a] = drawPixel(x, y);
    const i = (y * SIZE + x) * 4;
    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
    raw[i + 3] = a;
  }
}

/* ---- PNG 编码（RGBA8，filter 0 逐行） ---- */
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const stride = SIZE * 4;
const scanlines = Buffer.alloc((stride + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  scanlines[y * (stride + 1)] = 0; // filter none
  raw.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

/* ---- ICO 封装：单条目 256×256（宽高字段 0 = 256） ---- */
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = 0; // width 256
entry[1] = 0; // height 256
entry[2] = 0; // palette
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16, 12); // data offset

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, entry, png]));
console.log(`icon → ${OUT}（${fs.statSync(OUT).size} 字节）`);
