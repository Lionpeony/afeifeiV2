import type { ErrorCode } from "../../../contracts/index.js";
import type { MediaPort } from "../../../contracts/ports.js";
import { clock } from "../../kernel/clock.js";
import { createGraph, resumeGraph, setEq as applyEq, setPreamp as applyPreamp, type AudioGraph } from "./graph.js";
import { fadeCurves } from "./crossfade.js";
import { aggregateSpectrum } from "./spectrum-bins.js";
import { streamSrcOf } from "./streamSrc.js";

/** 播放淡入时长（秒）。folia 用 0.2s：短到听不出"渐入"，长到能盖住起播的爆音。 */
const FADE_IN_SEC = 0.2;
/** 暂停淡出时长（秒）。比淡入短：用户按暂停要的是"马上安静"，不是"慢慢消失"。 */
const PAUSE_FADE_SEC = 0.15;
/** 剩余多少秒开始预取下一首。10s 够跨过一次网络抖动。 */
const PRELOAD_AHEAD_SEC = 10;

export interface EngineHooks {
  onReady?: () => void;
  onEnded?: () => void;
  onError?: (code: ErrorCode) => void;
  /** 等数据中（P0-26）：waiting → true，playing/canplay → false。只报变化，调用方去重。 */
  onBuffering?: (on: boolean) => void;
  /** 快到结尾了：该把下一首预取进待命元素（P0-08，每首只发一次）。 */
  onPreloadNext?: () => void;
  /** 进入 crossfade 窗口（仅 crossfadeSec>0 时发一次）：该切下一首了。 */
  onNearEnd?: () => void;
  /** crossfade 开始：入场曲已发声，调用方把 loading 转 playing。 */
  onFadeStart?: () => void;
  /** crossfade 切点：新曲成为主轨，调用方把时钟一次性归零（00 §3.2 #5）。 */
  onSwitched?: () => void;
}

/**
 * 音频执行器：把 store 的意图落到 <audio> 上。
 *
 * 它也是**唯一读 audio.currentTime 的地方**（通过 clock.attach 注入），
 * clock 在环 0 不碰 DOM，这里替它碰。
 *
 * crossfade（M9-3，00 §5.3）：双 `<audio>` 交替 + 两条等功率增益曲线交叉。
 * clock 始终读主元素——crossfade 期间主元素仍是出场曲，切点 finalize 交换主/待命，
 * 由 onSwitched 通知调用方把时钟归零。**双音轨 ≠ 双时钟**。
 */
export class AudioEngine {
  private readonly els: [HTMLAudioElement, HTMLAudioElement];
  /** 主元素（clock 与 UI 的位置都跟它）。 */
  private el: HTMLAudioElement;
  /** 待命元素（crossfade 时接下一首）。 */
  private elB: HTMLAudioElement;
  private readonly media: MediaPort;
  private graph: AudioGraph | null = null;
  private hooks: EngineHooks = {};
  private currentSrc: string | null = null;
  /** 图还没建（还没播过第一首）时暂存的音频配置，建图后立即应用。 */
  private pendingPreamp: number | null = null;
  private pendingEq: number[] | null = null;
  /** crossfade 时长（秒），0 = 关。 */
  private crossfadeSec = 0;
  /** 进行中的 crossfade（finalize 定时器）。 */
  private fading: ReturnType<typeof setTimeout> | null = null;
  /** nearEnd 已发过（一次换曲只发一次）。 */
  private nearEndFired = false;

  constructor(media: MediaPort) {
    this.media = media;
    this.els = [new Audio(), new Audio()];
    this.el = this.els[0];
    this.elB = this.els[1];
    for (const el of this.els) el.preload = "auto";

    clock.attach(() => (this.el.readyState >= 1 ? this.el.currentTime * 1000 : null));

    for (const el of this.els) {
      // ready 只认主元素：crossfade 给待命元素装 src 时不能把 loading 打回 paused
      el.addEventListener("loadedmetadata", () => {
        if (el === this.el) this.hooks.onReady?.();
      });
      // crossfade 中出场曲到头是正常路径（我们提前切了），不算 ended
      el.addEventListener("ended", () => {
        if (el === this.el && !this.fading) this.hooks.onEnded?.();
      });
      el.addEventListener("error", () => {
        if (el === this.el) this.hooks.onError?.(this.mapError(el));
      });
      // 缓冲（P0-26）：waiting 才是"开始后卡住"，和 loading（还没开始）不是一回事。
      // crossfade 的待命元素不报 —— 它卡住不该让主窗显示"缓冲中"。
      el.addEventListener("waiting", () => {
        if (el === this.el) this.hooks.onBuffering?.(true);
      });
      for (const done of ["playing", "canplay", "canplaythrough"] as const) {
        el.addEventListener(done, () => {
          if (el === this.el) this.hooks.onBuffering?.(false);
        });
      }
      el.addEventListener("timeupdate", () => {
        if (el === this.el) this.detectNearEnd();
      });
    }
  }

