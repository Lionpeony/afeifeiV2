/**
 * 上游失败退避（P0 #2）：同一个接口连续失败时短暂熔断，避免 UI 的自动重试把
 * 风控/断网放大成请求风暴。纯逻辑，可在 node --test 里注入时间。
 *
 * 策略：前两次失败照常放行（瞬时抖动不该熔断）；从第三次起按阶梯冷却，
 * 成功一次即清零。只管「连续失败」，不判断错误类型——分类在 capability/errors。
 */

const DEFAULT_STEPS = [2_000, 5_000, 10_000, 30_000, 60_000];
const DEFAULT_THRESHOLD = 3;

interface Entry {
  failures: number;
  until: number;
}

export interface FailureBackoffOptions {
  /** 连续失败多少次开始熔断 */
  threshold?: number;
  /** 依次使用的冷却时长（毫秒），最后一次重复使用 */
  steps?: number[];
}

export class FailureBackoff {
  private readonly states = new Map<string, Entry>();
  private readonly threshold: number;
  private readonly steps: number[];

  constructor(opts: FailureBackoffOptions = {}) {
    this.threshold = Math.max(1, opts.threshold ?? DEFAULT_THRESHOLD);
    this.steps = opts.steps && opts.steps.length > 0 ? [...opts.steps] : DEFAULT_STEPS;
  }

  /** 0 = 放行；>0 = 还要等待的毫秒数。 */
  waitMs(key: string, now = Date.now()): number {
    const entry = this.states.get(key);
    if (!entry || entry.until <= now) return 0;
    return entry.until - now;
  }

  /** 记一次失败；达到阈值后开始冷却。 */
  fail(key: string, now = Date.now()): void {
    const entry = this.states.get(key) ?? { failures: 0, until: 0 };
    entry.failures += 1;
    if (entry.failures >= this.threshold) {
      const index = Math.min(entry.failures - this.threshold, this.steps.length - 1);
      entry.until = now + this.steps[index];
    }
    this.states.set(key, entry);
  }

  /** 成功一次即清零。 */
  ok(key: string): void {
    this.states.delete(key);
  }

  /** 测试/音源切换用。 */
  reset(): void {
    this.states.clear();
  }
}
