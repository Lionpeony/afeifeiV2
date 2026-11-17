import { useEffect, useRef, useState } from "react";
import { subscribeToast, type ToastItem } from "./toast.js";

/** 语气 → 停留时长：成功一眼就够，失败要给足读完 + 判断的时间。 */
const DWELL: Record<ToastItem["kind"], number> = { ok: 2000, info: 2600, bad: 4200 };
/** 同屏最多几条：再多就盖住底栏，原型也是三条封顶。 */
const MAX = 3;

/**
 * 底部居中的 toast 队列（v4.2 原型 .toasts）：
 * 多条反馈垂直堆叠，各自到时消失；同一条文案连点两次按 id 分开。
 * 容器 pointer-events: none，单条可点掉——不挡底栏 hover。
 */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const clearAll = (): void => {
      for (const t of timers.current.values()) clearTimeout(t);
      timers.current.clear();
    };
    const off = subscribeToast((next) => {
      const old = timers.current.get(next.id);
      if (old) clearTimeout(old);
      setItems((prev) => [...prev.filter((x) => x.id !== next.id), next].slice(-MAX));
      timers.current.set(
        next.id,
        setTimeout(() => {
          timers.current.delete(next.id);
          setItems((prev) => prev.filter((x) => x.id !== next.id));
        }, DWELL[next.kind]),
      );
    });
    return () => {
      off();
      clearAll();
    };
  }, []);

  if (items.length === 0) return null;

  const dismiss = (id: number): void => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <div className="toasts" aria-live="polite">
      {items.map((item) => (
        <aside
          key={item.id}
          className={`toast toast-${item.kind}`}
          role="status"
          onClick={() => dismiss(item.id)}
          title="点击关闭"
        >
          <span className="toast-ic" aria-hidden="true">
            {item.kind === "ok" ? (
              <svg viewBox="0 0 16 16" focusable="false">
                <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path
                  d="M5 8.2l2 2 4-4.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : item.kind === "bad" ? (
              <svg viewBox="0 0 16 16" focusable="false">
                <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 4.6v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="8" cy="11.4" r="0.9" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" focusable="false">
                <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 7.2v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="8" cy="4.7" r="0.9" fill="currentColor" />
              </svg>
            )}
          </span>
          <p>{item.text}</p>
        </aside>
      ))}
    </div>
  );
}
