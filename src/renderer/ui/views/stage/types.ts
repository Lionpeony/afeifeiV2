import type { AppState } from "../../../../contracts/index.js";

export interface StageViewProps {
  state: AppState;
  cover(trackId: string): Promise<string | null>;
  spectrum(bins: number): number[] | null;
  exportTheme(): Promise<boolean>;
  importTheme(): Promise<Record<string, string> | null>;
  durationMs(): number;
  findLyric(): void;
  /** 直播壳：Esc 在菜单关掉后，退回上一个房间。普通壳不传。 */
  onBack?(): void;
  /** 直播壳：播放页改穿不夜台灯位。普通壳不传。 */
  live?: boolean;
}

export const fmt = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export const pad2 = (n: number): string => String(Math.max(0, n)).padStart(2, "0");

export function fileOf(id: string): string {
  const parts = id.split(/[\\/]/);
  const last = parts[parts.length - 1] ?? id;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