  on(hooks: EngineHooks): void {
    this.hooks = hooks;
  }

  private mapError(el: HTMLAudioElement): ErrorCode {
    const code = el.error?.code;
    if (code === MediaError.MEDIA_ERR_NETWORK) return "network";
    if (code === MediaError.MEDIA_ERR_DECODE) return "decode-failed";
    if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return "track-missing";
    return "unknown";
  }

  /** crossfade 是否正在进行（调用方据此跳过 clock 操作——时钟由切点回调接管）。 */
  isFading(): boolean {
    return this.fading !== null;
  }

  /**
   * 同步预判：track 会不会走 crossfade（reconcile 在 dispatch 后、load 完成前
   * 就得决定动不动 clock——grant 是异步的，事后问就晚了）。
   */
  willCrossfade(track: string): boolean {
    return (
      this.crossfadeSec > 0 &&
      this.currentSrc !== null &&
      track !== this.currentSrc &&
      !this.el.paused &&
      Number.isFinite(this.el.duration)
    );
  }

  setCrossfade(sec: number): void {
    this.crossfadeSec = sec > 0 ? sec : 0;
  }

  /** 主/待命元素各自的增益参数（AudioParam，可直接调度）。 */
  private gainOf(el: HTMLAudioElement): AudioParam | null {
    const g = this.graph;
    if (!g) return null;
    return el === this.els[0] ? g.fadeA.gain : g.fadeB.gain;
  }

  /** 预取事件是否已发过（每首一次，换曲重置）。 */
  private preloadFired = false;

  /**
   * 接近结尾：先发一次"预取下一首"（P0-08，剩余 ≤10s），
   * 到了 crossfade 窗口再发"该切了"（只有 crossfade>0 才有这一步）。
   */
  private detectNearEnd(): void {
    if (this.fading || this.el.paused) return;
    const d = this.el.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const remain = d - this.el.currentTime;

    if (!this.preloadFired && remain <= PRELOAD_AHEAD_SEC) {
      this.preloadFired = true;
      this.hooks.onPreloadNext?.();
    }

    if (this.crossfadeSec <= 0 || this.nearEndFired || remain > this.crossfadeSec) return;
    this.nearEndFired = true;
    this.hooks.onNearEnd?.();
  }

  /**
   * 换曲：把路径换成令牌，再交给 <audio>。返回是否真的换了。
   *
   * crossfade=0：现状路径——先压增益、换 src，play 时恢复。
   * crossfade>0 且主曲在播：不碰主元素，把新曲装进待命元素，两条增益曲线交叉，
   * 切点 finalize 交换主/待命并回调 onSwitched（时钟归零在调用方，00 §3.2 #5）。
   */
  async load(track: string): Promise<boolean> {
    if (this.currentSrc === track) return false;
    if (this.fading) this.finalize(); // 上一场没收完就点了新的：立刻收场，别叠两张
    this.cancelPendingPause(); // 上一首的淡出收尾不能落到这首头上

    // 预取命中（P0-08）：下一首已经在待命元素里装好了，直接即位，省一次取源 + load
    if (this.preloadedTrack === track && this.elB.readyState >= 1) {
      this.preloadedTrack = null;
      this.el.pause();
      this.currentSrc = track;
      this.nearEndFired = false;
      this.preloadFired = false;
      this.swapMain();
      return true;
    }

    const src = await this.resolveSrc(track);
    if (!src) {
      this.nearEndFired = false; // 取源失败，把 ended 还给主元素兜底
      return false;
    }

    if (this.willCrossfade(track)) {
      this.currentSrc = track;
      this.startCrossfade(src);
      return true;
    }

    // 切歌前把增益压到很低（不压到 0，避免淡入逻辑出问题时变成静音）
    const gain = this.gainOf(this.el);
    if (gain && this.graph) {
      gain.cancelScheduledValues(this.graph.ctx.currentTime);
      gain.value = 0.2;
    }

    this.currentSrc = track;
    this.nearEndFired = false;
    this.preloadFired = false;
    this.el.src = src;
    this.el.load();
    return true;
  }

  /** 已经预取好的曲目（P0-08）。换曲/命中后清空。 */
  private preloadedTrack: string | null = null;

