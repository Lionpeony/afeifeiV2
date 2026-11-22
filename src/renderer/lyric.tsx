import { createRoot } from "react-dom/client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

/**
 * 桌面歌词窗（M9-1 / P0-21）：只读投影 + 几个意图（播控 / 字号 / 底色 / 锁定 / 回主窗 / 关窗）。
 * 这里**没有任何歌词状态**——行文本、行内进度、整曲进度都由主窗歌词桥按同一份 doc
 * 算好后推过来，本窗只渲染；播控意图经主进程转给主窗 dispatch（写者仍只有一个）。
 * 中键 / 工具条 = 锁定（切穿透）；解锁走底栏「桌面歌词」或全局快捷键。
 * 字号与底色存本窗 localStorage（app:// 域，键名带 lyric- 前缀避免与迷你窗撞）。
 * 窗口位置与穿透态由主进程持久化（`main/lyricWindow.ts`），本窗只报内容高度
 * （2026-11-10 修 BUG：窗高原来写死 132px，字号放大就裁字）。
 */
interface LyricState {
  text: string;
  /** 译文，没有就空串（不占一行） */
  translation?: string;
  /** 已唱字数（折行时按前缀点亮；单行用 progress 平滑扫过） */
  lit?: number;
  /** 行内进度 0..1：单行时驱动裁剪扫过，比逐字前缀连续 */
  progress?: number;
  /** 整曲进度 0..1，底部细线 */
  song?: number;
  /** 主窗主题：纸签跟着亮/暗换纸色 */
  theme?: string;
  /** 播放态：决定工具条上是播放还是暂停 */
  status?: string;
  /** 当前曲是否已喜欢：红心按钮的实心/空心 */
  liked?: boolean;
  mode: "interactive" | "pass";
}

type Paper = "paper" | "glass" | "text" | "night";

const FONT_KEY = "lyric-font";
const PAPER_KEY = "lyric-paper";
const clampFont = (n: number): number => Math.min(64, Math.max(20, n));

const PAPERS: Paper[] = ["paper", "glass", "text", "night"];
const PAPER_LABEL: Record<Paper, string> = { paper: "纸签", glass: "半透", text: "纯文字", night: "夜纸" };
const asPaper = (v: string | null): Paper => (PAPERS.includes(v as Paper) ? (v as Paper) : "paper");

declare global {
  interface Window {
    lyricApi: {
      onState(cb: (json: string) => void): void;
      onPref(cb: (cmd: string) => void): void;
      action(a: string): void;
      close(): void;
      resize(px: number): void;
    };
  }
}

/* 单行装不下就缩字（最低 24px）；缩到底还装不下才折成两行。
   用 canvas 量文字宽度：这里只做一次布局前的估算，不碰 DOM，不会抖。 */
let measureCtx: CanvasRenderingContext2D | null = null;
let measureFamily = "";
const measureWidth = (text: string, size: number): number => {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * size;
  if (!measureFamily) measureFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
  measureCtx.font = `700 ${size}px ${measureFamily}`;
  return measureCtx.measureText(text).width * 1.02;
};

const fitLine = (text: string, max: number): { size: number; single: boolean } => {
  if (!text) return { size: max, single: true };
  const avail = Math.max(220, window.innerWidth - 12 - 56 - 10);
  const floor = Math.min(max, 24);
  let size = max;
  while (size > floor && measureWidth(text, size) > avail) size -= 1;
  return { size, single: measureWidth(text, size) <= avail };
};

type IconName = "prev" | "play" | "pause" | "next" | "heart" | "palette" | "lock" | "menu" | "close";

