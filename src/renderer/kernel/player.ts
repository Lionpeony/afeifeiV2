import type { ErrorCode, PlayerEvent, PlayerStatus } from "../../contracts/index.js";

/**
 * 播放器状态机（50 §16 M1）。做成纯函数是为了**能穷举测试**：
 * 六个状态 × 七个事件的转移表，比散在事件回调里的 if 可靠得多。
 */

const TRANSITIONS: Record<PlayerStatus, Partial<Record<PlayerEvent["type"], PlayerStatus>>> = {
  idle: { load: "loading" },
  // loading + play：引擎加载完直接开播，不必先经过 paused
  loading: { ready: "paused", play: "playing", error: "error", stop: "idle" },
  paused: { play: "playing", load: "loading", stop: "idle", error: "error" },
  playing: { pause: "paused", ended: "ended", error: "error", load: "loading", stop: "idle" },
  ended: { play: "playing", load: "loading", stop: "idle" },
  error: { load: "loading", stop: "idle" },
};

/**
 * 计算下一个状态。**没定义的转移一律保持原状态**，不抛错 ——
 * 播放器宁可"没反应"，也不能因为一个乱序事件把界面打成 error。
 */
export function nextStatus(current: PlayerStatus, event: PlayerEvent): PlayerStatus {
  return TRANSITIONS[current][event.type] ?? current;
}

/** 除 idle 外，任何状态都能被 stop 拉回 idle。 */
export function isTerminal(status: PlayerStatus): boolean {
  return status === "ended" || status === "error";
}

/** 只有这两个状态需要真的播放音频。 */
export function shouldPlay(status: PlayerStatus): boolean {
  return status === "playing";
}

/**
 * 错误收敛：由事件带进来的码直接采用；未知一律 unknown。
 * 这一层是"只翻译一次"的入口（50 §10），调用方不许自己编字符串。
 */
export function normalizeError(code: string | undefined): ErrorCode {
  return code && code.length > 0 ? (code as ErrorCode) : "unknown";
}
