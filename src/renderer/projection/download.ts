/**
 * 下载的视图模型（M7）：状态 → 行。纯函数，UI 只渲染不判断。
 * 字节进度由 runner 节流后进 store，这里不再做时间上的事。
 */
import type { AppState, DownloadItem } from "../../contracts/index.js";

export interface DownloadRow {
  id: string;
  title: string;
  state: DownloadItem["state"];
  /** 0–100；total 未知时为 null（显示"…"而不是假百分比） */
  pct: number | null;
  received: number;
  total: number;
  /** 字节/秒 */
  speed: number;
  error: string | null;
  /** 落盘路径（管理页的删除动作要用） */
  destPath: string;
  /** 这个任务还能不能暂停（active 才有在途连接可断） */
  pausable: boolean;
}

export function downloadRows(state: AppState): DownloadRow[] {
  return state.download.items.map((i) => ({
    id: i.id,
    title: i.title,
    state: i.state,
    pct: i.total > 0 ? Math.min(100, Math.round((i.received / i.total) * 100)) : null,
    received: i.received,
    total: i.total,
    speed: i.speed,
    error: i.error,
    destPath: i.destPath,
    pausable: i.state === "active",
  }));
}

export const activeDownloads = (state: AppState): number =>
  state.download.items.filter((i) => i.state === "active").length;

export const queuedDownloads = (state: AppState): number =>
  state.download.items.filter((i) => i.state === "queued").length;

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(units.length - 1, Math.floor(Math.log2(n) / 10));
  return `${(n / 2 ** (exp * 10)).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

export function fmtSpeed(bps: number): string {
  return bps > 0 ? `${fmtBytes(bps)}/s` : "";
}
