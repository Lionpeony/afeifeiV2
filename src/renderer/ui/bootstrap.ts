import type { AppState, DownloadItem, ErrorCode } from "../../contracts/index.js";
import type { AccountCapability } from "../../contracts/capability.js";
import type {
  DownloadPort,
  KeyValuePort,
  LibraryPort,
  LocalApiPort,
  MediaPort,
  RawMeta,
  StoragePort,
} from "../../contracts/ports.js";
import { AudioEngine } from "../capability/audio/engine.js";
import { sanitizeAudioConfig } from "../capability/audio/eq.js";
import {
  getCachedLyric,
  lyricCacheKey,
  parseLyricCache,
  putCachedLyric,
  serializeLyricCache,
  type LyricCache,
} from "../capability/lyrics/cache.js";
import { PRESETS, sanitizeStageConfig, sanitizeThemeTokens } from "./views/stage/presets.js";
import { createQqProvider } from "../capability/sources/qq/index.js";
import {
  createUserProvider,
  type StoredUserSource,
  type UserManifest,
} from "../capability/sources/user/index.js";
import { getProvider, listProviders, registerProvider } from "../capability/registry.js";

import { demoProvider } from "../capability/sources/demo/index.js";
import {
  createNeteaseProvider,
  pollQrLogin,
  startQrLogin,
} from "../capability/sources/netease/index.js";
import { loadCover } from "../domain/library/cover.js";
import {
  getFilters,
  invalidPatterns,
  parseFilters,
  rulesFromText,
  rulesToText,
  serializeFilters,
  setFilters,
} from "../domain/lyrics/filter.js";
import { getMetaOverrides, getTracks, setMetaOverrides } from "../domain/library/state.js";
import { parseMetaOverrides, patchMeta, serializeMetaOverrides } from "../domain/library/meta.js";
import { restoreLibrary, scanLibrary } from "../domain/library/scan.js";
import { startDownloadRunner } from "../domain/download/runner.js";
import { justFinished } from "../domain/download/queue.js";
import { renderName, uniqueDestPath } from "../domain/download/naming.js";
import {
  DOWNLOAD_SETTINGS_KEY,
  getDownloadSettings,
  parseDownloadSettings,
  serializeDownloadSettings,
  setDownloadSettings,
} from "../domain/download/settings.js";
import { loadHistory, pushHistory as recordPlay, saveHistory } from "../domain/history/index.js";
import { loadLikes, saveLikes, subscribe as subscribeLikes } from "../domain/likes/index.js";
import { loadDislikes, saveDislikes, subscribe as subscribeDislikes } from "../domain/dislikes/index.js";
import {
  begin as beginListening,
  end as endListening,
  loadLog,
  saveLog,
  subscribe as subscribeLog,
} from "../domain/listening/log.js";
import { loadPlaylists, savePlaylists, subscribe as subscribePlaylists } from "../domain/playlists/index.js";
import {
  dropSaved,
  getSavedPlaylists,
  loadSavedPlaylists,
  mergeSaved,
  parsePlaylistRef,
  saveSavedPlaylists,
  setSavedPlaylists,
} from "../domain/playlists/online.js";
import { loadSalt } from "../domain/recommend/salt.js";
import { clock } from "../kernel/clock.js";
import { decideFailure } from "../kernel/failure.js";
import {
  dispatch,
  getState,
  orderOf,
  sanitizeLyricOffsets,
  sanitizePlaybackConfig,
  stepForward,
  subscribe,
} from "../kernel/index.js";
import { createPersister } from "../kernel/persist.js";

import { humanize, type Api, type NcmBody, type SavedPlaylistView, type Services } from "./services.js";
import { bindingToDoc, resolveLocalLyric } from "./local-lyric.js";
import {
  getLyricBinding,
  lyricBindKey,
  parseLyricBindings,
  putLyricBinding,
  serializeLyricBindings,
  type LyricBindings,
} from "../domain/lyrics/bindings.js";
import { searchLrclib } from "../domain/lyrics/fetch-lrclib.js";
import { applyTheme, isTheme, THEME_KEY, type Theme } from "./theme.js";
import {
  GLOBAL_THEME_KEY,
  getGlobalTokens,
  globalThemeFile,
  sanitizeGlobalTokens,
  setGlobalTokens,
} from "./global-theme.js";

declare global {
  interface Window {
    api: Api;
  }
}

/**
 * 无框窗口的系统三键（titleBarOverlay）颜色同步：
 * 现场从 DOM 读 --bg/--fg（此时主题与全局配色包都已落到 token），
 * 主进程不存第二份色值。桥不可用（老包/测试环境）时静默跳过。
 */
function syncWindowOverlay(): void {
  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue("--bg").trim();
  const fg = css.getPropertyValue("--fg").trim();
  // 截图工具等自建窗口的环境没注册 win:overlayTheme handler，失败静默——三键颜色只在真窗口有意义
  if (bg && fg) window.api.setWindowOverlayTheme(bg, fg).catch(() => {});
}

/**
 * 装配层：把 preload 的桥适配成端口，把 store 的变化落到引擎上。
 *
 * 这是全应用**唯一**同时认识 store 与 engine 的地方。
 * 方向是单向的：store 是真相，引擎是执行器；反过来不许（50 §8）。
 */
