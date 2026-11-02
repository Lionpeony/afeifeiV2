import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

/**
 * 桌面歌词窗（M9-1）：只读投影 + 两个意图（锁定 / 关窗）。这里**没有任何歌词状态**——
 * 行文本由主窗歌词桥用同一份 `minimalState` 判定后推过来（与播放页同轴），
 * 本窗只渲染。中键 = 锁定（切穿透）；解锁从主窗「桌面歌词」按钮回去。
 * 字号存本窗 localStorage（app:// 域，键名带 lyric- 前缀避免与迷你窗撞）。
 */
interface LyricState {
  text: string;
  mode: "interactive" | "pass";
}

const FONT_KEY = "lyric-font";
const clampFont = (n: number): number => Math.min(64, Math.max(20, n));

declare global {
  interface Window {
    lyricApi: {
      onState(cb: (json: string) => void): void;
      action(a: string): void;
      close(): void;
    };
  }
}

function Lyric() {
  const [st, setSt] = useState<LyricState>({ text: "", mode: "interactive" });
  const [font, setFont] = useState(() => clampFont(Number(localStorage.getItem(FONT_KEY)) || 36));

  useEffect(() => {
    window.lyricApi.onState((json) => {
      try {
        setSt(JSON.parse(json) as LyricState);
      } catch {
        /* 坏包直接丢，下一行会再来 */
      }
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(FONT_KEY, String(font));
  }, [font]);

  return (
    <div
      className="lyric"
      onMouseDown={(e) => {
        if (e.button === 1) window.lyricApi.action("lock"); // 中键锁定
      }}
    >
      {st.text ? (
        <p className="lyric-line" style={{ fontSize: font }}>
          {st.text}
        </p>
      ) : null}
      {st.mode === "interactive" ? (
        <div className="lyric-tools">
          <button type="button" onClick={() => setFont((f) => clampFont(f - 4))} title="字号缩小">
            A-
          </button>
          <button type="button" onClick={() => setFont((f) => clampFont(f + 4))} title="字号放大">
            A+
          </button>
          <button type="button" onClick={() => window.lyricApi.action("lock")} title="锁定（穿透鼠标，主窗按钮解锁）">
            锁定
          </button>
          <button type="button" onClick={() => window.lyricApi.close()} title="关闭桌面歌词">
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<Lyric />);
