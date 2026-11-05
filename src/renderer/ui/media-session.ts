/**
 * 系统媒体会话（A-24 的 Windows 那半：Windows SMTC / Chromium MediaSession）。
 *
 * **抄 lx-music-desktop**：
 * `F:\AI\mp-refs\lx-music-desktop\src\renderer\core\useApp\usePlayer\useMediaSessionInfo.ts`
 * 结构与语义 1:1 —— 静音音频保活、封面异步换图、setPositionState、9 个 action handler。
 * 只改两处：
 * ① lx 用 Vue 事件总线，这里吃 store 快照（写者仍然只有 dispatch 一个）；
 * ② folia 记的坑（`src\hooks\useMediaSessionBridge.ts`）：**先 setPositionState 再换 metadata**，
 *    顺序反了 Chromium 会把会话清掉（Windows 上表现为媒体面板突然消失）。
 *
 * 与主进程 `mediaKeys.ts` 的关系：Windows 媒体键应交给 Chromium 的 MediaSession 接管；
 * 再用 globalShortcut 抢 `MediaPlayPause` 会与会话**双触发**（按一次切两首）。
 * lx 在 v2.2.0 已把全局媒体键注册删掉，改走这条路（见其 `src\main\utils\index.ts` 的迁移代码）。
 */

export interface MediaSessionSnapshot {
  title: string;
  artist: string;
  album: string;
  /** 封面（远程地址或 dataURL）；null = 无封面。 */
  artwork: string | null;
  /** playing / paused / none（none = 没有在放）。 */
  playbackState: "playing" | "paused" | "none";
  positionMs: number;
  durationMs: number;
}

export interface MediaSessionDeps {
  /** 当前快照；null = 没有在放（会话清空）。 */
  read(): MediaSessionSnapshot | null;
  /** 播放 / 暂停。 */
  toggle(): void;
  next(): void;
  prev(): void;
  /** 绝对跳转（媒体面板的进度条）。 */
  seek(positionMs: number): void;
  /** 相对跳转（媒体键的快退 / 快进）。 */
  seekBy(deltaMs: number): void;
}

export interface MediaSessionController {
  /** 把当前状态同步到系统（metadata + positionState + playbackState）。 */
  update(): void;
  /** 注销 handler 与保活音频。 */
  dispose(): void;
  /** 运行环境有没有 MediaSession（老 Chromium 没有）。 */
  readonly supported: boolean;
}

/**
 * 10ms 的 8bit 静音 WAV（data URI，44+80 字节）。
 * 为什么要它：Chromium 只为"有在播媒体元素"的页面登记媒体会话（folia 的实测记录：
 * "Chromium 不为静音元素登记会话，要音量 0 的"），所以页面里常驻一个**真在播**的静音音频。
 * 用 data URI 而不是新增资源文件：省一个二进制文件，也不用管打包路径。
 */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

const SEEK_STEP_MS = 5000;

export function createMediaSession(deps: MediaSessionDeps): MediaSessionController {
  const session = typeof navigator === "undefined" ? undefined : navigator.mediaSession;
  if (!session) {
    // 老 Chromium 没有 MediaSession：媒体键退回主进程 globalShortcut（mediaKeys.ts）。
    return { update: () => undefined, dispose: () => undefined, supported: false };
  }

  /** 保活音频：播放一次就暂停（保持"有过播放"的记录），让系统媒体面板认得我们。 */
  const keepAlive = new Audio(SILENT_WAV);
  keepAlive.preload = "auto";
  keepAlive.autoplay = true;
  keepAlive.onplaying = () => keepAlive.pause();
  void keepAlive.play().catch((err: unknown) => {
    // 自动播放被拦不算失败：没有保活也照样能设 metadata，只是系统面板可能不常驻
    console.error("[media-session] 保活音频播放失败", err);
  });

  const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
    ["play", () => deps.toggle()],
    ["pause", () => deps.toggle()],
    ["stop", () => deps.toggle()],
    ["previoustrack", () => deps.prev()],
    ["nexttrack", () => deps.next()],
    ["seekbackward", (details) => deps.seekBy(-(details.seekOffset ?? SEEK_STEP_MS))],
    ["seekforward", (details) => deps.seekBy(details.seekOffset ?? SEEK_STEP_MS)],
    [
      "seekto",
      (details) => {
        if (details.seekTime === undefined) return;
        deps.seek(details.seekTime * 1000);
      },
    ],
  ];

  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch (err) {
      // 某些 action 在平台不支持时 setActionHandler 会抛 NotSupportedError：跳过即可，不影响其它
      console.error(`[media-session] 注册 ${action} 失败`, err);
    }
  }

  /** 上一次的封面 URL：换图期间防止旧图的 onload 覆盖新 metadata（lx 同款处理）。 */
  let lastArtwork: string | null = null;

  const update = (): void => {
    const snap = deps.read();
    if (!snap) {
      session.metadata = null;
      session.playbackState = "none";
      return;
    }
    session.playbackState = snap.playbackState;

    const artwork = snap.artwork;
    if (artwork !== lastArtwork) {
      lastArtwork = artwork;
      const metadata: MediaMetadataInit = {
        title: snap.title,
        artist: snap.artist,
        album: snap.album,
        artwork: artwork ? [{ src: artwork }] : [],
      };
      if (artwork) {
        // 先设无图版本，图片加载完再换带图的 —— 直接等 onload 会有一段时间面板是空的
        session.metadata = new MediaMetadata(metadata);
        const img = new Image();
        img.src = artwork;
        img.onload = () => {
          if (lastArtwork !== artwork) return; // 已经换曲了，这张图过期
          session.metadata = new MediaMetadata({ ...metadata, artwork: [{ src: artwork }] });
        };
      } else {
        session.metadata = new MediaMetadata(metadata);
      }
    }

    // 顺序要紧：folia 的坑 —— 先 setPositionState 再换 metadata，反了 Chromium 会清会话
    const duration = snap.durationMs > 0 ? snap.durationMs / 1000 : 0;
    // 时长还没从音频读出来时 duration=0；此时 Chromium 只接受 position=0，
    // 带任何进度都会抛 "position cannot be greater than duration"。等下一次快照即可。
    if (duration === 0) return;
    try {
      session.setPositionState({
        duration,
        position: Math.min(Math.max(snap.positionMs, 0) / 1000, duration),
        playbackRate: 1,
      });
    } catch (err) {
      // position 越界时 Chromium 也会抛：忽略，下一帧再来
      console.error("[media-session] setPositionState 失败", err);
    }
  };

  const dispose = (): void => {
    for (const [action] of handlers) {
      try {
        session.setActionHandler(action, null);
      } catch (err) {
        console.error(`[media-session] 注销 ${action} 失败`, err);
      }
    }
    keepAlive.pause();
    keepAlive.src = "";
  };

  return { update, dispose, supported: true };
}
