import type { ErrorCode } from "../../contracts/index.js";

/**
 * 错误只翻译一次（50 §10）：上游抛什么都在这里收敛成十二个码，
 * UI 只认码，不认平台，也不许自己拼字符串。
 */

export interface CodeInfo {
  /** 给用户看的一句话 */
  text: string;
  /** 界面上要不要给"重试" */
  retryable: boolean;
}

export const ERROR_INFO: Record<ErrorCode, CodeInfo> = {
  "source-mismatch": { text: "这首歌的来源不明确", retryable: false },
  "capability-missing": { text: "当前音源不支持这个操作", retryable: false },
  "contract-version": { text: "该插件需要更新", retryable: false },
  "auth-required": { text: "请先登录", retryable: true },
  "auth-expired": { text: "登录已过期", retryable: true },
  "quality-unavailable": { text: "该音质不可用，已自动降级", retryable: true },
  "track-missing": { text: "这首歌找不到了", retryable: false },
  network: { text: "网络有点慢", retryable: true },
  "decode-failed": { text: "这首歌的文件可能损坏了", retryable: false },
  aborted: { text: "已取消", retryable: false },
  "disk-full": { text: "磁盘空间不足", retryable: false },
  unknown: { text: "出了点问题", retryable: true },
};

/** 上游常见错误的长相，用来做通用翻译（平台专属映射由各音源自己补）。 */
const MESSAGE_RULES: { match: RegExp; code: ErrorCode }[] = [
  { match: /\b(401|403)\b|unauthor|forbidden|token.*(invalid|expired)/i, code: "auth-expired" },
  { match: /\b404\b|not\s*found|不存在|已下架/i, code: "track-missing" },
  { match: /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|network|fetch failed/i, code: "network" },
  { match: /abort|cancel/i, code: "aborted" },
  { match: /ENOSPC|disk full/i, code: "disk-full" },
  { match: /decode|解码|损坏/i, code: "decode-failed" },
];

/**
 * 把任意上游错误收敛成一个码。
 * **不认识就 unknown，不要往上报原始信息** —— 用户看不懂，也不该看到。
 */
export function translateError(raw: unknown): ErrorCode {
  if (!raw) return "unknown";

  // 已经是十二码之一就直接用（自家抛的错）
  if (typeof raw === "string" && raw in ERROR_INFO) return raw as ErrorCode;

  const maybe = raw as { code?: unknown; message?: unknown; status?: unknown };
  if (typeof maybe.code === "string" && maybe.code in ERROR_INFO) return maybe.code as ErrorCode;

  const status = Number(maybe.status);
  if (status === 401 || status === 403) return "auth-expired";
  if (status === 404) return "track-missing";
  if (status >= 500) return "network";

  const text = typeof maybe.message === "string" ? maybe.message : String(raw);
  for (const rule of MESSAGE_RULES) {
    if (rule.match.test(text)) return rule.code;
  }
  return "unknown";
}

export function errorText(code: ErrorCode): string {
  return ERROR_INFO[code]?.text ?? ERROR_INFO.unknown.text;
}

export function isRetryable(code: ErrorCode): boolean {
  return ERROR_INFO[code]?.retryable ?? true;
}
