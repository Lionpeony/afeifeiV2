/** 纯类型。main 与 renderer 共用，任何一侧都不许在这里放实现。 */

export type TrackId = string;

/** 六态（50 §16 M1）。顺序不代表流转，流转见 kernel/player.ts 的 nextStatus。 */
export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type PlayMode = "order" | "repeat-all" | "repeat-one" | "shuffle";

/**
 * 50 §10 的十二个码 + P0-14 自愈新增的一个（十三）。M1 只用到其中四个，但先把全集钉死 ——
 * 否则每加一个功能就会有人顺手造一个自己的错误字符串。
 *
 * 为什么没有"没有下一首"这种码：那种情况**照原样报真实原因**（"这首歌找不到了"）比
 * 换成"队列空了"更有用，也少一个码。
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
  | "unknown"
  /** 连续几首都失败，熔断停机（P0-14）；可重试，用户处理完网络/文件后点重试即可 */
  | "too-many-failures";

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
  /**
   * 播放速度（倍速）。全局一个值，不逐曲记忆（抄 lx-music-desktop：
   * `src\renderer\store\player\playbackRate.ts` 单值 + `usePlaybackRate.ts` 限幅 0.5–2）。
   */
  playbackRate: number;
  /** 音调补偿：变速时保持音高（原生 preservesPitch，默认开）。 */
  preservesPitch: boolean;
  error: ErrorCode | null;
  /**
   * 正在等数据（P0-26）：`playing` 但音频元素在 `waiting`。
   * 与 `status === "loading"`（解码中/取源中）分开 —— 一个是"还没开始"，一个是"开始后卡住了"，
   * 用户能做的事完全不同（等一会儿 vs 换网络/换音质）。不持久化。
   */
  buffering: boolean;
  /**
   * 在线曲目的音源内标识：歌词 / 封面用。本地曲目为 null。
   * **持久化**（P0-13，2026-11-04 推翻旧取舍）：不存它，重启后队列里只剩一串签名直链，
   * 没有标题、封面、歌词，等于把在线曲目退化成裸 URL。代价是快照多几十字节，换来可用。
   */
  remote: { sourceId: string; songId: string; coverUrl?: string } | null;
}

/**
 * 在线曲目的显示元数据，键是队列 id（`remote:<音源>:<音源内歌 id>`）。
 *
 * 队列项**只存逻辑 id，不存直链**：直链带令牌、会过期，存进队列过一会儿就打不开了。
 * 播放前由 engine 的解析器换成新地址（见 capability/audio 的 `setResolver`）。
 */
export interface RemoteTrackMeta {
  sourceId: string;
  songId: string;
  title: string;
  artist: string;
  coverUrl?: string;
  /** 队列面板要显示时长；在线曲目拿不到就留空，显示 --:--（不编数据） */
  durationMs?: number;
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
  /**
   * 播不出来的曲目（P0-16）。队列面板上标出来、点它可重试；成功播放后自动移除。
   * 存在队列里而不是组件局部：切页面/重开面板还得看得见，否则用户不知道刚才跳过了什么。
   */
  failed: TrackId[];
  /** 在线曲目的元数据（点每日推荐/榜单时随队列一起写入）。本地曲目不在表里。 */
  remote: Record<TrackId, RemoteTrackMeta>;
  /**
   * 流式队列标记（漫游 FM）：一批放完不叫"播完了"，而是再要一批接上。
   * null = 普通队列，播到队尾就停。
   */
  stream: { sourceId: string } | null;
  /**
   * 队列来自哪个节目（「内地榜」「歌单 X」「搜索 · xx」「每日推荐」）。
   * 首页 ON AIR 投影显示用；null = 调用方没说（老快照 / 唤起播放）。
   */
  origin: string | null;
}

/**
 * 睡眠定时（A-23）。只存"截止时刻"，不存"还剩几秒" ——
 * 剩余时间由 UI 用同一截止时刻现算，两处各存一份必然对不上。
 * 不持久化：定时是一次性的，重启后不该继续倒数。
 */
export interface SleepState {
  endsAt: number | null;
  /**
   * 「播完当前曲再停」（P0-24）：到点时如果这首还没放完，不立刻暂停，等它自然结束。
   * 存成偏好而不是一次性参数 —— 喜欢这种停法的人每次都要这个，别让他每次勾一遍。
   */
  waitEnd: boolean;
  /** 已经到点、正在等这首播完。到点那一刻置上，真正停下时清掉。 */
  pending: boolean;
}

