import type { AppState } from "../../../../contracts/index.js";

export interface StageViewProps {
  state: AppState;
  cover(trackId: string): Promise<string | null>;
  spectrum(bins: number): number[] | null;
  exportTheme(): Promise<boolean>;
  importTheme(): Promise<Record<string, string> | null>;
  durationMs(): number;
  /** 当前已播毫秒：queue/prev 要拿它判断"3 秒内 = 重头播"（与控制台同一时钟，I1） */
  positionMs(): number;
  findLyric(): void;
  /** 播出条"队列里没得切"之类的轻提示，与控制台共用一个 notice 位 */
  notify: (n: { text: string; url?: string } | null) => void;
  /** 直播壳：Esc 在菜单关掉后，退回上一个房间。普通壳不传。 */
  onBack?(): void;
  /** 直播壳：播放页改穿直播灯位。普通壳不传。 */
  live?: boolean;
}

export const fmt = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export const pad2 = (n: number): string => String(Math.max(0, n)).padStart(2, "0");

export function fileOf(id: string): string {
  // 队列里的在线项是 `remote:<音源>:<歌 id>`：别把逻辑 id 当歌名摆出来
  if (id.startsWith("remote:")) return "在线曲目";
  const parts = id.split(/[\\/]/);
  const last = parts[parts.length - 1] ?? id;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
