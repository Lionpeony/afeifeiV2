/* AFEIFEI 界面偏好（彩蛋 / 色板 / 副歌点 / 播放次数 / 音效 / 密度）
   与原型一致走 localStorage：同步、无需 IPC，重启后仍在。
   注意：这里只存「界面层」偏好，不碰 kernel/domain 的 KV 键。 */
import { useEffect, useState } from "react";

const PREFIX = "afeifei.v42.";

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function savePref<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 隐私模式/配额满：界面偏好丢了不影响播放 */
  }
}

export function usePref<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => loadPref(key, fallback));
  useEffect(() => {
    savePref(key, value);
  }, [key, value]);
  return [value, setValue];
}

/** 系统 reduced-motion；变化时重算。 */
export function useSystemReduce(): boolean {
  const [reduce, setReduce] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduce;
}

/** 页面不可见时暂停循环动画：写 <html data-hidden>。 */
export function useVisibilityHidden(): void {
  useEffect(() => {
    const fn = () => {
      document.documentElement.dataset.hidden = document.hidden ? "1" : "0";
    };
    fn();
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, []);
}