/** 音频链路配置（50 §5.1）。与播放状态分开：换歌不动它，重启要恢复它。 */
export interface AudioConfig {
  /** 前置增益（dB，±12）。ReplayGain 的手动版。 */
  preampDb: number;
  /** 6 段 EQ 增益（dB，各 ±12），与 capability/audio/eq.ts 的 EQ_BANDS 对齐。 */
  eq: number[];
  /** crossfade 时长（秒，0/3/6）。0 = 关（M9-3）。 */
  crossfadeSec: number;
  /**
   * 输出设备 id（`enumerateDevices` 的 `deviceId`），`""` = 跟随系统默认（P0-09）。
   * 存 id 不存名字：名字随语言/重插会变，id 才是稳定标识。
   */
  outputId: string;
}

/** 播放页图层。wallpaper / visual / cover / controls 随旧版面（classic）一起删除，只剩歌词可开关。 */
export type StageLayer = "lyric";

/** 四套预设（50 §9.2 参数表）。每套只是同一组 token 的不同取值 —— 加第五套必须先删一套。 */
export type StagePreset = "paper" | "vinyl" | "minimal" | "cinema";

/** 四个歌词渲染器（50 §7.4）。加第五个必须先删一个。 */
export type LyricRenderer = "press" | "karaoke" | "minimal" | "theatrical";

/** 播放页皮肤（2026-11-10）。三套是**不同版式**，不只是换 token：editorial 唱片内页 / nebula 声云 / desk 转播台。 */
export type StageSkin = "editorial" | "nebula" | "desk";

/** 皮肤自身的明暗（A-10：播放页与全局主题独立，切夜间不翻这一层）。 */
export type StageTone = "dark" | "light";

