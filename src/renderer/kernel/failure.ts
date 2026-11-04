import type { ErrorCode } from "../../contracts/index.js";

/**
 * 播放失败自愈（P0-14，抄 SPlayer `PlayerController.handlePlaybackError` 的策略）。
 *
 * 为什么独立成纯函数：**跳过/重试/停机的边界是最容易写成"能跑就行"的一段**，
 * 而它一旦出错，表现是"队列停死"或"无限跳歌刷屏"——两种都极难在界面上复现。
 * 所以这里不碰 audio、不碰 store、不碰定时器，只回答一个问题：
 * **这一次失败，接下来该干什么。**
 * 调度（定时器、重新 load、dispatch）全部留给调用方 `ui/bootstrap.ts`。
 */

/** 首次失败后最多再重试的次数：共 3 次尝试（与 SPlayer 的 ABSOLUTE_MAX_RETRY 一致）。 */
export const MAX_RETRY = 2;

/** 连续跳过多少首仍失败就停机。防止"半个曲库都坏了"时把列表刷到底。 */
export const MAX_SKIP_STREAK = 3;

/** 跳过前的等待：立刻连跳会让引擎来不及释放上一条流，也会让用户看不清提示。 */
export const SKIP_DELAY_MS = 500;

/** 失败之后能做什么。 */
export type FailureKind = "ignore" | "retry" | "skip";

/** 可重试的码：链接过期、握手失败、上游抽风——刷新一次通常就好了。 */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "network",
  "auth-required",
  "auth-expired",
  "quality-unavailable",
  "unknown",
]);

/**
 * 错误分类。
 * **不认识的码一律 "skip"**（不是 retry）：重试一个明确修不好的错误只会拖慢跳歌，
 * 而 skip 至少还能往下走。注意 `unknown` 在可重试集合里——它是兜底码，多半是上游临时错误。
 */
export function classifyFailure(code: ErrorCode): FailureKind {
  if (code === "aborted") return "ignore";
  return RETRYABLE.has(code) ? "retry" : "skip";
}

export interface FailureInput {
  code: ErrorCode;
  /** 当前这首已经重试过的次数（换歌时由调用方清零）。 */
  retryCount: number;
  /** 已经连续跳过多少首（成功播放 500ms 后由调用方清零）。 */
  skipStreak: number;
  /** 队列里还有没有下一首。 */
  hasNext: boolean;
  /** 用户设置：失败时自动跳过（true）还是停下等用户（false）。 */
  autoSkip: boolean;
}

export type FailureDecision =
  | { action: "ignore" }
  | { action: "retry"; retryCount: number }
  | { action: "skip"; skipStreak: number; delayMs: number }
  | { action: "stop"; reason: "manual" | "no-next" | "exhausted" };

/**
 * 决策顺序（**顺序本身是语义，别调换**）：
 *   ① aborted → 什么都不做（用户自己切的，不是失败）
 *   ② 可重试且还有次数 → 重试
 *   ③ 用户关了自动跳过 → 停下等用户
 *   ④ 没有下一首 → 停（文案说"没有下一首"，不能说"失败太多"）
 *   ⑤ 再跳一次就够 3 首 → 停（熔断在读之前判断，所以只跳 2 次）
 *   ⑥ 否则跳
 */
export function decideFailure(input: FailureInput): FailureDecision {
  const kind = classifyFailure(input.code);
  if (kind === "ignore") return { action: "ignore" };

  if (kind === "retry" && input.retryCount < MAX_RETRY) {
    return { action: "retry", retryCount: input.retryCount + 1 };
  }

  if (!input.autoSkip) return { action: "stop", reason: "manual" };
  if (!input.hasNext) return { action: "stop", reason: "no-next" };
  if (input.skipStreak + 1 >= MAX_SKIP_STREAK) return { action: "stop", reason: "exhausted" };

  return { action: "skip", skipStreak: input.skipStreak + 1, delayMs: SKIP_DELAY_MS };
}