  /**
   * 预取下一首到待命元素（P0-08，调度思路抄 lx 的 `usePreloadNextMusic`）。
   *
   * 三条纪律：
   * ① **失败不报 onError**：预取失败不是"当前这首播不了"，报错会把界面打成 error。
   * ② crossfade>0 时不预取：那一档自己会装待命元素，两边抢同一个元素会互相踩。
   * ③ 异步回来要再确认一次 `preloadedTrack`：期间用户可能已经切到别的曲目。
   */
  async preload(track: string): Promise<boolean> {
    if (this.crossfadeSec > 0) return false;
    if (track === this.currentSrc || track === this.preloadedTrack) return false;
    this.preloadedTrack = track;
    const src = await this.resolveSrcQuiet(track);
    if (!src || this.preloadedTrack !== track) {
      if (this.preloadedTrack === track) this.preloadedTrack = null;
      return false;
    }
    this.elB.src = src;
    this.elB.load();
    return true;
  }

  /** 单曲循环（P0-05）：交给元素的 `loop`，播完不重新 load，切歌也不会断。 */
  setLoop(loop: boolean): void {
    for (const el of this.els) el.loop = loop;
  }

  /** 待应用的输出设备（图还没建时暂存，`play()` 建图后补上）。`""` = 跟随系统默认。 */
  private pendingOutputId: string | null = null;

