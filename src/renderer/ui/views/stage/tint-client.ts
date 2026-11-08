/**
 * 取色主线程那一半（M9-2）：封面**已经解码**用于壁纸/封面显示，这里只从
 * 已解码位图取中心 8×8 采样（一次 drawImage + getImageData，微秒级），
 * 把 64 个像素交给 Worker 做量化。重活（解码在前、量化在后）都不在主线程。
 *
 * 失败一律静默：远程封面跨域污染画布（SecurityError）、图挂了、Worker 没起来——
 * 全部回落到"保留当前 tint"，取色失败不许影响播放页（00 §9.3 纪律）。
 */

type TintCb = (tint: string | null) => void;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, TintCb>();

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker("tint-worker.js");
    worker.onmessage = (e: MessageEvent) => {
      const { id, tint } = e.data as { id: number; tint: string | null };
      pending.get(id)?.(tint);
      pending.delete(id);
    };
    worker.onerror = () => {
      worker = null; // 下次重新起
    };
    return worker;
  } catch {
    return null;
  }
}

/** 从封面 URL 采样取色。结果经回调返回；失败回调 null。
    crossOrigin 必须在 src 之前给：远程 CDN 不回 CORS 头时图直接加载失败（onerror 回落），
    不给的话图能加载但 canvas 被污染，getImageData 抛 SecurityError —— 静默失败里最隐蔽的一种。 */
export function sampleCoverTint(src: string, cb: TintCb): void {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const side = Math.min(w, h);
      if (side === 0) return cb(null);
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx2d) return cb(null);
      ctx2d.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 8, 8);
      const data = ctx2d.getImageData(0, 0, 8, 8).data;
      const rgb: number[] = [];
      for (let i = 0; i < data.length; i += 4) rgb.push(data[i], data[i + 1], data[i + 2]);
      const w2 = ensureWorker();
      if (!w2) return cb(null);
      const id = (seq += 1);
      pending.set(id, cb);
      w2.postMessage({ id, rgb });
    } catch {
      cb(null); // 画布被跨域内容污染 → 取不了，保留当前 tint
    }
  };
  img.onerror = () => cb(null);
  img.src = src;
}

export type CoverTrim = { top: number; right: number; bottom: number; left: number };

/** 检测封面四边白边占比（0-1）。检测不出回调 null：
    - 单边 > 15% 不算白边（那是设计留白/纯白底封面，裁了反而毁图）；
    - < 2% 视为无（肉眼不可见）。
    素材背景：搜索来源的封面不少是「内容 + 白底」合成图，object-fit 裁不掉图内白边。
    crossOrigin 语义同 sampleCoverTint——没有它 canvas 就是污染的。 */
export function detectCoverTrim(src: string, cb: (trim: CoverTrim | null) => void): void {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w === 0 || h === 0) return cb(null);
      const canvas = document.createElement("canvas");
      const SW = 160;
      const SH = Math.max(80, Math.round((h / w) * SW));
      canvas.width = SW;
      canvas.height = SH;
      const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx2d) return cb(null);
      ctx2d.drawImage(img, 0, 0, SW, SH);
      const data = ctx2d.getImageData(0, 0, SW, SH).data;
      // 白 = 低饱和亮色：min 通道过 226、通道差 < 30（米白 245/240/230 与纯白都算）
      const isWhite = (i: number) =>
        Math.min(data[i], data[i + 1], data[i + 2]) > 226 &&
        Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) < 30;
      const rowWhite = (y: number) => {
        let ok = 0;
        for (let x = 0; x < SW; x++) if (isWhite((y * SW + x) * 4)) ok++;
        return ok / SW > 0.92;
      };
      const colWhite = (x: number) => {
        let ok = 0;
        for (let y = 0; y < SH; y++) if (isWhite((y * SW + x) * 4)) ok++;
        return ok / SH > 0.92;
      };
      const MAX = 0.15;
      const MIN = 0.02;
      const trim: CoverTrim = { top: 0, right: 0, bottom: 0, left: 0 };
      for (let y = 0; y < SH * MAX && rowWhite(y); y++) trim.top = (y + 1) / SH;
      for (let y = SH - 1; y >= SH * (1 - MAX) && rowWhite(y); y--) trim.bottom = (SH - y) / SH;
      for (let x = 0; x < SW * MAX && colWhite(x); x++) trim.left = (x + 1) / SW;
      for (let x = SW - 1; x >= SW * (1 - MAX) && colWhite(x); x--) trim.right = (SW - x) / SW;
      const peak = Math.max(trim.top, trim.right, trim.bottom, trim.left);
      cb(peak >= MIN ? trim : null);
    } catch {
      cb(null); // 跨域污染等，静默回落
    }
  };
  img.onerror = () => cb(null);
  img.src = src;
}
