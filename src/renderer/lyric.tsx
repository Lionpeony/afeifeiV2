import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

/**
 * 桌面歌词窗（M9-1 / P0-21）：只读投影 + 两个意图（锁定 / 关窗）。这里**没有任何歌词状态**——
 * 行文本、逐字字数、整曲进度都由主窗歌词桥按同一份 doc 算好后推过来，
 * 本窗只渲染。中键 = 锁定（切穿透）；解锁从主窗「桌面歌词」按钮回去。
 * 字号存本窗 localStorage（app:// 域，键名带 lyric- 前缀避免与迷你窗撞）。
 * 窗口位置与穿透态由主进程持久化（`main/lyricWindow.ts`），本窗不管。
 */
interface LyricState {
  text: string;
  /** 译文，没有就空串（不占一行） */
  translation?: string;
  /** 已唱字数：`text` 的前缀点亮，剩下的压暗 */
  lit?: number;
  /** 整曲进度 0..1，底部细线 */
  song?: number;
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

  // 逐字与进度都来自投影；越界值一律夹住，窗口不该因为上游算错而画出怪东西
  const text = st.text ?? "";
  const lit = Math.max(0, Math.min(text.length, st.lit ?? 0));
  const songPct = Math.round(Math.max(0, Math.min(1, st.song ?? 0)) * 100);

  return (
    <div
      className="lyric"
      onMouseDown={(e) => {
        if (e.button === 1) window.lyricApi.action("lock"); // 中键锁定
      }}
    >
      <div className="lyric-body">
        {text ? (
          <p className="lyric-line" style={{ fontSize: font }}>
            <span className="on">{text.slice(0, lit)}</span>
            <span className="off">{text.slice(lit)}</span>
          </p>
        ) : null}
        {text && st.translation ? <p className="lyric-tr">{st.translation}</p> : null}
      </div>

      <div className="lyric-bar" aria-hidden="true">
        <i style={{ width: `${songPct}%` }} />
      </div>

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
