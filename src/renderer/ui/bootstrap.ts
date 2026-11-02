import type { Quality, RemoteTrack, SearchResult } from "../../contracts/capability.js";
import type { AppState } from "../../contracts/index.js";
import type {
  KeyValuePort,
  LibraryPort,
  LocalApiPort,
  MediaPort,
  RawMeta,
  StoragePort,
} from "../../contracts/ports.js";
import { AudioEngine } from "../capability/audio/engine.js";
import { sanitizeAudioConfig } from "../capability/audio/eq.js";
import { createQqProvider } from "../capability/sources/qq/index.js";
import { errorText, translateError } from "../capability/errors.js";
import { getProvider, listProviders, registerProvider } from "../capability/registry.js";
import { demoProvider } from "../capability/sources/demo/index.js";
import {
  createNeteaseProvider,
  pollQrLogin,
  startQrLogin,
  type QrSession,
} from "../capability/sources/netease/index.js";
import { loadCover } from "../domain/library/cover.js";
import { restoreLibrary, scanLibrary, type ScanStats } from "../domain/library/scan.js";
import { loadHistory, pushHistory as recordPlay, saveHistory } from "../domain/history/index.js";
import { loadLikes, saveLikes, subscribe as subscribeLikes } from "../domain/likes/index.js";
import { loadPlaylists, savePlaylists, subscribe as subscribePlaylists } from "../domain/playlists/index.js";
import { clock } from "../kernel/clock.js";
import { dispatch, getState, subscribe } from "../kernel/index.js";
import { createPersister } from "../kernel/persist.js";

interface Api {
  ping(): string;
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<void>;
  pickFiles(): Promise<string[]>;
  grant(filePath: string): Promise<string | null>;
  pickDir(): Promise<string | null>;
  scan(dirs: string[]): Promise<string[]>;
  readTags(filePaths: string[]): Promise<unknown[]>;
  statFiles(filePaths: string[]): Promise<{ path: string; size: number; mtimeMs: number }[]>;
  cover(filePath: string): Promise<string | null>;
  loadIndex(): Promise<string | null>;
  saveIndex(json: string): Promise<void>;
  readIndexLog(): Promise<string>;
  appendIndexLog(lines: string): Promise<void>;
  clearIndexLog(): Promise<void>;
  readStore(key: string): Promise<string | null>;
  writeStore(key: string, json: string): Promise<void>;