export interface StageConfig {
  preset: StagePreset;
  /** 版式皮肤。 */
  skin: StageSkin;
  /**
   * 皮肤明暗。与全局 data-theme 无关，播放页自己说了算——
   * 但默认（toneAuto=true）跟随全局主题：全局浅色进播放页却是深色是用户实测的 BUG。
   */
  tone: StageTone;
  /** true = tone 跟随全局主题（默认，老存档缺字段也按 true 迁移）；用户在样式库明确点过明暗后锁成 false。 */
  toneAuto: boolean;
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

/**
 * 播放行为配置（P0-15）。与 `AudioConfig` 分开：那边是音质链路，这边是"出错怎么办"，
 * 两者改动频率与影响面完全不同（调 EQ 不该动错误策略，反之亦然）。
 */
export interface PlaybackConfig {
  /**
   * 播放失败时：`skip` 自动跳到下一首；`pause` 停下等用户处理。
   * 默认 `skip`（抄 MusicFreeDesktop 的 `playMusic.playError` 默认值）。
   */
  onError: "skip" | "pause";
}

/**
 * 歌词校准（P0-18）。
 *
 * 为什么**按曲**记而不是全局：歌曲自带的时间轴误差是逐首的（扒词的人不同），
 * 一个全局偏移会把调准的那首又调歪。抄 SPlayer 的 `songOffset`（按 id 存）。
 * 键是 trackId；值单位毫秒，正数 = 歌词整体往后推。
 */
export interface LyricOffsets {
  offsets: Record<string, number>;
}

export interface AppState {
  player: PlayerState;
  queue: QueueState;
  audio: AudioConfig;
  /** 播放行为（不是音质）：失败怎么办这类"换首歌也不该变"的策略。 */
  playback: PlaybackConfig;
  /** 歌词校准（P0-18）：按曲记的偏移，毫秒。正 = 歌词晚出现。 */
  lyrics: LyricOffsets;
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
  /** 播放速度（倍速）。限幅 0.5–2（抄 lx 的限幅）。 */
  | { type: "player/setPlaybackRate"; rate: number }
  /** 音调补偿开关（原生 preservesPitch）。 */
  | { type: "player/setPreservesPitch"; on: boolean }
  | { type: "player/ended" }
  | { type: "player/error"; code: ErrorCode }
  /** 等数据中（P0-26）：`playing` 但在 `waiting`。与"解码中"分开显示。 */
  | { type: "player/buffering"; on: boolean }
  | {
      type: "queue/set";
      items: TrackId[];
      context?: TrackId[];
      startAt?: number;
      /** 在线曲目的元数据，键与 items 里的一致（`remote:` 开头的那些）。 */
      remote?: Record<TrackId, RemoteTrackMeta>;
      /** 流式队列（漫游 FM）：播完自动续批。 */
      stream?: { sourceId: string } | null;
      /** 节目来源标签（「内地榜」「搜索 · xx」）；不传按 null。 */
      origin?: string | null;
    }
  /**
   * 加入直播：队列、当前曲目、曲内偏移一次写入。
   * 拆成 queue/set + player/seek 会在异步 load 完成时用切换瞬间的 0 覆盖偏移，
   * 所以插播/接驳必须走这一条原子 intent。
   */
  | {
      type: "player/joinLive";
      items: TrackId[];
      context?: TrackId[];
      startAt?: number;
      positionMs: number;
      trackTitle?: string | null;
    }
  /** 追加到队尾（"添加到队列"）：不打断当前播放，cursor 不动。 */
  | {
      type: "queue/add";
      items: TrackId[];
      /** 追加的是在线曲目时元数据一起带上（FM 续批） */
      remote?: Record<TrackId, RemoteTrackMeta>;
    }
  /**
   * 裁掉队列前面已播过的条目（FM 续批用）：保留当前曲之前 keepBefore 首，后面的不动。
   * 不裁的话挂机一晚会攒到几千首，队列面板没法用。
   */
  | { type: "queue/trim"; keepBefore: number }
  | { type: "queue/next" }
  /** atPositionMs 由 UI 带上来：store 不追实时位置，但 3 秒规则要用它 */
  | { type: "queue/prev"; atPositionMs?: number }
  | { type: "queue/mode"; mode: PlayMode }
  /** 删队列里某一格（A-20）。index 是 items 下标，不是播放序。 */
  | { type: "queue/remove"; index: number }
  /** 移动队列里某一格（A-20）。同样用 items 下标，播放序由 orderOf 现算。 */
  | { type: "queue/move"; from: number; to: number }
  /** 睡眠定时（A-23）。endsAt 是绝对时刻，由 UI 算好传进来 —— kernel 不碰 Date.now()。 */
  | { type: "sleep/set"; endsAt: number; waitEnd?: boolean }
  | { type: "sleep/clear" }
  /** 勾/取消「播完当前曲再停」（P0-24）。 */
  | { type: "sleep/setWaitEnd"; waitEnd: boolean }
  /**
   * 定时到点（A-23 / P0-24）：默认暂停但**不退出**；勾了「播完再停」则只挂 pending，
   * 等 `player/ended` 那一刻才真正停。计时器在 UI，这里只做状态转移。
   */
  | { type: "sleep/expire" }
  | { type: "queue/restore"; state: QueueState }
  /** 清空队列（P0-12）：队列、光标、标题、进度一起归零，回到空态，不假装还有歌。 */
  | { type: "queue/clear" }
  /** 标记 / 取消「这首播不出来」（P0-16）。成功播放 500ms 后由装配层取消。 */
  | { type: "queue/fail"; trackId: TrackId; failed: boolean }
  /**
   * 装载但不播（恢复上次状态用）。
   * 带标题与在线标识：从快照恢复时没有它们，顶栏会显示一串签名直链（P0-13）。
   */
  | {
      type: "player/cue";
      trackId: TrackId;
      positionMs?: number;
      trackTitle?: string | null;
      remote?: PlayerState["remote"];
    }
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
  /** 输出设备（P0-09）：`""` = 跟随系统默认。 */
  | { type: "audio/setOutput"; id: string }
  /** 恢复持久化的音频配置（入口侧已 sanitize）。 */
  | { type: "audio/restore"; config: AudioConfig }
  /** 失败策略（P0-15）：自动跳过 / 停下等用户。 */
  | { type: "playback/setOnError"; onError: "skip" | "pause" }
  /** 恢复持久化的播放行为配置（入口侧已 sanitize）。 */
  | { type: "playback/restore"; config: PlaybackConfig }
  /** 歌词校准（P0-18）：给某首歌加减偏移，单位毫秒（±500 一步）。 */
  | { type: "lyric/nudgeOffset"; trackId: TrackId; deltaMs: number }
  /** 清掉某首歌的校准，回到词自带的时间轴。 */
  | { type: "lyric/resetOffset"; trackId: TrackId }
  /** 恢复持久化的校准表（入口侧已 sanitize）。 */
  | { type: "lyric/restoreOffsets"; offsets: Record<string, number> }
  /** 播放页配置。preset 切换不重建 store、不重解码封面（M4 判据）。 */
  | { type: "stage/setPreset"; preset: StagePreset }
  /** 换皮肤 = 换整套版式。只切渲染分支，不动队列/播放/歌词（M4 判据同款）。 */
  | { type: "stage/setSkin"; skin: StageSkin }
  /** 皮肤明暗。入口侧已 sanitize。 */
  | { type: "stage/setTone"; tone: StageTone }
  /** true = 明暗回到「跟随全局主题」；样式库里点明暗会先把它锁成 false。 */
  | { type: "stage/setToneAuto"; on: boolean }
  /** 歌词层开关（唯一可关的图层）。 */
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
