/**
 * 系统媒体键（A-24）。主进程只把按键翻译成**命令名**发给渲染层，
 * 真正的播放语义在渲染层的命令注册表（`ui/input/commands.ts`）里只有一份。
 *
 * 为什么不用 `MediaSession`：Electron 没有 MPRIS / SMTC 的实现，
 * Windows 上媒体键走 `globalShortcut` 是唯一一条不引第三方库的路；
 * Linux 的 MPRIS 需要在打包侧接 dbus，留给 A-16。
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
