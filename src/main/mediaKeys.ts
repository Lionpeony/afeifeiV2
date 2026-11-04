/**
 * 系统媒体键（A-24）——**兜底**通道。
 *
 * 主路径是渲染层的 Chromium MediaSession（Windows 上映射成 SMTC 系统媒体面板，
 * 见 `renderer/ui/media-session.ts`，抄 lx-music-desktop 的 useMediaSessionInfo.ts）。
 * 这里只在**渲染层报告 MediaSession 不可用**时才注册 `globalShortcut` 媒体键。
 *
 * 为什么不能两套同时在：Windows 的媒体键会同时投递给 SMTC 会话与 RegisterHotKey，
 * 两个都注册 = 按一次切两首（lx 在 v2.2.0 把全局媒体键注册删掉就是为这个，
 * 见其 `src\main\utils\index.ts` 的迁移代码）。
 *
 * 为什么还要留兜底：老 Chromium / 精简版 Windows 上没有 MediaSession，
 * 那时 globalShortcut 是唯一一条不引第三方库的路。
 *
 * 播放语义仍然只有一份：主进程只发**命令名**，语义在渲染层命令注册表里。
 */
import { globalShortcut } from "electron";
import { log } from "./log/index.js";

export type PlaybackCommand = "toggle" | "next" | "prev";

export const MEDIA_BINDINGS: { accelerator: string; command: PlaybackCommand }[] = [
  { accelerator: "MediaPlayPause", command: "toggle" },
  { accelerator: "MediaNextTrack", command: "next" },
  { accelerator: "MediaPreviousTrack", command: "prev" },
];

/**
 * 注册失败不抛：媒体键常年被其他播放器抢（Windows 上先注册的先赢），
 * 抢不到只降级"这个键没反应"，不能因此拖垮启动。
 */
export function registerMediaKeys(send: (cmd: PlaybackCommand) => void): void {
  for (const b of MEDIA_BINDINGS) {
    let ok = false;
    try {
      ok = globalShortcut.register(b.accelerator, () => send(b.command));
    } catch (err) {
      log("warn", `[media] 注册 ${b.accelerator} 抛错：${String(err)}`);
      continue;
    }
    if (!ok) log("warn", `[media] ${b.accelerator} 未注册（可能被其他应用占用）`);
  }
}

export function unregisterMediaKeys(): void {
  globalShortcut.unregisterAll();
}
