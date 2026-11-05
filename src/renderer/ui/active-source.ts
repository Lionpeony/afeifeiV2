/**
 * 当前音源（全局单值，docs/03 2026-11-05 账号模型）。
 *
 * 一个播放器同时只认一个账号：账号级数据（每日推荐 / 红心 / 播放记录 / 漫游）
 * 全部读这里选中的源，不做「谁先登录就用谁」的回退。切源即切账号。
 *
 * 这是 UI 导航状态（同 library-focus），不是曲库事实，放 ui/ 不放 domain/。
 * 纯模块、可单测；持久化由 bootstrap 负责。
 */

let active = "";
const listeners = new Set<() => void>();

export const getActiveSource = (): string => active;

export function setActiveSource(id: string): void {
  if (id === active) return;
  active = id;
  for (const fn of listeners) fn();
}

export function subscribeActiveSource(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 启动恢复：只在为空时设初值，绝不覆盖用户已经选过的源。 */
export function initActiveSource(id: string): void {
  if (!active && id) setActiveSource(id);
}
