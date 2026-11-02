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
  /**
   * 在线曲目的音源内标识：歌词 / 封面用。本地曲目为 null。
   * 不持久化 —— 在线播放队列重启后不恢复歌词，属已知取舍。
   */
  remote: { sourceId: string; songId: string; coverUrl?: string } | null;
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

/** 播放页五层（50 §9.2）。cover 与 controls 永远开着 —— toggleLayer 对它们无效。 */
export type StageLayer = "wallpaper" | "visual" | "cover" | "lyric" | "controls";

/** 四套预设（50 §9.2 参数表）。每套只是同一组 token 的不同取值 —— 加第五套必须先删一套。 */
export type StagePreset = "paper" | "vinyl" | "minimal" | "cinema";

/** 四个歌词渲染器（50 §7.4）。加第五个必须先删一个。 */
export type LyricRenderer = "press" | "karaoke" | "minimal" | "theatrical";

export interface StageConfig {
  preset: StagePreset;
  /** 动效档位。0 时也必须好看 —— 这是设计的试金石。 */
  intensity: 0 | 1 | 2;
  layers: Record<StageLayer, boolean>;
  lyricRenderer: LyricRenderer;
  /** 导入的主题包对场景层 token 的覆盖。null = 没有导入。键必须登记过。 */
  customTokens: Record<string, string> | null;
}

export interface AppState {
  player: PlayerState;
  queue: QueueState;
  audio: AudioConfig;
  stage: StageConfig;
}

/** UI 唯一允许对外发出的东西。 */
export type Intent =
  /** 带 trackId = 换歌并播；不带 = 播当前（引擎加载完成后也用它） */
  | {
      type: "player/play";
      trackId?: TrackId;
      trackTitle?: string | null;
      /** 在线曲目的音源内标识（歌词/封面用），本地曲目不带 */
      remote?: { sourceId: string; songId: string; coverUrl?: string } | null;
    }
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
  | { type: "audio/restore"; config: AudioConfig }
  /** 播放页配置。preset 切换不重建 store、不重解码封面（M4 判据）。 */
  | { type: "stage/setPreset"; preset: StagePreset }
  | { type: "stage/setIntensity"; intensity: 0 | 1 | 2 }
  /** cover / controls 不可关，发了也忽略。 */
  | { type: "stage/toggleLayer"; layer: StageLayer }
  | { type: "stage/setLyricRenderer"; renderer: LyricRenderer }
  /** 主题包覆盖（入口侧已 sanitize）。null = 清除主题包。 */
  | { type: "stage/setTheme"; tokens: Record<string, string> | null }
  | { type: "stage/restore"; config: StageConfig };

/** 播放器状态机的事件（不是 intent，是"引擎发生了什么"）。 */
export type PlayerEvent =
  | { type: "load" }
  | { type: "ready" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "ended" }
  | { type: "error"; code: ErrorCode }
  | { type: "stop" };
