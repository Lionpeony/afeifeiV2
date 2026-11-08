/**
 * 播放阶段（P0-26）：状态 + 缓冲标志 → 一个**用户能看懂**的阶段。
 *
 * 为什么要把这两件事合成一个纯函数再给 UI：`status === "playing"` 与"正在出声"并不等价
 * （缓冲时状态还是 playing），各处若各写一套 if，播放条、播放页、迷你窗就会各说各话。
 *
 * 判据（`test/playback-phase.test.mjs`）：解码中与缓冲中必须是两个不同的词。
 */
import type { PlayerStatus } from "../../contracts/index.js";

export type PlaybackPhase =
  | "idle"
  | "loading"
  | "buffering"
  | "playing"
  | "paused"
  | "ended"
  | "error";

/** `ms → m:ss`。控制台与进度条泡共用一份（两处各写一遍迟早一个舍一个入）。 */
export function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function phaseOf(status: PlayerStatus, buffering: boolean): PlaybackPhase {
  if (status === "playing") return buffering ? "buffering" : "playing";
  return status;
}

/** 界面上那一行小字。别在这里拼错误码文案（错误有自己的 humanize）。 */
export function phaseLabel(phase: PlaybackPhase, remote: boolean): string {
  switch (phase) {
    case "idle":
      return "从曲库选一首开始";
    case "loading":
      return "解码中…";
    case "buffering":
      return "缓冲中…";
    case "playing":
      return remote ? "在线音源" : "本地曲库";
    case "paused":
      return "已暂停";
    case "ended":
      return "播完了";
    case "error":
      return "这首歌播不了";
  }
}
