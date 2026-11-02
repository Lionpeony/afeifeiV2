/**
 * 极简 semver 比较（M8）：只认 `主.次.补丁` 数字段。
 * 带 prerelease / 非数字段的一律当"不比当前新"——发版纪律里不出现这种 tag。
 * 纯函数，可进 dist-test 穷举。
 */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string): number[] | null => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
