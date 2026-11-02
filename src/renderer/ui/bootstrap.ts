import type { AppState, DownloadItem } from "../../contracts/index.js";
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
import { restoreLibrary, scanLibrary } from "../domain/library/scan.js";
import { startDownloadRunner } from "../domain/download/runner.js";
import { loadHistory, pushHistory as recordPlay, saveHistory } from "../domain/history/index.js";
import { loadLikes, saveLikes, subscribe as subscribeLikes } from "../domain/likes/index.js";
import { loadPlaylists, savePlaylists, subscribe as subscribePlaylists } from "../domain/playlists/index.js";
import { clock } from "../kernel/clock.js";
import { dispatch, getState, subscribe } from "../kernel/index.js";
import { createPersister } from "../kernel/persist.js";

import { humanize, type Api, type NcmBody, type Services } from "./services.js";
import { applyTheme, isTheme, THEME_KEY, type Theme } from "./theme.js";

declare global {
  interface Window {
    api: Api;
  }
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
    pickDir: () => api.pickDir(),
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

  engine.on({
    onReady: () => dispatch({ type: "player/ready" }),
    onEnded: () => dispatch({ type: "player/ended" }),
    onError: (code) => dispatch({ type: "player/error", code }),
    // crossfade（M9-3）：进窗口就切下一首；repeat-one 对自己淡入没有意义，走自然 ended
    onNearEnd: () => {
      if (getState().queue.mode === "repeat-one") return;
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

  let prev = getState();
  subscribe(() => {
    const next = getState();

    // 刚开始播一首 → 记历史
    if (next.player.status === "playing" && prev.player.status !== "playing" && next.player.trackId) {
      if (recordPlay(next.player.trackId)) void saveHistory(kv);
    }

    if (next.audio !== prev.audio) scheduleAudioSave();
    if (next.stage !== prev.stage) scheduleStageSave();

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

  await Promise.all([loadLikes(kv), loadPlaylists(kv), loadHistory(kv)]);

  // 明暗主题（docs/09 B4）：恢复比首屏晚一点点，但只改一个属性，不会重排
  const storedTheme = await kv.read(THEME_KEY);
  const theme: Theme = isTheme(storedTheme) ? storedTheme : "light";
  applyTheme(theme);

  // 音频配置：入口先 sanitize 再进 store——坏数据在这里挡下，不进真相
  const savedAudio = sanitizeAudioConfig(await kv.read("audio-eq"));
  dispatch({ type: "audio/restore", config: savedAudio });

  // 播放页配置（预设 / 层开关 / 歌词渲染器），同 audio 的模式
  const savedStage = sanitizeStageConfig(await kv.read("stage-ui"));
  dispatch({ type: "stage/restore", config: savedStage });

  const snapshot = await persister.restore();
  if (snapshot) {
    dispatch({ type: "queue/restore", state: snapshot.queue });
    dispatch({ type: "player/setVolume", volume: snapshot.volume });
    if (snapshot.trackId) {
      dispatch({ type: "player/cue", trackId: snapshot.trackId, positionMs: snapshot.positionMs });
    }
  }

  window.addEventListener("beforeunload", () => {
    void persister.flush(getState, () => clock.t(performance.now()));
  });

  const services: Services = {
    engine,
    theme,
    setTheme(next) {
      applyTheme(next);
      void kv.write(THEME_KEY, next);
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

    async lyric(sourceId, songId) {
      const provider = getProvider(sourceId);
      if (!provider || !provider.capabilities.canGetLyric || !provider.getLyric) {
        throw humanize({ code: "capability-missing" });
      }
      try {
        return await provider.getLyric(songId);
      } catch (err) {
        throw humanize(err);
      }
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
      const dir = await api.pickDir();
      if (!dir) return null;
      return scanLibrary(library, [dir], onProgress);
    },

    async downloadTrack(sourceId, track) {
      const dir = await api.downloadDir();
      // 文件名里的 Windows 非法字符压掉；扩展名按 320k 直链的实际格式写死 mp3（flac 待源按音质返回后处理）
      const safe = `${track.title} - ${track.artist}`.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
      const destPath = `${dir}/${safe}.mp3`;
      const id = `${sourceId}:${track.sourceId}`;
      const item: DownloadItem = {
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
      };
      dispatch({ type: "download/add", item });
      return "已加入下载队列。";
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

/** store → engine 的单向同步。任何"引擎反过来改 store"都是 bug。 */
function reconcile(prev: AppState, next: AppState, engine: AudioEngine): void {
  const p = prev.player;
  const n = next.player;
  const now = performance.now();

  if (n.trackId && n.trackId !== p.trackId) {
    if (n.volume !== p.volume) engine.setVolume(n.volume);
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

  // 音频配置与播放状态分开比较：调 EQ 不该碰播放链路，反之亦然。
  // p/n 是 player 域，audio 在 AppState 顶层，从 prev/next 取。
  const pa = prev.audio;
  const na = next.audio;
  if (na !== pa) {
    if (na.preampDb !== pa.preampDb) engine.setPreamp(na.preampDb);
    if (na.eq.some((v: number, i: number) => v !== pa.eq[i])) engine.setEq(na.eq);
    if (na.crossfadeSec !== pa.crossfadeSec) engine.setCrossfade(na.crossfadeSec);
  }
}
