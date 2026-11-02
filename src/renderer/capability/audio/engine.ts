import type { ErrorCode } from "../../../contracts/index.js";
import type { MediaPort } from "../../../contracts/ports.js";
import { clock } from "../../kernel/clock.js";
import { createGraph, resumeGraph, setEq as applyEq, setPreamp as applyPreamp, type AudioGraph } from "./graph.js";

export interface EngineHooks {
  onReady?: () => void;
  onEnded?: () => void;
  onError?: (code: ErrorCode) => void;
}

/**
 * 音频执行器：把 store 的意图落到 <audio> 上。
 *
 * 它也是**唯一读 audio.currentTime 的地方**（通过 clock.attach 注入），
 * clock 在环 0 不碰 DOM，这里替它碰。
 */
export class AudioEngine {
  private readonly el: HTMLAudioElement;
  private readonly media: MediaPort;
  private graph: AudioGraph | null = null;
  private hooks: EngineHooks = {};
  private currentSrc: string | null = null;
  /** 图还没建（还没播过第一首）时暂存的音频配置，建图后立即应用。 */
  private pendingPreamp: number | null = null;
  private pendingEq: number[] | null = null;

  constructor(media: MediaPort) {
    this.media = media;
    this.el = new Audio();
    this.el.preload = "auto";

    clock.attach(() => (this.el.readyState >= 1 ? this.el.currentTime * 1000 : null));

    this.el.addEventListener("loadedmetadata", () => this.hooks.onReady?.());
    this.el.addEventListener("ended", () => this.hooks.onEnded?.());
    this.el.addEventListener("error", () => this.hooks.onError?.(this.mapError()));
  }

  on(hooks: EngineHooks): void {
    this.hooks = hooks;
  }

  private mapError(): ErrorCode {
    const code = this.el.error?.code;
    if (code === MediaError.MEDIA_ERR_NETWORK) return "network";
    if (code === MediaError.MEDIA_ERR_DECODE) return "decode-failed";
    if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return "track-missing";
    return "unknown";
  }

  /**
   * 换曲：把路径换成令牌，再交给 <audio>。返回是否真的换了。
   *
   * 切歌必须是「先淡出、换 src、再淡入」：直接换 src 是波形硬切，会咔哒一声。
   * 8ms 淡出 + 10ms 换源 + play 时 20ms 淡入，加起来约 38ms，耳朵几乎无感，
   * 但足以把不连续的跳变压掉。
   */
  async load(track: string): Promise<boolean> {
    if (this.currentSrc === track) return false;

    const src = await this.resolveSrc(track);
    if (!src) return false;

    // 切歌前把增益压到很低（不压到 0，避免淡入逻辑出问题时变成静音）
    if (this.graph) {
      const gain = this.graph.fade.gain;
      gain.cancelScheduledValues(this.graph.ctx.currentTime);
      gain.value = 0.2;
    }

    this.currentSrc = track;
    this.el.src = src;
    this.el.load();
    return true;
  }

  /**
   * 本地路径 → 换令牌；远程地址 → 直接用。
   *
   * **http 也要放行**：网易云 CDN 给的直链就是 `http://m7.music.126.net/...`，
   * 只认 https 会让它掉进"换令牌"分支、扩展名校验不过、最后报 track-missing。
   * 远程地址同样必须已在 CSP 的 `media-src` 白名单里，否则会被静默拦掉。
   */
  private async resolveSrc(track: string): Promise<string | null> {
    if (/^https?:\/\//i.test(track)) return track;

    const token = await this.media.grant(track);
    if (!token) {
      this.hooks.onError?.("track-missing");
      return null;
    }
    return this.media.urlOf(token);
  }

  async play(): Promise<void> {
    if (!this.graph) {
      this.graph = createGraph(this.el);
      // 建图前收到的配置在这里一次应用——不能丢，否则"先调 EQ 再点播放"会静默失效
      if (this.pendingPreamp !== null) applyPreamp(this.graph, this.pendingPreamp);
      if (this.pendingEq) applyEq(this.graph, this.pendingEq);
    }
    await resumeGraph(this.graph);
    try {
      await this.el.play();
      this.fadeIn();
    } catch (err) {
      // 用户没点过页面就 play() 会被拒；这不是错误，别把界面打成 error
      if ((err as DOMException).name !== "NotAllowedError") this.hooks.onError?.("unknown");
    }
  }

  /**
   * 把增益恢复到 1。
   *
   * **这里不能再用 ramp**。`linearRampToValueAtTime` 依赖 AudioContext 的时间轴推进，
   * 而刚从 suspended 恢复时 currentTime 不往前走，ramp 永远到不了终点，
   * 增益就卡在 0——表现正是"进度条在走、但完全没声音"。
   *
   * 短 ramp 防的那点咔哒声，远不值得冒"整个播放器静音"的风险。
   */
  private fadeIn(): void {
    if (!this.graph) return;
    const gain = this.graph.fade.gain;
    gain.cancelScheduledValues(this.graph.ctx.currentTime);
    gain.value = 1;
  }

  pause(): void {
    this.el.pause();
  }

  seek(positionMs: number): void {
    if (this.el.readyState < 1) return;
    this.el.currentTime = Math.max(0, positionMs) / 1000;
  }

  setVolume(volume: number): void {
    this.el.volume = Math.min(1, Math.max(0, volume));
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

  /** 当前媒体时长（毫秒），没加载时是 0。UI 的进度条上限用它。 */
  durationMs(): number {
    const d = this.el.duration;
    return Number.isFinite(d) ? d * 1000 : 0;
  }

  currentTrack(): string | null {
    return this.currentSrc;
  }
}
