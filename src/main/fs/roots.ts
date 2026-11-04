/**
 * 曲库目录列表的规则（M9）。只有去重与移除两条，都是纯函数。
 *
 * Windows 路径大小写不敏感：`D:\Music` 与 `d:\music` 是同一个目录，
 * 用 `includes` 判重会让用户同一个目录加两次，扫描时白跑一遍。
 */

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** 加入一个目录；重复（忽略大小写与首尾空格）或空串原样返回。 */
export function mergeRoot(roots: string[], dir: string): string[] {
  const next = dir.trim();
  if (!next || roots.some((p) => same(p, next))) return roots;
  return [...roots, next];
}

/** 移除一个目录；不在列表里原样返回。 */
export function dropRoot(roots: string[], dir: string): string[] {
  return roots.filter((p) => !same(p, dir));
}
