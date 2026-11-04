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
  /** 静音（A-17）。与 volume 分开存：取消静音要回到原来的音量。 */
  muted: boolean;
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

/**
 * 睡眠定时（A-23）。只存"截止时刻"，不存"还剩几秒" ——
 * 剩余时间由 UI 用同一截止时刻现算，两处各存一份必然对不上。
 * 不持久化：定时是一次性的，重启后不该继续倒数。
 */
export interface SleepState {
  endsAt: number | null;
}

/** 音频链路配置（50 §5.1）。与播放状态分开：换歌不动它，重启要恢复它。 */
export interface AudioConfig {
  /** 前置增益（dB，±12）。ReplayGain 的手动版。 */
  preampDb: number;
  /** 6 段 EQ 增益（dB，各 ±12），与 capability/audio/eq.ts 的 EQ_BANDS 对齐。 */
  eq: number[];
  /** crossfade 时长（秒，0/3/6）。0 = 关（M9-3）。 */
  crossfadeSec: number;
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
  /** 歌词译文是否并排显示（A-03）。关掉只留原文，译文数据仍在 doc 里不丢。 */
  translation: boolean;
  /** 导入的主题包对场景层 token 的覆盖。null = 没有导入。键必须登记过。 */
  customTokens: Record<string, string> | null;
}

/** 下载任务（M7）。状态机：queued → active → done；分支 paused / error。 */
export type DownloadState = "queued" | "active" | "paused" | "done" | "error";

export interface DownloadItem {
  /** `${sourceId}:${songId}` —— 同一首歌只有一个任务 */
  id: string;
  sourceId: string;
  songId: string;
  /** 显示用标题（歌名 — 歌手），也用于生成文件名 */
  title: string;
  /** 落盘绝对路径（downloads 目录内，由端口分配） */
  destPath: string;
  state: DownloadState;
  received: number;
  total: number;
  /** 已重试次数（重试 3 次退避，M7 判据） */
  tries: number;
  /** 字节/秒，由 runner 在节流后的 progress 里算 */
  speed: number;
  error: string | null;
}

export interface AppState {
  player: PlayerState;
  queue: QueueState;
  audio: AudioConfig;
  stage: StageConfig;
  sleep: SleepState;
  download: { items: DownloadItem[] };
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
  | { type: "player/setMuted"; muted: boolean }
  | { type: "player/ended" }
  | { type: "player/error"; code: ErrorCode }
  | { type: "queue/set"; items: TrackId[]; context?: TrackId[]; startAt?: number }
  /** 追加到队尾（"添加到队列"）：不打断当前播放，cursor 不动。 */
  | { type: "queue/add"; items: TrackId[] }
  | { type: "queue/next" }
  /** atPositionMs 由 UI 带上来：store 不追实时位置，但 3 秒规则要用它 */
  | { type: "queue/prev"; atPositionMs?: number }
  | { type: "queue/mode"; mode: PlayMode }
  /** 删队列里某一格（A-20）。index 是 items 下标，不是播放序。 */
  | { type: "queue/remove"; index: number }
  /** 移动队列里某一格（A-20）。同样用 items 下标，播放序由 orderOf 现算。 */
  | { type: "queue/move"; from: number; to: number }
  /** 睡眠定时（A-23）。endsAt 是绝对时刻，由 UI 算好传进来 —— kernel 不碰 Date.now()。 */
  | { type: "sleep/set"; endsAt: number }
  | { type: "sleep/clear" }
  /** 定时到点：暂停但**不退出**（A-23）。计时器在 UI，这里只做状态转移。 */
  | { type: "sleep/expire" }
  | { type: "queue/restore"; state: QueueState }
  /** 装载但不播（恢复上次状态用）。 */
  | { type: "player/cue"; trackId: TrackId; positionMs?: number }
  /** 引擎加载完成，loading 可以落到 paused。 */
  | { type: "player/ready" }
  /** crossfade 的入场曲已发声（M9-3）：loading 原地转 playing，trackId 不动。 */
  | { type: "player/began" }
  /** 前置增益（dB，越界由 store clamp）。 */
  | { type: "audio/setPreamp"; db: number }
  /** 整组设置 6 段 EQ（dB）。长度不齐整组拒绝。 */
  | { type: "audio/setEq"; gains: number[] }
  /** crossfade 时长（秒，0/3/6，非法值回落 0）。 */
  | { type: "audio/setCrossfade"; sec: number }
  /** 恢复持久化的音频配置（入口侧已 sanitize）。 */
  | { type: "audio/restore"; config: AudioConfig }
  /** 播放页配置。preset 切换不重建 store、不重解码封面（M4 判据）。 */
  | { type: "stage/setPreset"; preset: StagePreset }
  | { type: "stage/setIntensity"; intensity: 0 | 1 | 2 }
  /** cover / controls 不可关，发了也忽略。 */
  | { type: "stage/toggleLayer"; layer: StageLayer }
  | { type: "stage/setLyricRenderer"; renderer: LyricRenderer }
  /** 译文并排开关（A-03）。只切显示，不改 doc —— 切回来不用重新取词。 */
  | { type: "stage/setTranslation"; on: boolean }
  /** 主题包覆盖（入口侧已 sanitize）。null = 清除主题包。 */
  | { type: "stage/setTheme"; tokens: Record<string, string> | null }
  | { type: "stage/restore"; config: StageConfig }
  /** 下载（M7）。进度由 runner 节流后再进 store——状态机转移即时，字节流不逐条进。 */
  | { type: "download/add"; item: DownloadItem }
  | { type: "download/start"; id: string }
  | { type: "download/pause"; id: string }
  /** paused / error → queued（error 时 tries 保留，重试决策在 domain） */
  | { type: "download/resume"; id: string }
  | { type: "download/progress"; id: string; received: number; total: number; speed: number }
  | { type: "download/done"; id: string }
  | { type: "download/fail"; id: string; error: string; requeue: boolean }
  | { type: "download/remove"; id: string }
  /** 启动恢复：active/queued 一律落回 queued（进程死了，.part 还在，续传靠它） */
  | { type: "download/restore"; items: DownloadItem[] };

/** 播放器状态机的事件（不是 intent，是"引擎发生了什么"）。 */
export type PlayerEvent =
  | { type: "load" }
  | { type: "ready" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "ended" }
  | { type: "error"; code: ErrorCode }
  | { type: "stop" };
