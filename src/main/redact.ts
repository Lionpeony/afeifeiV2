/**
 * 日志/诊断文本遮罩（P0 #4）。独立成文件是为了能在 node --test 里直接测，
 * 不把 electron 依赖带进测试产物。
 */

const SECRET_PAIR =
  /((?:qqmusic_session|MUSIC_U|MUSIC_A|NMTID|__csrf|token|password|passwd|secret|authorization)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s;,"'\]}]+)/gi;
const COOKIE_PAIR = /((?:cookie|set-cookie)\s*[=:]\s*)[^\n"']+/gi;
const AUTH_PAIR = /((?:authorization)\s*[=:]\s*)[^\n"']+/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const PHONE = /(?<!\d)(1[3-9]\d)\d{4}(\d{4})(?!\d)/g;

/** 凭据形态与手机号遮罩；其余文本原样保留（诊断需要堆栈和错误码）。 */
export function redact(text: string): string {
  return text
    .replace(SECRET_PAIR, "$1***")
    .replace(COOKIE_PAIR, "$1***")
    .replace(AUTH_PAIR, "$1***")
    .replace(BEARER, "Bearer ***")
    .replace(PHONE, "$1****$2");
}
