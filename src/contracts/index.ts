/** 纯类型。main 与 renderer 共用，任何一侧都不许在这里放实现。 */

export type TrackId = string;

/** 六态（50 §16 M1）。顺序不代表流转，流转见 kernel/player.ts 的 nextStatus。 */
export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type PlayMode = "order" | "repeat-all" | "repeat-one" | "shuffle";

/**
 * 50 §10 的十二个码。M1 只用到其中四个，但先把全集钉死 ——
 * 否则每加一个功能就会有人顺手造一个自己的错误字符串。
 */
export type ErrorCode =
  | "source-mismatch"
  | "capability-missing"
  | "contract-version"
  | "auth-required"
  | "auth-expired"
  | "quality-unavailable"
  | "track-missing"
  | "network"
  | "decode-failed"
  | "aborted"
  | "disk-full"
  | "unknown";

export interface PlayerState {
  status: PlayerStatus;
  trackId: TrackId | null;
  /**
   * 显示用的标题。本地曲目由 UI 从路径取，在线曲目的 trackId 是直链，
   * 不单独给标题的话播放条会显示成一串签名串。
   */
  trackTitle: string | null;
  positionMs: number;
  volume: number;
  error: ErrorCode | null;
}

export interface QueueState {
  /** 队列本体。shuffle 不改它（50 §4.2）。 */
  items: TrackId[];
  cursor: number;
  /** 队列从哪来（专辑 / 歌单 / 搜索）。 */
  context: TrackId[];
  history: TrackId[];
  mode: PlayMode;
  /** shuffle 的种子。同种子同顺序，可复现。 */
  shuffleSeed: number;
}

/** 音频链路配置（50 §5.1）。与播放状态分开：换歌不动它，重启要恢复它。 */
export interface AudioConfig {
  /** 前置增益（dB，±12）。ReplayGain 的手动版。 */
  preampDb: number;
  /** 6 段 EQ 增益（dB，各 ±12），与 capability/audio/eq.ts 的 EQ_BANDS 对齐。 */
  eq: number[];
}

export interface AppState {
  player: PlayerState;
  queue: QueueState;
  audio: AudioConfig;
}

/** UI 唯一允许对外发出的东西。 */
export type Intent =
  /** 带 trackId = 换歌并播；不带 = 播当前（引擎加载完成后也用它） */
  | { type: "player/play"; trackId?: TrackId; trackTitle?: string | null }
  | { type: "player/pause" }
  | { type: "player/toggle" }
  | { type: "player/seek"; positionMs: number }
  | { type: "player/setVolume"; volume: number }
  | { type: "player/ended" }
  | { type: "player/error"; code: ErrorCode }
  | { type: "queue/set"; items: TrackId[]; context?: TrackId[]; startAt?: number }
  | { type: "queue/next" }
  /** atPositionMs 由 UI 带上来：store 不追实时位置，但 3 秒规则要用它 */
  | { type: "queue/prev"; atPositionMs?: number }
  | { type: "queue/mode"; mode: PlayMode }
  | { type: "queue/restore"; state: QueueState }
  /** 装载但不播（恢复上次状态用）。 */
  | { type: "player/cue"; trackId: TrackId; positionMs?: number }
  /** 引擎加载完成，loading 可以落到 paused。 */
  | { type: "player/ready" }
  /** 前置增益（dB，越界由 store clamp）。 */
  | { type: "audio/setPreamp"; db: number }
  /** 整组设置 6 段 EQ（dB）。长度不齐整组拒绝。 */
  | { type: "audio/setEq"; gains: number[] }
  /** 恢复持久化的音频配置（入口侧已 sanitize）。 */
  | { type: "audio/restore"; config: AudioConfig };

/** 播放器状态机的事件（不是 intent，是"引擎发生了什么"）。 */
export type PlayerEvent =
  | { type: "load" }
  | { type: "ready" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "ended" }
  | { type: "error"; code: ErrorCode }
  | { type: "stop" };