export async function bootstrap(): Promise<Services> {
  const api = window.api;

  const storage: StoragePort = {
    load: () => api.loadState(),
    save: (json) => api.saveState(json),
  };

  const media: MediaPort = {
    pickFiles: () => api.pickFiles(),
    grant: (filePath) => api.grant(filePath),
    urlOf: (id) => `appmedia://${id}`,
  };

  const library: LibraryPort = {
    scan: (dirs) => api.scan(dirs),
    readTags: (paths) => api.readTags(paths) as Promise<RawMeta[]>,
    statFiles: (paths) => api.statFiles(paths),
    cover: (path) => api.cover(path),
    loadIndex: () => api.loadIndex(),
    saveIndex: (json) => api.saveIndex(json),
    readLog: () => api.readIndexLog(),
    appendLog: (lines) => api.appendIndexLog(lines),
    clearLog: () => api.clearIndexLog(),
  };

  const kv: KeyValuePort = {
    read: (key) => api.readStore(key),
    write: (key, json) => api.writeStore(key, json),
  };

  /**
   * 歌词缓存（A-03 判据「缓存到本地」）：内存一份，命中直接返回；
   * 写入合并 1s 落盘（连续切歌不该每首写一次盘）。
   * 恢复放在 hydrate 里——那时才 await 完 KV；首帧不等这份 IO。
   */
  let lyricCache: LyricCache = {};
  let lyricCacheTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleLyricCacheSave = (): void => {
    if (lyricCacheTimer) clearTimeout(lyricCacheTimer);
    lyricCacheTimer = setTimeout(() => {
      lyricCacheTimer = null;
      void kv.write("lyric-cache", serializeLyricCache(lyricCache));
    }, 1000);
  };

  /**
   * 手动换词绑定（P0-19）：一次点击写一次盘，量小；不走节流 ——
   * 挑完词立刻关窗/退出是常态，攒着写就等于"挑了还不算数"。
   */
  let lyricBindings: LyricBindings = {};

  // 下载的系统调用面（M7）。进度事件：桥里单订阅，按 taskId 分发到进行中的 fetch
  const progressCbs = new Map<string, (received: number, total: number) => void>();
  api.onDownloadProgress((p) => progressCbs.get(p.taskId)?.(p.received, p.total));
  const download: DownloadPort = {
    dir: api.downloadDir,
    usage: api.downloadUsage,
    fetch: (taskId, url, destPath, onProgress) => {
      progressCbs.set(taskId, onProgress);
      return api.downloadFetch(taskId, url, destPath).finally(() => progressCbs.delete(taskId));
    },
    cancel: api.downloadCancel,
    remove: api.downloadRemove,
  };

  // 音源本地通道：加密、cookie、限流都在主进程一侧，渲染层只给方法名。
  // namespace 决定走哪条主进程通道（netease / qq），登录态判定也按源各自来。
  const localApi: LocalApiPort = {
    call: (namespace, method, params) =>
      namespace === "qq" ? api.qqCall(method, params) : api.ncmCall(method, params),
    profile: (namespace) =>
      namespace === "qq" ? api.qqProfile() : api.ncmProfile(),
    logout: (namespace) => (namespace === "qq" ? api.qqLogout() : api.ncmLogout()),
  };

  // 注册音源：注册即触发启动断言（声明 ↔ 实现一一对应）
  registerProvider(demoProvider);
  registerProvider(createNeteaseProvider(localApi));
  registerProvider(createQqProvider(localApi));

  // 用户源：KV 里的代码重装进沙箱。单个装失败不挡启动 —— 少一个源比白屏好
  const readStoredSources = async (): Promise<StoredUserSource[]> => {
    try {
      return JSON.parse((await kv.read("user-sources")) ?? "[]") as StoredUserSource[];
    } catch {
      return [];
    }
  };

  const installAndRegister = async (code: string): Promise<{ id: string; name: string }> => {
    // 装载键用临时值；子进程以 provider 自报的 id 存取，manifest.id 与之必然一致
    const manifest = (await api.installUserSource(`tmp-${Date.now()}`, code)) as UserManifest;
    registerProvider(createUserProvider(manifest, (m, p) => api.callUserSource(manifest.id, m, p)));
    return { id: manifest.id, name: manifest.name };
  };

  for (const s of await readStoredSources()) {
    try {
      await installAndRegister(s.code);
      console.info(`[user] 已恢复音源：${s.name}`);
    } catch (err) {
      console.warn(`[user] 音源 ${s.name} 装载失败，已跳过：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const engine = new AudioEngine(media);
  const persister = createPersister(storage);

  /* ---- 播放失败自愈（P0-14）。判定在 kernel/failure.ts，这里只做调度 ---- */
  let retryCount = 0; // 当前这首已重试次数（换到下一首时清零）
  let skipStreak = 0; // 已连续跳过几首（真的播起来 500ms 后清零）
  let okTimer: ReturnType<typeof setTimeout> | null = null;
  let skipTimer: ReturnType<typeof setTimeout> | null = null;

  const queueHasNext = (): boolean => {
    const s = getState();
    const order = orderOf(s.queue.items, s.queue.mode, s.queue.shuffleSeed);
    return stepForward(order, s.queue.cursor, s.queue.mode, true) >= 0;
  };

  /**
   * 真的播起来了才清零 —— 只认 `loadedmetadata` 会把"加载成功但解不了"的算成功，
   * 那样坏文件永远清不掉计数（抄 SPlayer：播过 500ms 才 `failSkipCount = 0`）。
   */
  const armSuccessReset = (trackId: string): void => {
    if (okTimer) clearTimeout(okTimer);
    okTimer = setTimeout(() => {
      okTimer = null;
      const s = getState();
      if (s.player.trackId === trackId && s.player.status === "playing") {
        retryCount = 0;
        skipStreak = 0;
        // 真的放出来了：摘掉队列里的"播不了"标记（P0-16）。标记只为解释"刚才跳过了什么"而存在
        dispatch({ type: "queue/fail", trackId, failed: false });
      }
    }, 500);
  };

  const handleFailure = (code: ErrorCode): void => {
    const st = getState();
    const decision = decideFailure({
      code,
      retryCount,
      skipStreak,
      hasNext: queueHasNext(),
      autoSkip: st.playback.onError === "skip",
    });

    if (decision.action === "ignore") return;

    // 先给这一首打标记（P0-16）：队列面板要能回答"刚才为什么跳过去了"。
    // 摘标只发生在它真的播起来之后（armSuccessReset），不在这里撤。
    if (st.player.trackId) dispatch({ type: "queue/fail", trackId: st.player.trackId, failed: true });

    if (decision.action === "retry") {
      retryCount = decision.retryCount;
      // 先把错误露出来（用户看得见"在重试"），再重取源。重试从 0 开始放：
      // 坏掉的流没有可信的续播点，续点会让进度条与声音对不上（I1）
      dispatch({ type: "player/error", code });
      void engine.reload().then((changed) => {
        if (!changed) {
          retryCount = 0; // 取源这步就失败了，停在错误态等用户（按钮由 isRetryable 决定）
          return;
        }
        dispatch({ type: "player/seek", positionMs: 0 });
        dispatch({ type: "player/play" });
      });
      return;
    }

    if (decision.action === "stop") {
      retryCount = 0;
      skipStreak = 0;
      // 只有"连跳三首"值得换成一句总结；"没有下一首"照实报原码 ——
      // 用户想知道的是"这首歌为什么放不了"，不是"队列空了"
      dispatch({ type: "player/error", code: decision.reason === "exhausted" ? "too-many-failures" : code });
      return;
    }

    // skip：先露错误态（否则用户不知道刚才跳过了什么），再按延迟切下一首
    dispatch({ type: "player/error", code });
    skipStreak = decision.skipStreak;
    const failing = st.player.trackId;
    if (skipTimer) clearTimeout(skipTimer);
    skipTimer = setTimeout(() => {
      skipTimer = null;
      // 这 500ms 里用户自己切了歌：别替他再跳一次
      if (getState().player.trackId !== failing) return;
      dispatch({ type: "queue/next" });
    }, decision.delayMs);
  };

  engine.on({
    onReady: () => dispatch({ type: "player/ready" }),
    onEnded: () => dispatch({ type: "player/ended" }),
    onError: (code) => handleFailure(code),
    // 缓冲（P0-26）：开始后卡住才算缓冲，与"解码中"分开显示
    onBuffering: (on) => dispatch({ type: "player/buffering", on }),
    // 预取（P0-08）：剩余 10s 时把下一首装进待命元素，切歌省一次取源 + load。
    // 单曲循环不预取：下一首就是自己，装进去只会把正在放的这首挤掉。
    onPreloadNext: () => {
      const s = getState();
      if (s.queue.mode === "repeat-one") return;
      const order = orderOf(s.queue.items, s.queue.mode, s.queue.shuffleSeed);
      const next = stepForward(order, s.queue.cursor, s.queue.mode);
      if (next >= 0) void engine.preload(s.queue.items[next]);
    },
    // crossfade（M9-3）：进窗口就切下一首；repeat-one 对自己淡入没有意义，走自然 ended
    onNearEnd: () => {
      const s = getState();
      if (s.queue.mode === "repeat-one") return;
      // 睡眠定时正等这首播完（P0-24）：不许在这里切，交给自然 ended 让它停
      if (s.sleep.pending) return;
      dispatch({ type: "queue/next" });
    },
    onFadeStart: () => dispatch({ type: "player/began" }),
    // 切点：新曲成为主轨，时钟一次性归零——双音轨 ≠ 双时钟（00 §3.2 #5）
    onSwitched: () => clock.seek(0, performance.now()),
  });

  // 收藏 / 歌单变了就落盘。收藏不是高频操作，一次一带足矣
  subscribeLikes(() => {
    void saveLikes(kv);
  });
  subscribePlaylists(() => {
    void savePlaylists(kv);
  });
  // 不喜欢名单（B-11）：UI 只管 add/remove，落盘跟着订阅走
  subscribeDislikes(() => {
    void saveDislikes(kv);
  });
  // 听歌账本（B-12）：每段结算完写一次，切歌是低频操作
  subscribeLog(() => {
    void saveLog(kv);
  });

  // 「换一批」的 salt：启动时恢复今天的批次偏移（跨天自动作废，见 domain/recommend/salt）
  void loadSalt(kv);

  const persistNow = (): void => {
    persister.schedule(getState, () => clock.t(performance.now()));
  };

  // 音频配置变了 → 500ms 合并写一次 KV。拖滑杆会连续 dispatch，不去抖就每格一次写盘
  let audioSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleAudioSave = (): void => {
    if (audioSaveTimer) clearTimeout(audioSaveTimer);
    audioSaveTimer = setTimeout(() => {
      audioSaveTimer = null;
      void kv.write("audio-eq", JSON.stringify(getState().audio));
    }, 500);
  };

  // 播放页配置同理（预设 / 层 / 渲染器），低频操作但拖菜单也会连发
  let stageSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleStageSave = (): void => {
    if (stageSaveTimer) clearTimeout(stageSaveTimer);
    stageSaveTimer = setTimeout(() => {
      stageSaveTimer = null;
      void kv.write("stage-ui", JSON.stringify(getState().stage));
    }, 500);
  };

  /**
   * 系统通知（M9）：只在窗口藏起来时弹——前台切歌本来就在眼前，再弹一个就是骚扰。
   * 发不出去就静默，通知失败不该影响播放。
   */
  const notifyIfHidden = (title: string, body: string): void => {
    if (!document.hidden) return;
    void api.notify({ title, body }).catch(() => undefined);
  };

  let prev = getState();
  subscribe(() => {
    const next = getState();

    // 后台切歌 / 下载完成 → 系统通知（M9）
    if (next.player.trackId !== prev.player.trackId && next.player.status === "playing" && next.player.trackTitle) {
      notifyIfHidden("正在播放", next.player.trackTitle);
    }
    const finished = justFinished(prev.download.items, next.download.items);
    if (finished) notifyIfHidden("下载完成", finished.title);

    // 刚开始播一首 → 记历史
    if (next.player.status === "playing" && prev.player.status !== "playing" && next.player.trackId) {
      if (recordPlay(next.player.trackId)) void saveHistory(kv);
    }

    // 听歌账本（B-12）：只在 status=playing 的区间累计，暂停/切歌/退出播放都结算。
    // 连切时 trackId 变了但状态一直是 playing，也必须 end + begin，否则整段算给上一首。
    const playing = next.player.status === "playing";
    const wasPlaying = prev.player.status === "playing";
    if (playing && next.player.trackId && (!wasPlaying || next.player.trackId !== prev.player.trackId)) {
      const local = getTracks().find((t) => t.id === next.player.trackId);
      beginListening(next.player.trackId, {
        title: next.player.trackTitle ?? local?.title ?? "",
        artist: local?.artist ?? "",
      });
    } else if (!playing && wasPlaying) {
      endListening();
    }

    if (next.audio !== prev.audio) scheduleAudioSave();
    if (next.stage !== prev.stage) scheduleStageSave();

    // 失败自愈的两个计数器（P0-14）：换歌清重试次数，真播起来 500ms 后清连跳数
    if (next.player.trackId !== prev.player.trackId) {
      retryCount = 0;
      if (okTimer) {
        clearTimeout(okTimer);
        okTimer = null;
      }
    }
    if (next.player.status === "playing" && prev.player.status !== "playing" && next.player.trackId) {
      armSuccessReset(next.player.trackId);
    }
    // 失败策略是低频操作，直接写，不走节流
    if (next.playback !== prev.playback) void kv.write("playback", JSON.stringify(next.playback));
    // 歌词校准（P0-18）：一次 ±0.5s 一次写，量小；连续点时末次值就是终态
    if (next.lyrics !== prev.lyrics) void kv.write("lyric-offsets", JSON.stringify(next.lyrics.offsets));
    // 「播完再停」是偏好（P0-24）：只存这一个开关，定时本身不持久化（重启不该继续倒数）
    if (next.sleep.waitEnd !== prev.sleep.waitEnd) {
      void kv.write("sleep-wait-end", next.sleep.waitEnd ? "1" : "0");
    }

    reconcile(prev, next, engine);
    prev = next;
    persistNow();
  });

  // 曲库恢复走快照 + 日志回放，毫秒级；不在这里扫描目录
  // 打点留在生产代码里：perf 脚本读它，用户也能在 DevTools 里看到这条
  performance.mark("afeifei:restore-start");
  await restoreLibrary(library);
  performance.mark("afeifei:restore-end");
  performance.measure("afeifei:restore", "afeifei:restore-start", "afeifei:restore-end");

  // 元数据覆盖（M11）：文件标签不动，只在索引之上盖一层；坏数据当没有
  setMetaOverrides(parseMetaOverrides(await kv.read("library-meta")));

  await Promise.all([
    loadLikes(kv),
    loadDislikes(kv),
    loadPlaylists(kv),
    loadSavedPlaylists(kv),
    loadHistory(kv),
    loadLog(kv),
  ]);

  // 明暗主题（docs/09 B4）：恢复比首屏晚一点点，但只改一个属性，不会重排
  const storedTheme = await kv.read(THEME_KEY);
  const theme: Theme = isTheme(storedTheme) ? storedTheme : "light";
  applyTheme(theme);

  // 全局配色包（B-9）：覆盖挂在 html 的 inline style 上，优先级高于预设块
  const storedGlobal = await kv.read(GLOBAL_THEME_KEY);
  if (storedGlobal) {
    try {
      setGlobalTokens(sanitizeGlobalTokens(JSON.parse(storedGlobal)));
    } catch {
      /* 坏快照当没有 */
    }
  }
  syncWindowOverlay(); // 无框窗口三键颜色 = 应用完全部主题 token 后的最终值

  // 歌词过滤规则（B-2）：装配层读回 KV，lyric-source 订阅着这份规则，改规则不重抓词
  setFilters(parseFilters(await kv.read("lyric-filters")));

  // 下载设置（B-10）：runner 订阅着这份值，改并发会立刻补位
  setDownloadSettings(parseDownloadSettings(await kv.read(DOWNLOAD_SETTINGS_KEY)));

  // 音频配置：入口先 sanitize 再进 store——坏数据在这里挡下，不进真相
  const savedAudio = sanitizeAudioConfig(await kv.read("audio-eq"));
  dispatch({ type: "audio/restore", config: savedAudio });

  // 播放页配置（预设 / 层开关 / 歌词渲染器 / 译文开关），同 audio 的模式
  const savedStage = sanitizeStageConfig(await kv.read("stage-ui"));
  dispatch({ type: "stage/restore", config: savedStage });

  // 失败策略（P0-15）：默认 skip；坏数据在 sanitize 里落回默认，不进真相
  dispatch({ type: "playback/restore", config: sanitizePlaybackConfig(await kv.read("playback")) });

  // 歌词校准表（P0-18）：坏条目逐条丢，一条烂数据不能清空整份校准
  dispatch({ type: "lyric/restoreOffsets", offsets: sanitizeLyricOffsets(await kv.read("lyric-offsets")) });

  // 睡眠定时偏好（P0-24）：只恢复"播完再停"这个勾选，不恢复定时本身
  dispatch({ type: "sleep/setWaitEnd", waitEnd: (await kv.read("sleep-wait-end")) === "1" });

  // 首次使用引导（C-16）：KV 缺失 = 还没看过，App 挂载后弹一次
  const onboarded = (await kv.read("onboarded")) !== null;

  // 歌词缓存：坏条目在 parseLyricCache 里逐条丢掉，不让一条烂数据清空整份
  lyricCache = parseLyricCache(await kv.read("lyric-cache"));
  // 手动换词绑定（P0-19）：同款逐条校验
  lyricBindings = parseLyricBindings(await kv.read("lyric-bindings"));

  const snapshot = await persister.restore();
  if (snapshot) {
    dispatch({ type: "queue/restore", state: snapshot.queue });
    dispatch({ type: "player/setVolume", volume: snapshot.volume });
    dispatch({ type: "player/setMuted", muted: snapshot.muted === true });
    // 倍速与音调补偿：老快照没这两个字段时按 1 / true 处理
    dispatch({ type: "player/setPlaybackRate", rate: snapshot.playbackRate ?? 1 });
    dispatch({ type: "player/setPreservesPitch", on: snapshot.preservesPitch !== false });
    if (snapshot.trackId) {
      dispatch({
        type: "player/cue",
        trackId: snapshot.trackId,
        positionMs: snapshot.positionMs,
        // 老快照没有这两个字段：按 null 恢复，行为与升级前一致（P0-13）
        trackTitle: snapshot.trackTitle ?? null,
        remote: snapshot.remote ?? null,
      });
    }
  }

  window.addEventListener("beforeunload", () => {
    void persister.flush(getState, () => clock.t(performance.now()));
  });

  /** 收藏歌单的展示形态（不把 domain 的内部结构泄进 Services 契约）。 */
  const savedView = (): SavedPlaylistView[] =>
    getSavedPlaylists().map((p) => ({
      sourceId: p.sourceId,
      id: p.id,
      name: p.name,
      count: p.count,
      coverUrl: p.coverUrl,
      savedAt: p.savedAt,
    }));

  /**
   * 唯一入队口（B-10）：模板在这里变成路径，单曲与批量共用。
   * 不在队列里重复加同一 id（含已完成），否则点两次就把同一个文件下两遍。
   */
  const enqueueDownload = (
    sourceId: string,
    track: { sourceId: string; title: string; artist: string; album?: string },
    dir: string,
    index?: number,
  ): boolean => {
    const id = `${sourceId}:${track.sourceId}`;
    const items = getState().download.items;
    if (items.some((i) => i.id === id)) return false;
    const base = renderName(getDownloadSettings().template, { ...track, index, id: track.sourceId });
    const destPath = uniqueDestPath(dir, base, ".mp3", id, items);
    dispatch({
      type: "download/add",
      item: {
        id,
        sourceId,
        songId: track.sourceId,
        title: `${track.title} — ${track.artist}`,
        destPath,
        state: "queued",
        received: 0,
        total: 0,
        tries: 0,
        speed: 0,
        error: null,
      },
    });
    return true;
  };

  const services: Services = {
    engine,
    theme,
    setTheme(next) {
      applyTheme(next);
      void kv.write(THEME_KEY, next);
      syncWindowOverlay(); // 系统三键跟着换色，夜间下右侧不挂白条
      return next;
    },
    pick: () => media.pickFiles(),
    positionMs: () => clock.t(performance.now()),
    cover: (id, path) => loadCover(library, id, path),

    sources: () =>
      listProviders().map((p) => ({
        id: p.id,
        name: p.name,
        canAuth: p.capabilities.canLogin,
        canDownload: p.capabilities.canGetUrl,
        canPlaylists: p.capabilities.canListPlaylists,
        canToplists: p.capabilities.canGetToplist,
        canAccount: Boolean(p.account),
      })),

    async listPlaylists(sourceId) {
      const provider = getProvider(sourceId);
      if (!provider?.capabilities.canListPlaylists || !provider.listPlaylists) {
        throw humanize({ code: "capability-missing" });
      }
      try {
        return await provider.listPlaylists();
      } catch (err) {
        throw humanize(err);
      }
    },

    async listToplists(sourceId) {
      const provider = getProvider(sourceId);
      if (!provider?.capabilities.canGetToplist || !provider.listToplists) {
        throw humanize({ code: "capability-missing" });
      }
      try {
        return await provider.listToplists();
      } catch (err) {
        throw humanize(err);
      }
    },

    // 收藏的在线歌单（M11）：域里留一份内存，KV 留一份持久化；返回的都是「改完之后的全量」
    onlinePlaylists: () => Promise.resolve(savedView()),

    async savePlaylist(sourceId, playlist) {
      setSavedPlaylists(mergeSaved(getSavedPlaylists(), { sourceId, ...playlist }));
      await saveSavedPlaylists(kv).catch(() => undefined);
      return savedView();
    },

    async importPlaylist(sourceId, ref) {
      const id = parsePlaylistRef(ref);
      if (!id) {
        throw new Error("没认出歌单 id：粘贴分享链接，或直接填歌单 id（一串数字）");
      }
      const provider = getProvider(sourceId);
      if (!provider) throw humanize({ code: "capability-missing" });
      // 名字只是显示用：源没有 playlistMeta（比如 QQ 的普通歌单）就退回 id，不让导入失败
      let meta: { id: string; name: string; count: number; coverUrl?: string } = {
        id,
        name: `歌单 ${id}`,
        count: 0,
      };
      if (provider.playlistMeta) {
        try {
          meta = await provider.playlistMeta(id);
        } catch (err) {
          throw humanize(err);
        }
      }
      return services.savePlaylist(sourceId, meta);
    },

    async removePlaylist(sourceId, id) {
      setSavedPlaylists(dropSaved(getSavedPlaylists(), sourceId, id));
      await saveSavedPlaylists(kv).catch(() => undefined);
      return savedView();
    },

    async playlistTracks(sourceId, playlistId, page = 0) {
      const provider = getProvider(sourceId);
      if (!provider?.capabilities.canGetPlaylist || !provider.getPlaylist) {
        throw humanize({ code: "capability-missing" });
      }
      try {
        return await provider.getPlaylist(playlistId, page);
      } catch (err) {
        throw humanize(err);
      }
    },

    async searchOnline(sourceId, keyword, page = 0) {
      const provider = getProvider(sourceId);
      if (!provider) throw humanize({ code: "capability-missing" });
      // UI 只按声明办事：没声明 canSearch 就不该调到这来
      if (!provider.capabilities.canSearch) throw humanize({ code: "capability-missing" });
      try {
        return await provider.search(keyword, page);
      } catch (err) {
        throw humanize(err);
      }
    },

    async resolveOnlineUrl(sourceId, trackId, quality) {
      const provider = getProvider(sourceId);
      if (!provider) throw humanize({ code: "capability-missing" });
      if (!provider.capabilities.canGetUrl || !provider.getUrl) {
        throw humanize({ code: "capability-missing" });
      }
      try {
        return await provider.getUrl(trackId, quality);
      } catch (err) {
        throw humanize(err);
      }
    },

    /* ---- 账号级数据（R1 第一批）。五件事都走同一个门：没 account 说能力缺失，
       上游的 auth-required / network 一律收敛成人话，界面只显示那句话。 ---- */
    canAccount: (sourceId) => Boolean(getProvider(sourceId)?.account),
    accountDailySongs: (sourceId) => runAccount(sourceId, (acc) => acc.dailySongs()),
    accountLikedIds: (sourceId) => runAccount(sourceId, (acc) => acc.likedIds()),
    accountLikedSongs: (sourceId) => runAccount(sourceId, (acc) => acc.likedSongs()),
    accountLikedTotal: (sourceId) => runAccount(sourceId, (acc) => acc.likedTotal()),
    accountSetLiked: (sourceId, songId, liked) =>
      runAccount(sourceId, (acc) => acc.setLiked(songId, liked)),
    accountHistory: (sourceId, range) => runAccount(sourceId, (acc) => acc.listeningHistory(range)),
    accountPersonalFm: (sourceId) => runAccount(sourceId, (acc) => acc.personalFm()),

    async reportDislike(sourceId, songId, scene) {
      const acc = getProvider(sourceId)?.account;
      // 上报是"尽力而为"：源没有这个能力、或上游抽风，本地名单照样生效
      if (!acc?.dislike) return false;
      try {
        await acc.dislike(songId, scene);
        return true;
      } catch {
        return false;
      }
    },

    async lyric(sourceId, songId) {
      // 手动挑的那版最优先：用户的选择比任何自动匹配都权威（P0-19）
      const bound = getLyricBinding(lyricBindings, lyricBindKey({ sourceId, songId }, null));
      if (bound) return bindingToDoc(bound, `${sourceId}:${songId}`);

      // 再看出本地缓存：同一首词第二次不该再打网络（A-03）
      const key = lyricCacheKey(sourceId, songId);
      const hit = getCachedLyric(lyricCache, key);
      if (hit) return hit;

      const provider = getProvider(sourceId);
      if (!provider || !provider.capabilities.canGetLyric || !provider.getLyric) {
        throw humanize({ code: "capability-missing" });
      }
      try {
        const doc = await provider.getLyric(songId);
        const next = putCachedLyric(lyricCache, key, doc, Date.now());
        if (next !== lyricCache) {
          lyricCache = next;
          scheduleLyricCacheSave();
        }
        return doc;
      } catch (err) {
        throw humanize(err);
      }
    },

    /**
     * 本地曲目词（P0-20）：同名 .lrc → 内嵌标签 → LRCLIB。
     * 与在线路径共用同一份缓存 —— 否则每次切回本地歌都要重读文件、重打一次 LRCLIB。
     * 缓存的是**文件自带偏移**（`doc.offsetMs` 里没有用户校准），所以回读后 P0-18 仍能正确叠加。
     */
    async localLyric(track) {
      if (!track?.path) throw new Error("纯音乐");
      // 手动挑的那版最优先：本地文件里那版可能是错的，用户已经表过态了
      const bound = getLyricBinding(lyricBindings, lyricBindKey(null, track.id));
      if (bound) return bindingToDoc(bound, track.id, track.durationMs);

      const key = lyricCacheKey("local", track.id);
      const hit = getCachedLyric(lyricCache, key);
      if (hit) return hit;

      const doc = await resolveLocalLyric(track.path, track, {
        read: (p) => api.localLyric(p),
        http: { fetchJson: (url, options) => api.fetchJson(url, options) },
      });
      const next = putCachedLyric(lyricCache, key, doc, Date.now());
      if (next !== lyricCache) {
        lyricCache = next;
        scheduleLyricCacheSave();
      }
      return doc;
    },

    /** 手动换词（P0-19）：搜 LRCLIB 候选。「歌名 歌手」整句发 q，让上游自己分词。 */
    searchLyrics(query) {
      const text = query.trim();
      if (!text) return Promise.resolve([]);
      return searchLrclib({ fetchJson: (url, options) => api.fetchJson(url, options) }, {
        trackName: text,
        q: text,
      });
    },

    /**
     * 存下用户挑的那版词并返回 doc。
     * 读取顺序是"绑定 → 缓存 → 自动取词"，所以这里不用清缓存；
     * 但**将来做"取消手动绑定"时必须回来清**，否则旧缓存会立刻接管，看起来像没取消掉。
     */
    bindLyric(key, trackId, text, totalMs) {
      if (!key || !text.trim()) throw new Error("这版歌词是空的");
      const next = putLyricBinding(lyricBindings, key, text, Date.now());
      if (next !== lyricBindings) {
        lyricBindings = next;
        void kv.write("lyric-bindings", serializeLyricBindings(next));
      }
      return Promise.resolve(bindingToDoc(text, trackId, totalMs));
    },

    spectrum: (bins) => engine.spectrum(bins),
    openMini: () => api.openMini(),
    openLyric: () => api.openLyric(),
    unlockLyric: () => api.unlockLyric(),

    exportBackup: () => api.exportBackup(),
    importBackup: () => api.importBackup(),

    async exportTheme() {
      const s = getState().stage;
      const preset = PRESETS.find((p) => p.id === s.preset) ?? PRESETS[0];
      const tokens = { ...preset.tokens, ...(s.customTokens ?? {}) };
      const json = JSON.stringify({ name: preset.name, version: 1, tokens }, null, 2);
      return api.exportTheme(json);
    },

    async importTheme() {
      const raw = await api.importTheme();
      if (!raw) return null;
      const tokens = sanitizeThemeTokens((raw as { tokens?: unknown }).tokens ?? raw);
      if (!tokens) throw new Error("这个文件里没有可用的主题 token");
      dispatch({ type: "stage/setTheme", tokens });
      return tokens;
    },

    // 全局配色包（B-9）：与播放页共用 theme:import/export 的文件 IO，token 白名单分开
    globalTokens: () => Promise.resolve(getGlobalTokens()),

    async importGlobalTheme() {
      const raw = await api.importTheme();
      if (!raw) return null;
      const file = raw as { scope?: unknown; tokens?: unknown };
      if (file.scope !== "global") {
        throw new Error("这不是全局配色包（播放页的主题包请到播放页「视图」里导入）");
      }
      const tokens = sanitizeGlobalTokens(file);
      if (!tokens) throw new Error("这个文件里没有可用的全局配色 token");
      setGlobalTokens(tokens);
      await kv.write(GLOBAL_THEME_KEY, JSON.stringify(tokens)).catch(() => undefined);
      return tokens;
    },

    async exportGlobalTheme() {
      const tokens = getGlobalTokens();
      if (!tokens) return false;
      return api.exportTheme(JSON.stringify(globalThemeFile(tokens), null, 2));
    },

    async clearGlobalTheme() {
      setGlobalTokens(null);
      await kv.write(GLOBAL_THEME_KEY, "").catch(() => undefined);
    },

    importSource: () => api.importUserSource(),

    async installSource(_fileName, code) {
      const installed = await installAndRegister(code);
      // 同 id 覆盖，其余保留
      const list = await readStoredSources();
      const next = [...list.filter((s) => s.id !== installed.id), { id: installed.id, name: installed.name, code }];
      await kv.write("user-sources", JSON.stringify(next));
      return installed;
    },

    // 登录按源路由：网易云扫码 / QQ 扫码（key 带真实 unikey，加 qq: 前缀供轮询分流；
    // 前缀丢了轮询就会拿字面量当 key，check 永远 800。channel 决定码用哪个 App 扫）
    startLogin: async (sourceId, channel) => {
      if (sourceId === "qq") {
        const { key, qrImage } = await api.qqLogin(channel);
        return { key: `qq:${key}`, qrImage };
      }
      return startQrLogin(localApi);
    },
    pollLogin: async (key) => {
      if (key.startsWith("qq:")) {
        const r = await api.qqPoll(key.slice(3));
        // check 的 code 与网易云同款（800 失效 / 801 未扫 / 802 已扫 / 803 成功）；包返回英文状态，这里翻译
        const hint =
          r.code === 800
            ? "二维码已失效，请点「刷新」重新扫码"
            : r.code === 801
              ? "等待扫码"
              : r.code === 802
                ? "已扫码，请在手机上确认"
                : r.message;
        return {
          code: r.loggedIn ? 803 : r.code,
          loggedIn: r.loggedIn,
          message: r.loggedIn ? "登录成功" : hint,
        };
      }
      return pollQrLogin(localApi, key);
    },
    loginStatus: async (sourceId) => {
      const profile = await localApi.profile(sourceId);
      return { loggedIn: profile.loggedIn, nick: profile.nick };
    },
    logout: (sourceId) => localApi.logout(sourceId),

    async sendCaptcha(phone) {
      const body = (await api.ncmCall("captcha_sent", { phone })) as NcmBody;
      const ok = body?.code === 200;
      return { ok, message: ok ? "验证码已发送" : (body?.msg ?? body?.message ?? `发送失败（code=${body?.code}）`) };
    },

    async loginByCaptcha(phone, captcha) {
      // 注意：不是 captcha_verify —— 那个只校验验证码，不产生登录态。
      // 真正的验证码登录是 login_cellphone（它按是否传 captcha 决定用验证码还是密码）。
      const body = (await api.ncmCall("login_cellphone", { phone, captcha })) as NcmBody;
      if (body?.code !== 200) {
        return { ok: false, message: body?.msg ?? body?.message ?? `登录失败（code=${body?.code}）` };
      }
      const profile = await api.ncmProfile();
      return profile.loggedIn
        ? { ok: true, message: `登录成功${profile.nick ? `：${profile.nick}` : ""}` }
        : { ok: false, message: "验证码通过了但没拿到登录态，请再试一次" };
    },

    async scan(onProgress) {
      // 曲库目录是持久化的（M9）：第一次扫先选一个，之后每次重扫按列表走，不再问一遍
      let roots = await api.libraryRoots();
      if (roots.length === 0) {
        const added = await api.addLibraryRoot();
        if (!added || added.length === 0) return null;
        roots = added;
      }
      return scanLibrary(library, roots, onProgress);
    },

    async editTrackMeta(id, patch) {
      // 先落内存再落盘：界面立刻看到新名字，写盘失败最多是重启后回到文件值
      const next = patchMeta(getMetaOverrides(), id, patch);
      setMetaOverrides(next);
      await kv.write("library-meta", serializeMetaOverrides(next)).catch(() => undefined);
    },

    libraryRoots: () => api.libraryRoots(),
    addLibraryRoot: () => api.addLibraryRoot(),
    removeLibraryRoot: (dir) => api.removeLibraryRoot(dir),
    autoLaunch: () => api.autoLaunch(),
    setAutoLaunch: (on) => api.setAutoLaunch(on),

    onboarded,
    async markOnboarded() {
      await kv.write("onboarded", "1").catch(() => undefined);
    },

    lyricFilters: () => Promise.resolve(rulesToText(getFilters())),
    async setLyricFilters(text) {
      const next = rulesFromText(text);
      setFilters(next); // 先生效：正则改完当屏歌词就要变，不等写盘
      await kv.write("lyric-filters", serializeFilters(next)).catch(() => undefined);
      return invalidPatterns(next);
    },

    async downloadTrack(sourceId, track) {
      const dir = await api.downloadDir();
      return enqueueDownload(sourceId, track, dir)
        ? "已加入下载队列。"
        : "这首已经在下载队列里了。";
    },

    async downloadTracks(sourceId, tracks) {
      if (tracks.length === 0) return "没选歌。";
      const dir = await api.downloadDir();
      let added = 0;
      tracks.forEach((track, i) => {
        if (enqueueDownload(sourceId, track, dir, i + 1)) added += 1;
      });
      const skipped = tracks.length - added;
      return `已加入 ${added} 首${skipped > 0 ? `，跳过 ${skipped} 首（已在队列）` : ""}。`;
    },

    downloadSettings: () => Promise.resolve({ ...getDownloadSettings() }),
    async setDownloadSettings(next) {
      const saved = setDownloadSettings(next);
      await kv.write(DOWNLOAD_SETTINGS_KEY, serializeDownloadSettings(saved)).catch(() => undefined);
      return { ...saved };
    },

    async removeDownload(id) {
      const item = getState().download.items.find((i) => i.id === id);
      if (item) api.downloadCancel(id); // 在途连接先断（幂等）
      dispatch({ type: "download/remove", id });
      if (item) await api.downloadRemove(item.destPath).catch(() => undefined);
    },

    downloadUsage: () => api.downloadUsage(),
    setDownloadDir: () => api.downloadSetDir(),

    onUpdateAvailable: (cb) => api.onUpdateAvailable(cb),
    lastCrash: () => api.lastCrash(),
    markCrashSeen: (file) => api.markCrashSeen(file),
    openExternal: (url) => api.openExternal(url),
  };

  // 下载执行器（M7）：与播放链路同源——完成后走曲库，不做"边下边播"
  startDownloadRunner({
    port: download,
    library,
    kv,
    resolveUrl: (sourceId, songId) => services.resolveOnlineUrl(sourceId, songId, "320k"),
  });

  return services;
}

/**
 * 账号级调用的统一入口。
 * 集中一处是为了让「没这个能力」和「上游拒绝」两条错都只翻译一次——
 * 五个页面各写一遍 humanize 迟早出现一处忘了包、界面显示 [object Object]。
 */
async function runAccount<T>(sourceId: string, fn: (acc: AccountCapability) => Promise<T>): Promise<T> {
  const acc = getProvider(sourceId)?.account;
  if (!acc) throw humanize({ code: "capability-missing" });
  try {
    return await fn(acc);
  } catch (err) {
    throw humanize(err);
  }
}

/** store → engine 的单向同步。任何"引擎反过来改 store"都是 bug。 */
function reconcile(prev: AppState, next: AppState, engine: AudioEngine): void {
  const p = prev.player;
  const n = next.player;
  const now = performance.now();

  if (n.trackId && n.trackId !== p.trackId) {
    if (n.volume !== p.volume) engine.setVolume(n.volume);
    if (n.muted !== p.muted) engine.setMuted(n.muted);
    // crossfade 预判必须在 load 之前同步做：grant 是异步的，事后问就晚了。
    // 走 crossfade 时时钟继续跟出场曲，归零由切点回调 onSwitched 负责（00 §3.2 #5）。
    const keepClock = engine.willCrossfade(n.trackId);
    void engine.load(n.trackId).then((changed) => {
      if (!changed || keepClock) return;
      if (n.positionMs > 0) engine.seek(n.positionMs);
      if (getState().player.status === "playing") {
        clock.start(n.positionMs, performance.now());
        void engine.play();
      }
    });
    if (!keepClock) {
      // 无论处于 loading 还是 playing，时钟锚点都要立刻跟上 ——
      // 否则恢复上次位置后进度条会从 0 开始，与音频真实位置对不上（I1）。
      clock.seek(n.positionMs, now);
    }
    return;
  }

  // crossfade 中状态机由 onFadeStart/onSwitched 驱动，这里别去动 clock 与播放
  if (n.status !== p.status && !engine.isFading()) {
    if (n.status === "playing") {
      clock.start(n.positionMs, now);
      void engine.play();
    } else if (n.status === "paused" || n.status === "ended" || n.status === "idle") {
      clock.stop(now);
      engine.pause();
    }
  }

  if (n.positionMs !== p.positionMs) {
    engine.seek(n.positionMs);
    clock.seek(n.positionMs, now);
  }

  if (n.volume !== p.volume) engine.setVolume(n.volume);
  if (n.muted !== p.muted) engine.setMuted(n.muted);
  // 倍速与音调补偿：跟音量一样直接落到引擎（抄 lx 的 defaultPlaybackRate + playbackRate 双写）
  // 注意必须放在**换歌分支之外** —— 变速本身不换歌，放在里面就永远不生效。
  if (n.playbackRate !== p.playbackRate) engine.setPlaybackRate(n.playbackRate);
  if (n.preservesPitch !== p.preservesPitch) engine.setPreservesPitch(n.preservesPitch);
  // 单曲循环（P0-05）：交给元素的 loop，播完不重新 load（省一次取源，也不会断一拍）。
  // 必须放在换歌分支之外 —— 换模式本身不换歌。
  if (next.queue.mode !== prev.queue.mode) engine.setLoop(next.queue.mode === "repeat-one");

  // 音频配置与播放状态分开比较：调 EQ 不该碰播放链路，反之亦然。
  // p/n 是 player 域，audio 在 AppState 顶层，从 prev/next 取。
  const pa = prev.audio;
  const na = next.audio;
  if (na !== pa) {
    if (na.preampDb !== pa.preampDb) engine.setPreamp(na.preampDb);
    if (na.eq.some((v: number, i: number) => v !== pa.eq[i])) engine.setEq(na.eq);
    if (na.crossfadeSec !== pa.crossfadeSec) engine.setCrossfade(na.crossfadeSec);
    // 输出设备（P0-09）：图还没建时 engine 会记住，第一次 play() 时补上
    if (na.outputId !== pa.outputId) void engine.setOutputDevice(na.outputId);
  }
}
