import type { ErrorCode } from "../../../contracts/index.js";
import type { MediaPort } from "../../../contracts/ports.js";
import { clock } from "../../kernel/clock.js";
import { createGraph, resumeGraph, setEq as applyEq, setPreamp as applyPreamp, type AudioGraph } from "./graph.js";
import { fadeCurves } from "./crossfade.js";
import { streamSrcOf } from "./streamSrc.js";

export interface EngineHooks {
  onReady?: () => void;
  onEnded?: () => void;
  onError?: (code: ErrorCode) => void;
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

  /** 接近结尾（剩余 ≤ crossfadeSec）→ 通知调用方切下一首。 */
  private detectNearEnd(): void {
    if (this.crossfadeSec <= 0 || this.fading || this.nearEndFired || this.el.paused) return;
    const d = this.el.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    if (d - this.el.currentTime > this.crossfadeSec) return;
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
    this.el.src = src;
    this.el.load();
    return true;
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
    const outgoing = this.el;
    outgoing.pause();
    this.els.reverse();
    this.el = this.els[0];
    this.elB = this.els[1];
    const g = this.graph;
    if (g) {
      // reverse 后 this.el === els[0]：fadeA 永远绑主位（值 1），fadeB 绑待命位（0）
      g.fadeA.gain.cancelScheduledValues(g.ctx.currentTime);
      g.fadeB.gain.cancelScheduledValues(g.ctx.currentTime);
      g.fadeA.gain.value = 1;
      g.fadeB.gain.value = 0;
    }
    this.nearEndFired = false;
    this.hooks.onSwitched?.();
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
    if (/^https?:\/\//i.test(track)) return streamSrcOf(track);

    const token = await this.media.grant(track);
    if (!token) {
      this.hooks.onError?.("track-missing");
      return null;
    }
    return this.media.urlOf(token);
  }

  async play(): Promise<void> {
    if (!this.graph) {
      this.graph = createGraph(this.els[0], this.els[1]);
      // 建图前收到的配置在这里一次应用——不能丢，否则"先调 EQ 再点播放"会静默失效
      if (this.pendingPreamp !== null) applyPreamp(this.graph, this.pendingPreamp);
      if (this.pendingEq) applyEq(this.graph, this.pendingEq);
    }
    await resumeGraph(this.graph);
    try {
      await this.el.play();
      if (this.fading) {
        // crossfade 中：待命曲一起恢复，增益曲线继续走完；不许碰增益
        void this.elB.play().catch(() => undefined);
      } else {
        this.fadeIn();
      }
    } catch (err) {
      // 用户没点过页面就 play() 会被拒；这不是错误，别把界面打成 error
      if ((err as DOMException).name !== "NotAllowedError") this.hooks.onError?.("unknown");
    }
  }

  /**
   * 把主路增益恢复到 1。
   *
   * **这里不能再用 ramp**。`linearRampToValueAtTime` 依赖 AudioContext 的时间轴推进，
   * 而刚从 suspended 恢复时 currentTime 不往前走，ramp 永远到不了终点，
   * 增益就卡在 0——表现正是"进度条在走、但完全没声音"。
   *
   * 短 ramp 防的那点咔哒声，远不值得冒"整个播放器静音"的风险。
   */
  private fadeIn(): void {
    const gain = this.gainOf(this.el);
    if (!gain || !this.graph) return;
    gain.cancelScheduledValues(this.graph.ctx.currentTime);
    gain.value = 1;
  }

  pause(): void {
    // 两路都停：crossfade 中暂停是合法操作，恢复时 play() 会把两路一起拉起
    this.el.pause();
    this.elB.pause();
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
    const step = Math.max(1, Math.floor(count / bins));
    const out: number[] = [];
    for (let i = 0; i < bins; i += 1) {
      let sum = 0;
      for (let j = 0; j < step; j += 1) sum += this.spectrumBuf[i * step + j] ?? 0;
      out.push(sum / step / 255);
    }
    return out;
  }

  /** 当前媒体时长（毫秒），没加载时是 0。UI 的进度条上限用它——crossfade 中仍是出场曲的。 */
  durationMs(): number {
    const d = this.el.duration;
    return Number.isFinite(d) ? d * 1000 : 0;
  }

  currentTrack(): string | null {
    return this.currentSrc;
  }
}
