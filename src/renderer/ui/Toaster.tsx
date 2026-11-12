import { useEffect, useRef, useState } from "react";
import { subscribeToast, type ToastItem } from "./toast.js";

/** 语气 → 停留时长：成功一眼就够，失败要给足读完 + 判断的时间。 */
const DWELL: Record<ToastItem["kind"], number> = { ok: 2000, info: 2600, bad: 4200 };
/** 退场时长：与 app.css 的 toast-out 对齐，退场播完才摘节点。 */
const EXIT_MS = 180;

/**
 * 底部居中的胶囊提示（2026-11-12 重做）：
 * 原来是小票样式钉在左下、只有文字——收藏成功、播放失败这类反馈全塞进顶部
 * 常驻 notice，结果是"一直在，不会消失"。现在：底栏正上方居中，一档一条，
 * 带语气图标，到时自清，点一下就关。
 *
 * 固定居中而不是贴左：底栏左侧是曲目信息，小票压在那儿会挡住封面。
 */
export function Toaster() {
  const [item, setItem] = useState<ToastItem | null>(null);
  const [leaving, setLeaving] = useState(false);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimers = (): void => {
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
    const off = subscribeToast((next) => {
      // 连点时先掐掉上一轮的计时器，否则旧消息的退场会把新消息摘掉
      clearTimers();
      setLeaving(false);
      setItem(next);
      dwellTimer.current = setTimeout(() => {
        setLeaving(true);
        exitTimer.current = setTimeout(() => setItem(null), EXIT_MS);
      }, DWELL[next.kind]);
    });
    return () => {
      off();
      clearTimers();
    };
  }, []);

  if (item === null) return null;

  const dismiss = (): void => {
    if (leaving) return;
    if (dwellTimer.current) clearTimeout(dwellTimer.current);
    setLeaving(true);
    exitTimer.current = setTimeout(() => setItem(null), EXIT_MS);
  };

  return (
    <aside
      key={item.id}
      className={`toast toast-${item.kind}${leaving ? " toast-out" : ""}`}
      role="status"
      onClick={dismiss}
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
  );
}