  // 音源本地通道（主进程内嵌 SDK）
  ncmCall(method: string, params?: Record<string, unknown>): Promise<unknown>;
  ncmProfile(): Promise<{ loggedIn: boolean; nick: string | null; uid: string | null }>;
  ncmLogout(): Promise<void>;
  qqCall(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

declare global {
  interface Window {
    api: Api;
  }
}

export interface Services {
  engine: AudioEngine;
  pick(): Promise<string[]>;
  positionMs(): number;
  /** 选目录并扫描。取消返回 null。 */
  scan(onProgress?: (done: number, total: number) => void): Promise<ScanStats | null>;
  /** 取封面（带缓存与请求去重）。 */
  cover(id: string, path: string): Promise<string | null>;
  /** 已注册的音源（UI 的选项来源就是它，不写死）。 */
  sources(): { id: string; name: string; canAuth: boolean }[];
  /** 在线搜索。错误已经翻译成人话，直接显示。 */
  searchOnline(sourceId: string, keyword: string, page?: number): Promise<SearchResult>;
  /** 取在线播放地址。拿到的是一个本地代理地址（真音源接入后才会有）。 */
  resolveOnlineUrl(sourceId: string, trackId: string, quality: Quality): Promise<string>;
  /** 开始扫码：拿到 key 与服务端画好的二维码图 */
  startLogin(): Promise<QrSession>;
  /** 轮询扫码结果 */
  pollLogin(key: string): Promise<{ code: number; loggedIn: boolean; message: string }>;
  /** 查询当前登录态（只看账号接口，不看 cookie 字段） */
  loginStatus(): Promise<{ loggedIn: boolean; nick: string | null }>;
  /** 手机号登录：发短信验证码 */
  sendCaptcha(phone: string): Promise<{ ok: boolean; message: string }>;
  /** 手机号登录：用验证码换登录态 */
  loginByCaptcha(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>;
  logout(): Promise<void>;
}

interface NcmBody {
  code?: number;
  msg?: string;
  message?: string;
}

/** 把能力层抛的错收敛成一句人话。界面永远只看到这句话。 */
function humanize(err: unknown): Error {
  const code = translateError(err);
  const wrapped = new Error(errorText(code));
  (wrapped as Error & { code?: string }).code = code;
  return wrapped;
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

  // 音源本地通道：加密、cookie、限流都在主进程一侧，渲染层只给方法名。
  // namespace 决定走哪条主进程通道（netease / qq）。
  const localApi: LocalApiPort = {
    call: (namespace, method, params) =>
      namespace === "qq" ? api.qqCall(method, params) : api.ncmCall(method, params),
    profile: (namespace) =>
      namespace === "qq" ? Promise.resolve({ loggedIn: false, nick: null, uid: null }) : api.ncmProfile(),
    logout: (namespace) => (namespace === "qq" ? Promise.resolve() : api.ncmLogout()),
  };

  // 注册音源：注册即触发启动断言（声明 ↔ 实现一一对应）
  registerProvider(demoProvider);
  registerProvider(createNeteaseProvider(localApi));
  registerProvider(createQqProvider(localApi));

  const engine = new AudioEngine(media);
  const persister = createPersister(storage);

  engine.on({
    onReady: () => dispatch({ type: "player/ready" }),
    onEnded: () => dispatch({ type: "player/ended" }),
    onError: (code) => dispatch({ type: "player/error", code }),
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

  let prev = getState();
  subscribe(() => {
    const next = getState();

    // 刚开始播一首 → 记历史
    if (next.player.status === "playing" && prev.player.status !== "playing" && next.player.trackId) {
      if (recordPlay(next.player.trackId)) void saveHistory(kv);
    }

    if (next.audio !== prev.audio) scheduleAudioSave();

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

  // 音频配置：入口先 sanitize 再进 store——坏数据在这里挡下，不进真相
  const savedAudio = sanitizeAudioConfig(await kv.read("audio-eq"));
  dispatch({ type: "audio/restore", config: savedAudio });

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

  return {
    engine,
    pick: () => media.pickFiles(),
    positionMs: () => clock.t(performance.now()),
    cover: (id, path) => loadCover(library, id, path),

    sources: () =>
      listProviders().map((p) => ({
        id: p.id,
        name: p.name,
        canAuth: p.capabilities.canLogin,
      })),

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

    startLogin: () => startQrLogin(localApi),
    pollLogin: (key) => pollQrLogin(localApi, key),
    loginStatus: async () => {
      const profile = await api.ncmProfile();
      return { loggedIn: profile.loggedIn, nick: profile.nick };
    },
    logout: () => api.ncmLogout(),

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
  };
}

/** store → engine 的单向同步。任何"引擎反过来改 store"都是 bug。 */
function reconcile(prev: AppState, next: AppState, engine: AudioEngine): void {
  const p = prev.player;
  const n = next.player;
  const now = performance.now();

  if (n.trackId && n.trackId !== p.trackId) {
    if (n.volume !== p.volume) engine.setVolume(n.volume);
    void engine.load(n.trackId).then((changed) => {
      if (!changed) return;
      if (n.positionMs > 0) engine.seek(n.positionMs);
      if (getState().player.status === "playing") {
        clock.start(n.positionMs, performance.now());
        void engine.play();
      }
    });
    // 无论处于 loading 还是 playing，时钟锚点都要立刻跟上 ——
    // 否则恢复上次位置后进度条会从 0 开始，与音频真实位置对不上（I1）。
    clock.seek(n.positionMs, now);
    return;
  }

  if (n.status !== p.status) {
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
  }
}
