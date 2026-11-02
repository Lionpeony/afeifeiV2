import { useEffect, useRef, useState } from "react";
import { subscribeToast } from "./toast.js";

/**
 * 纸面小票 toast（docs/09 B2，旧仓 press.css #toast 还原）：
 * 左 3px 朱砂标尺 + mono 顶部小标 + 正文，2.5s 自清。
 * 固定左下，不挡播放条；同一时间只显示最后一条。
 */
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      subscribeToast((m) => {
        setMsg(m);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setMsg(null), 2500);
      }),
    [],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (msg === null) return null;
  return (
    <aside className="toast" role="status">
      <span className="toast-tag">NOTICE</span>
      <p>{msg}</p>
    </aside>
  );
}
