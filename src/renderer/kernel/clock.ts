/**
 * 单一时间源（I1）。
 *
 * 关键设计：**clock 自己不碰 DOM**。它在环 0，而环 0 不许碰 DOM（50 §2）。
 * 真实播放位置由 `capability/audio` 用 `attach(() => audio.currentTime * 1000)` 注入进来。
 *
 * 于是"谁读 audio.currentTime"有了唯一答案：只有 capability/audio 一处，
 * 且它读到的值只能经由这个时钟流出去。
 */

/** 返回真实播放位置（毫秒）；还没加载时返回 null。 */
export type ClockSource = () => number | null;

/** 默认漂移阈值。18ms 是帧预算，50ms 是人能察觉歌词错位的下限。 */
export const DRIFT_THRESHOLD_MS = 50;

/** 线性插值：从上次锚点到现在的推算位置。 */
export function interpolate(anchorPositionMs: number, anchorWallMs: number, nowMs: number): number {
  return anchorPositionMs + Math.max(0, nowMs - anchorWallMs);
}

/** 推算值与真实值的偏差（取绝对值）。 */
export function driftMs(interpolated: number, actual: number): number {
  return Math.abs(interpolated - actual);
}

/** 偏差超过阈值就要重锚（不平滑，直接吸附 —— 声音是权威）。 */
export function shouldResync(interpolated: number, actual: number, threshold = DRIFT_THRESHOLD_MS): boolean {
  return driftMs(interpolated, actual) > threshold;
}

export class Clock {
  private anchorPosition = 0;
  private anchorWall = 0;
  private running = false;
  private attached = false;
  private source: ClockSource = () => null;
  private resyncCount = 0;

  attach(source: ClockSource): void {
    this.source = source;
    this.attached = true;
  }

  detach(): void {
    this.source = () => null;
    this.attached = false;
    this.running = false;
    this.anchorPosition = 0;
    this.anchorWall = 0;
  }

  /** 开始走表（播放开始时调用）。 */
  start(positionMs: number, now: number): void {
    this.anchorPosition = positionMs;
    this.anchorWall = now;
    this.running = true;
  }

  /** 停表。停的位置就是此刻的推算值。 */
  stop(now: number): void {
    if (!this.running) return;
    this.anchorPosition = this.t(now);
    this.anchorWall = now;
    this.running = false;
  }

  /** 跳转（拖动进度条 / 切歌）。 */
  seek(positionMs: number, now: number): void {
    this.anchorPosition = Math.max(0, positionMs);
    this.anchorWall = now;
    if (!this.running) this.running = false;
  }

  /**
   * 当前播放位置（毫秒）。
   * 每次取值都拿真实值校验一次，偏差大了就吸附 —— 这样长时间播放不会累积漂移。
   */
  t(now: number): number {
    const interpolated = this.running ? interpolate(this.anchorPosition, this.anchorWall, now) : this.anchorPosition;
    if (!this.attached || !this.running) return interpolated;

    const actual = this.source();
    if (actual === null || !Number.isFinite(actual)) return interpolated;

    if (shouldResync(interpolated, actual)) {
      this.resyncCount += 1;
      this.anchorPosition = actual;
      this.anchorWall = now;
      return actual;
    }
    return interpolated;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** 重锚次数。测试和诊断用；正常播放时它应该很小。 */
  resyncs(): number {
    return this.resyncCount;
  }
}

/** 全应用唯一的时钟实例。 */
export const clock = new Clock();
