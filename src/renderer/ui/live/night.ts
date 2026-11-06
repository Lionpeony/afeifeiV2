/**
 * 首页的「第 N 夜 / 刊号」：只从日期派生，不读时钟、不编造创站日。
 * 用本地年月日构造 UTC 毫秒差，避免时区把午夜算到前一天。
 */
export function nightOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 1);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today - start) / 86_400_000) + 1;
}

/** 刊号：MMDD，例如 11 月 6 日 → NO.1106 */
export function issueOf(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `NO.${mm}${dd}`;
}