function Icon({ name, filled = false }: { name: IconName; filled?: boolean }) {
  switch (name) {
    case "prev":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 3v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M12 3.7v8.6L6 8z" fill="currentColor" />
        </svg>
      );
    case "next":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M11.5 3v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M4 3.7v8.6L10 8z" fill="currentColor" />
        </svg>
      );
    case "play":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5 3.2v9.6L13 8z" fill="currentColor" />
        </svg>
      );
    case "pause":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="4" y="3" width="3" height="10" rx="1" fill="currentColor" />
          <rect x="9" y="3" width="3" height="10" rx="1" fill="currentColor" />
        </svg>
      );
    case "heart":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 13.2C6.2 11.9 3 9.3 3 6.4A2.7 2.7 0 0 1 8 5.3a2.7 2.7 0 0 1 5 1.1c0 2.9-3.2 5.5-5 6.8z"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "palette":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="6.1" cy="6.1" r="1" fill="currentColor" />
          <circle cx="9.9" cy="5.9" r="1" fill="currentColor" />
          <circle cx="10" cy="9.7" r="1" fill="currentColor" />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <rect x="2.5" y="5.5" width="7" height="5" rx="1.4" fill="currentColor" />
          <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      );
    case "menu":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.6" cy="8" r="1.2" fill="currentColor" />
          <circle cx="8" cy="8" r="1.2" fill="currentColor" />
          <circle cx="12.4" cy="8" r="1.2" fill="currentColor" />
        </svg>
      );
    case "close":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}

