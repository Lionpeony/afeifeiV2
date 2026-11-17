/* 播放进度轮询：只在播放页/迷你卡/歌词条挂载时以 4Hz 读一次，
   避免把 60fps 的进度塞进 App 全局 state。 */
import { useEffect, useRef, useState } from "react";

import type { AfApi } from "./context.js";

export function usePosition(api: AfApi, active = true): { pos: number; dur: number } {
  const apiRef = useRef(api);
  apiRef.current = api;
  const [state, setState] = useState(() => ({
    pos: api.positionMs() / 1000,
    dur: api.durationMs() / 1000,
  }));
  useEffect(() => {
    if (!active) return;
    const tick = (): void => {
      const a = apiRef.current;
      setState({ pos: a.positionMs() / 1000, dur: a.durationMs() / 1000 });
    };
    tick();
    let timer = window.setTimeout(function loop() {
      tick();
      timer = window.setTimeout(loop, 250);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [active]);
  return state;
}