  /**
   * 切输出设备（P0-09）。
   *
   * **必须走 `AudioContext.setSinkId`**：元素一旦接进 `MediaElementSource`，
   * `element.setSinkId()` 就失效（声音还走旧设备，界面却显示切好了）——
   * folia 在 `audioOutputSink.ts` 里踩过这个坑。
   *
   * 返回是否真的切成功：设备被拔掉时回退默认并返回 false，调用方可据此提示，
   * 而不是让用户对着"选了却没声"发呆。
   */
  async setOutputDevice(id: string): Promise<boolean> {
    this.pendingOutputId = id;
    const g = this.graph;
    if (!g) return false; // 图未建：记住，等 play()
    const ctx = g.ctx as AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };
    if (typeof ctx.setSinkId !== "function") return false; // 老内核没这个 API
    try {
      await ctx.setSinkId(id || "default");
      return true;
    } catch {
      this.pendingOutputId = "";
      try {
        await ctx.setSinkId("default");
      } catch {
        // 默认设备也切不过去：安静兜底，别把播放链路整个打断
      }
      return false;
    }
  }

  /** 装 src、起播待命元素、两条曲线交叉、定时到点 finalize。 */
  private startCrossfade(src: string): void {
    const g = this.graph;
    if (!g) return;
    const outgoing = this.el;
    const incoming = this.elB;
    const outGain = this.gainOf(outgoing);
    const inGain = this.gainOf(incoming);
    if (!outGain || !inGain) return;

    incoming.volume = outgoing.volume; // 音量走元素，两路必须一致
    incoming.muted = outgoing.muted; // 静音也要带过去，否则淡入那一半会突然出声
    incoming.src = src;
    incoming.load();

    const t0 = g.ctx.currentTime;
    const dur = this.crossfadeSec;
    const { out, inn } = fadeCurves();
    outGain.cancelScheduledValues(t0);
    inGain.cancelScheduledValues(t0);
    outGain.setValueCurveAtTime(out, t0, dur);
    inGain.setValueCurveAtTime(inn, t0, dur);

    this.fading = setTimeout(() => this.finalize(), dur * 1000);
    void incoming
      .play()
      .then(() => this.hooks.onFadeStart?.())
      .catch(() => {
        // 入场曲起不来（自动播放被拒等）：立即收场回到主曲，别让两边都没声
        this.finalize();
      });
  }

  /**
   * 切点：出场曲退场，待命曲转正。增益一次性归位（曲线已走完，防浮点残值）。
   * 交换后 clock 的 source 闭包读的是新主元素——位置在这里"归零"到新曲，
   * 但时钟锚点由 onSwitched 回调（调用方）去 seek，本方法不碰 clock。
   */
  private finalize(): void {
    if (this.fading) {
      clearTimeout(this.fading);
      this.fading = null;
    }
    this.el.pause();
    this.swapMain();
    this.nearEndFired = false;
    this.hooks.onSwitched?.();
  }

  /**
   * 交换主/待命，**数组顺序不动**。
   *
   * 这里原来是 `els.reverse()`：那会把 `els[0]` 换成另一个元素，而 `gainOf` 是按
   * "els[0] → fadeA" 算的 —— 但两个元素的 `MediaElementSource → fadeX` 在
   * `createGraph` 时就绑死了，换位之后"主元素"实际挂在 fadeB 上（增益 0），
   * **第一次 crossfade 结束就会静音**。所以只交换指针，并把两条增益按元素归位。
   */
  private swapMain(): void {
    const outgoing = this.el;
    this.el = this.elB;
    this.elB = outgoing;
    this.hardSetGain(this.el, 1);
    this.hardSetGain(this.elB, 0);
  }

  /**
   * 本地路径 → 换令牌；远程地址 → 包成 appstream 代理。
   *
   * 远端直链**不能直接给 <audio>**：跨源 http 流没有 CORS 头，
   * 进 EQ/频谱的 MediaElementSource 会被消成静音（进度条走但无声），
   * 必须走主进程的 appstream 代理（见 capability/audio/streamSrc.ts）。
   * 代理地址同样必须在 CSP 的 `media-src` 白名单里，否则会被静默拦掉。
   */
  private async resolveSrc(track: string): Promise<string | null> {
    const src = await this.resolveSrcQuiet(track);
    if (!src) this.hooks.onError?.("track-missing");
    return src;
  }

  /**
   * 取源但不报错：预取（P0-08）用它。
   * `grant` 是 IPC，桥没接好/主进程没注册时会 **reject**（不是返回 null）——
   * 这里吞掉并返回 null，否则预取会变成未捕获的 promise 异常。
   */
  private async resolveSrcQuiet(track: string): Promise<string | null> {
    if (/^https?:\/\//i.test(track)) return streamSrcOf(track);
    try {
      const token = await this.media.grant(track);
      return token ? this.media.urlOf(token) : null;
    } catch {
      return null;
    }
  }

  /**
   * 重试当前这首（P0-14）：只负责**重新取源并装进元素**，起播仍由调用方 dispatch 驱动。
   *
   * 不能只 `el.load()`：本地曲目的 url 是**带令牌**的（`resolveSrc` 每次重新 grant），
   * 令牌过期时原 src 已经不可用，必须整条重取。所以清掉 `currentSrc` 再走 `load()`，
   * 让 `willCrossfade` 判成 false（重试不进 crossfade，用户要的是"同一首马上放"）。
   * 取源失败时 `load()` 内部会再发 onError，由调用方的重试计数兜住。
   */
  async reload(): Promise<boolean> {
    const track = this.currentSrc;
    if (!track) return false;
    this.currentSrc = null;
    return this.load(track);
  }

  async play(): Promise<void> {
    if (!this.graph) {
      this.graph = createGraph(this.els[0], this.els[1]);
      // 建图前收到的配置在这里一次应用——不能丢，否则"先调 EQ 再点播放"会静默失效
      if (this.pendingPreamp !== null) applyPreamp(this.graph, this.pendingPreamp);
      if (this.pendingEq) applyEq(this.graph, this.pendingEq);
      if (this.pendingOutputId) void this.setOutputDevice(this.pendingOutputId);
    }
    this.cancelPendingPause(); // 淡出收尾还没落地就续播：撤掉，否则刚响就停
    await resumeGraph(this.graph);
    try {
      await this.el.play();
      if (this.fading) {
        // crossfade 中：待命曲一起恢复，增益曲线继续走完；不许碰增益
        void this.elB.play().catch(() => undefined);
      } else {
        this.fadeTo(this.el, 1, FADE_IN_SEC);
      }
    } catch (err) {
      // 用户没点过页面就 play() 会被拒；这不是错误，别把界面打成 error
      if ((err as DOMException).name !== "NotAllowedError") this.hooks.onError?.("unknown");
    }
  }

  /**
   * 把某一路增益硬置到目标值（取消所有排期）。斜坡出事时的兜底也用它。
   */
  private hardSetGain(el: HTMLAudioElement, value: number): void {
    const g = this.graph;
    const param = this.gainOf(el);
    if (!g || !param) return;
    param.cancelScheduledValues(g.ctx.currentTime);
    param.value = value;
  }

  /**
   * 增益斜坡（P0-07，抄 folia `playbackFade.ts`）。**必须配一个止损定时器**：
   * `linearRampToValueAtTime` 依赖 AudioContext 时间轴推进，刚从 suspended 恢复时
   * currentTime 不走，ramp 永远到不了终点 —— 表现正是"进度条在走、但完全没声音"。
   * 所以坡走完（或按理该走完）时硬置终值。
   * 止损定时器带**每参数代号**：快速"暂停→播放"时，旧的止损不能把新坡踩回去。
   */
  private fadeTo(el: HTMLAudioElement, to: number, sec: number): void {
    const g = this.graph;
    const param = this.gainOf(el);
    if (!g || !param) return;
    const seq = (this.fadeSeq.get(param) ?? 0) + 1;
    this.fadeSeq.set(param, seq);
    const t0 = g.ctx.currentTime;
    param.cancelScheduledValues(t0);
    param.setValueAtTime(Math.max(0.0001, param.value), t0);
    param.linearRampToValueAtTime(to, t0 + sec);
    setTimeout(() => {
      if (this.fadeSeq.get(param) !== seq) return;
      this.hardSetGain(el, to);
    }, sec * 1000 + 80);
  }

  /** 每参数一个代号，给止损定时器判"我还是最新的那个吗"。 */
  private readonly fadeSeq = new WeakMap<AudioParam, number>();

  /** 暂停的淡出收尾（见 pause）。 */
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  /** 取消还没执行的"淡出后暂停"：换曲/续播时要撤掉，否则会把新曲一起停掉。 */
  private cancelPendingPause(): void {
    if (!this.pauseTimer) return;
    clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }

  pause(): void {
    // 淡出 150ms 再真停（P0-07）：直接 pause 会有咔哒声。
    // 两路都停：crossfade 中暂停是合法操作，恢复时 play() 会把两路一起拉起
    this.cancelPendingPause();
    this.fadeTo(this.el, 0, PAUSE_FADE_SEC);
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null;
      this.el.pause();
      this.elB.pause();
      this.hardSetGain(this.el, 0); // 归位：下次 play 从 0 淡入
    }, PAUSE_FADE_SEC * 1000);
  }

  seek(positionMs: number): void {
    if (this.el.readyState < 1) return;
    this.el.currentTime = Math.max(0, positionMs) / 1000;
  }

  setVolume(volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    this.el.volume = v;
    this.elB.volume = v;
  }

  /** 静音（A-17）。走元素的 muted 而不是把 volume 置 0 —— 取消静音要能回到原音量。 */
  setMuted(muted: boolean): void {
    this.el.muted = muted;
    this.elB.muted = muted;
  }

  /**
   * 播放速度（倍速）。抄 lx-music-desktop 的 `src\renderer\plugins\player\index.ts`：
   * **defaultPlaybackRate 与 playbackRate 都要写** —— 前者让新 src 继承，切歌不丢倍速。
   * 两路元素都写（crossfade 的淡入那一路，否则切歌瞬间会变回 1x）。
   */
  setPlaybackRate(rate: number): void {
    const r = Math.min(2, Math.max(0.5, rate));
    for (const el of this.els) {
      el.defaultPlaybackRate = r;
      el.playbackRate = r;
    }
  }

  /**
   * 音调补偿：变速时保持音高。原生属性（抄 lx 的 setPreservesPitch），
   * 老内核没有这个属性时忽略（不报错）。
   */
  setPreservesPitch(on: boolean): void {
    for (const el of this.els) {
      const media = el as HTMLAudioElement & { preservesPitch?: boolean };
      if ("preservesPitch" in media) media.preservesPitch = on;
    }
  }

  /** 前置增益（dB）。图未建时暂存，建图后应用。 */
  setPreamp(db: number): void {
    this.pendingPreamp = db;
    if (this.graph) applyPreamp(this.graph, db);
  }

  /** 整组 6 段 EQ（dB）。图未建时暂存，建图后应用。 */
  setEq(gains: number[]): void {
    this.pendingEq = [...gains];
    if (this.graph) applyEq(this.graph, gains);
  }

  private spectrumBuf: Uint8Array<ArrayBuffer> | null = null;

  /** 频谱采样：聚合成 bins 个 0–1 的桶。图未建返回 null（UI 必须能纯几何降级，不画假波形）。 */
  spectrum(bins: number): number[] | null {
    const g = this.graph;
    if (!g) return null;
    const count = g.analyser.frequencyBinCount;
    if (!this.spectrumBuf || this.spectrumBuf.length !== count) {
      this.spectrumBuf = new Uint8Array(count);
    }
    g.analyser.getByteFrequencyData(this.spectrumBuf);
    return aggregateSpectrum(this.spectrumBuf, bins);
  }

  /** 当前媒体时长（毫秒），没加载时是 0。UI 的进度条上限用它——crossfade 中仍是出场曲的。 */
  durationMs(): number {
    const d = this.el.duration;
    return Number.isFinite(d) ? d * 1000 : 0;
  }

  /** 采样率：EQ 曲线可视化要与真实滤波器一致就得用 ctx 的（M9-4）。图未建给常见默认。 */
  sampleRate(): number {
    return this.graph ? this.graph.ctx.sampleRate : 48000;
  }

  currentTrack(): string | null {
    return this.currentSrc;
  }
}
