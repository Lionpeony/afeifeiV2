import type { ErrorCode } from "../../../contracts/index.js";
import type { MediaPort } from "../../../contracts/ports.js";
import { clock } from "../../kernel/clock.js";
import { createGraph, resumeGraph, type AudioGraph } from "./graph.js";

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

  /** 换曲：把路径换成令牌，再交给 <audio>。返回是否真的换了。 */
  async load(track: string): Promise<boolean> {
    if (this.currentSrc === track) return false;

    const token = await this.media.grant(track);
    if (!token) {
      this.hooks.onError?.("track-missing");
      return false;
    }

    this.currentSrc = track;
    this.el.src = this.media.urlOf(token);
    this.el.load();
    return true;
  }

  async play(): Promise<void> {
    if (!this.graph) this.graph = createGraph(this.el);
    await resumeGraph(this.graph);
    try {
      await this.el.play();
    } catch (err) {
      // 用户没点过页面就 play() 会被拒；这不是错误，别把界面打成 error
      if ((err as DOMException).name !== "NotAllowedError") this.hooks.onError?.("unknown");
    }
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

  /** 当前媒体时长（毫秒），没加载时是 0。UI 的进度条上限用它。 */
  durationMs(): number {
    const d = this.el.duration;
    return Number.isFinite(d) ? d * 1000 : 0;
  }

  currentTrack(): string | null {
    return this.currentSrc;
  }
}