function Lyric() {
  const [st, setSt] = useState<LyricState>({ text: "", mode: "interactive" });
  const [font, setFont] = useState(() => clampFont(Number(localStorage.getItem(FONT_KEY)) || 36));
  const [paper, setPaper] = useState<Paper>(() => asPaper(localStorage.getItem(PAPER_KEY)));
  const [hint, setHint] = useState(false);
  const capRef = useRef<HTMLDivElement | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    window.lyricApi.onState((json) => {
      try {
        setSt(JSON.parse(json) as LyricState);
      } catch {
        /* 坏包直接丢，下一行会再来 */
      }
    });
  }, []);

  /* 右键菜单与工具条里的偏好同样从主进程来：只改本窗外观，不碰歌词状态。 */
  useEffect(() => {
    window.lyricApi.onPref((cmd) => {
      if (cmd === "font+") setFont((f) => clampFont(f + 4));
      else if (cmd === "font-") setFont((f) => clampFont(f - 4));
      else if (cmd.startsWith("paper:")) setPaper(asPaper(cmd.slice(6)));
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(FONT_KEY, String(font));
  }, [font]);

  useEffect(() => {
    localStorage.setItem(PAPER_KEY, paper);
  }, [paper]);

  /* 夜纸是「固定深色」：不跟随主窗，深色壁纸上白字始终读得清。 */
  const theme = paper === "night" ? "dark" : st.theme ?? "light";
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /* 锁定后窗口就收不到鼠标了，必须当场告诉用户「从哪儿解锁」，
     否则看起来像卡死。提示 4.2 秒后自己让位给歌词。 */
  useEffect(() => {
    if (st.mode !== "pass") {
      setHint(false);
      return;
    }
    setHint(true);
    const t = window.setTimeout(() => setHint(false), 4200);
    return () => window.clearTimeout(t);
  }, [st.mode]);

  /* Ctrl+滚轮改字号：原生的 wheel 监听才能 preventDefault（React 的是 passive）。 */
  useEffect(() => {
    const el = capRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setFont((f) => clampFont(f + (e.deltaY < 0 ? 2 : -2)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* 内容高度一变就报主进程改窗高（字号、译文有无、折行都会改）。
     ResizeObserver 比"在 effect 里手算"稳：字体加载晚到也能追上。 */
  useLayoutEffect(() => {
    const el = capRef.current;
    if (!el) return;
    const report = (): void => {
      // 胶囊高度 + 上下呼吸 12px；主进程再夹紧，这里只报内容需要多少
      const h = Math.ceil(el.getBoundingClientRect().height) + 12;
      if (Math.abs(h - lastSent.current) < 2) return; // 抖动抑制：1-2px 的变化不值得跨进程
      lastSent.current = h;
      window.lyricApi.resize(h);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const text = st.text ?? "";
  const lit = Math.max(0, Math.min(text.length, st.lit ?? 0));
  const songPct = Math.round(Math.max(0, Math.min(1, st.song ?? 0)) * 100);
  const lineP = Math.max(0, Math.min(1, st.progress ?? (text ? lit / text.length : 0)));
  const { size, single } = useMemo(() => fitLine(text, font), [text, font]);
  const trSize = Math.min(20, Math.max(13, Math.round(size * 0.38)));
  const playing = st.status === "playing";
  const liked = st.liked === true;

  const cyclePaper = (): void => setPaper((p) => PAPERS[(PAPERS.indexOf(p) + 1) % PAPERS.length]);

  return (
    <div
      className="lyric"
      data-paper={paper}
      onMouseDown={(e) => {
        if (e.button === 1) window.lyricApi.action("lock"); // 中键锁定
      }}
    >
      {/* 胶囊是唯一的可拖区（2026-11-10 修 BUG：原来整窗 drag，透明得看不见的
          区域照样挡桌面点击）。胶囊外全是 no-drag 的空透明区。 */}
      <div
        className="lyric-capsule"
        ref={capRef}
        onDoubleClick={() => window.lyricApi.action("focus")}
      >
        <div className="lyric-body">
          {text ? (
            single ? (
              <p className="lyric-line lyric-line--single" style={{ fontSize: size }}>
                <span className="lyric-stack">
                  <span className="lyric-base">{text}</span>
                  <span
                    className="lyric-fill"
                    key={text}
                    aria-hidden="true"
                    style={{ "--p": lineP } as CSSProperties}
                  >
                    {text}
                  </span>
                </span>
              </p>
            ) : (
              <p className="lyric-line lyric-line--wrap" style={{ fontSize: size }}>
                <span className="on">{text.slice(0, lit)}</span>
                <span className="off">{text.slice(lit)}</span>
              </p>
            )
          ) : (
            <p className="lyric-idle">桌面歌词</p>
          )}
          {text && st.translation ? (
            <p className="lyric-tr" style={{ fontSize: trSize }}>
              {st.translation}
            </p>
          ) : null}
        </div>

        <div className="lyric-bar" aria-hidden="true">
          <i style={{ width: `${songPct}%` }} />
        </div>

        {st.mode === "pass" ? (
          /* 穿透态：收不到鼠标，所以只留一枚看得见的小锁，告诉用户它还活着 */
          <span className="lyric-lock" aria-hidden="true">
            <Icon name="lock" />
            已锁定
          </span>
        ) : (
          <div className="lyric-tools" role="toolbar" aria-label="桌面歌词控制">
            <button type="button" onClick={() => window.lyricApi.action("prev")} title="上一首" aria-label="上一首">
              <Icon name="prev" />
            </button>
            <button
              type="button"
              onClick={() => window.lyricApi.action("toggle")}
              title={playing ? "暂停" : "播放"}
              aria-label={playing ? "暂停" : "播放"}
            >
              <Icon name={playing ? "pause" : "play"} />
            </button>
            <button type="button" onClick={() => window.lyricApi.action("next")} title="下一首" aria-label="下一首">
              <Icon name="next" />
            </button>
            <button
              type="button"
              className={liked ? "is-on" : undefined}
              onClick={() => window.lyricApi.action("like")}
              title={liked ? "取消喜欢" : "喜欢"}
              aria-label={liked ? "取消喜欢" : "喜欢"}
              aria-pressed={liked}
            >
              <Icon name="heart" filled={liked} />
            </button>

            <span className="lyric-tools__sep" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setFont((f) => clampFont(f - 4))}
              title="字号缩小"
              aria-label="字号缩小"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFont((f) => clampFont(f + 4))}
              title="字号放大（长句会自动缩小以放下）"
              aria-label="字号放大"
            >
              A+
            </button>
            <button
              type="button"
              onClick={cyclePaper}
              title={`底色：${PAPER_LABEL[paper]}（点击切换）`}
              aria-label={`切换底色，当前${PAPER_LABEL[paper]}`}
            >
              <Icon name="palette" />
            </button>
            <button
              type="button"
              onClick={() => window.lyricApi.action("lock")}
              title="锁定（鼠标穿透；底栏「桌面歌词」或快捷键解锁）"
              aria-label="锁定鼠标穿透"
            >
              <Icon name="lock" />
            </button>
            <button type="button" onClick={() => window.lyricApi.action("menu")} title="更多设置" aria-label="更多设置">
              <Icon name="menu" />
            </button>
            <button type="button" onClick={() => window.lyricApi.close()} title="关闭桌面歌词" aria-label="关闭桌面歌词">
              <Icon name="close" />
            </button>
          </div>
        )}

        {hint ? (
          <div className="lyric-hint" role="status">
            已锁定 · 底栏或快捷键解锁
          </div>
        ) : null}
      </div>
    </div>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<Lyric />);
