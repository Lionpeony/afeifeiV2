import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

/**
 * 迷你窗（M5 / P0-27）：只读投影 + 发意图。这里**没有任何状态** ——
 * 状态由主窗 store 推过来（节流 500ms），按钮只发 action 字符串，
 * 真正的 dispatch 在主窗。两窗进度差最多一个推送间隔，且同源同值。
 *
 * 2026-11-18 重做：窗里是「后台化妆镜」——一圈灯泡的镜子，封面像拍立得
 * 别在镜面上，歌词写在贴上去的便签里；鼠标进来灯泡亮起、镜头微微转向你，
 * 便签下方翻出走带与进度。它是后台的一件东西，不是播放器的一张卡片。
 *
 * 封面只在**变了**的时候随包带过来，所以收到没带 cover 的包要沿用上一张。
 * 双击照片 = 回主窗（`focus` 由主进程直接处理，不往渲染层转）。
 * 挂载完成要喊一声 `ready()`：桥会立刻补推一次，暂停下开窗不再挂"未在播放"。
 */
interface MiniState {
  status: string;
  title: string;
  /** 歌手；在线曲目来自队列表，本地来自曲库 */
  artist?: string;
  /** 音源 id（netease / qq / 用户源），用于显示小签 */
  source?: string;
  /** 队内序号（1 起）与队列长度，SETLIST 用 */
  index?: number;
  count?: number;
  t: number;
  dur: number;
  /** 当前歌词行 + 译文（P0-27，与桌面歌词同一份投影） */
  lyric?: string;
  tr?: string;
  /** 已唱字数：歌词前缀点亮，与桌面歌词同一条时间轴 */
  lit?: number;
  /** 这一首是否已红心（本地红心 / 账号红心都算） */
  liked?: boolean;
  /** 封面：本地缩略图 dataURL 或在线地址；没封面是 null */
  cover?: string | null;
  /** 主窗当前主题：迷你窗是独立 renderer，读不到主窗的 data-theme */
  theme?: string;
  /** 主窗动效档位（full / light / off）：循环动画要跟着档位停 */
  motion?: string;
}

const fmt = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const SOURCE_SHORT: Record<string, string> = { netease: "网易云", qq: "QQ音乐" };

/** 灯泡：10 颗围着镜子，序号交给 CSS 摆角度 */
const BULBS = Array.from({ length: 10 }, (_, i) => i);

declare global {
  interface Window {
    miniApi: {
      onState(cb: (json: string) => void): void;
      action(a: string): void;
      close(): void;
      ready(): void;
      onHello(cb: () => void): void;
    };
  }
}

function Mini() {
  const [st, setSt] = useState<MiniState>({ status: "idle", title: "还没选歌", t: 0, dur: 0 });
  const [drag, setDrag] = useState(false);
  const [dragT, setDragT] = useState(0);

  useEffect(() => {
    window.miniApi.ready();
    window.miniApi.onState((json) => {
      try {
        const patch = JSON.parse(json) as Partial<MiniState>;
        // 没带 cover 的包沿用上一张（桥只在变化时才带）
        setSt((prev) => ({ ...prev, ...patch }));
        if (patch.theme) document.documentElement.dataset.theme = patch.theme;
        if (patch.motion) document.documentElement.dataset.motion = patch.motion;
      } catch {
        /* 坏包直接丢，下一帧会再来 */
      }
    });
  }, []);

  const playing = st.status === "playing";
  const failed = st.status === "error";
  const shown = drag ? dragT : st.t;
  const pct = st.dur > 0 ? Math.min(100, (shown / st.dur) * 100) : 0;
  const noTrack = !st.artist && st.dur <= 0;
  const initial = noTrack ? "A" : (st.title || "A").trim().slice(0, 1).toUpperCase();
  const artistText = st.artist || (noTrack ? "后台在等下一场" : "未知歌手");
  const line = failed ? "这首歌暂时播不了，换一首试试。" : st.lyric || "后台听歌，别被发现。";
  const lit = Math.max(0, Math.min(line.length, st.lyric ? (st.lit ?? 0) : 0));
  const setlist = st.count && st.count > 0 ? `SETLIST ${String(Math.max(1, st.index ?? 1)).padStart(2, "0")}/${String(st.count).padStart(2, "0")}` : "SETLIST · SOLO";

  return (
    <div className={"mirror" + (playing ? " is-playing" : "") + (failed ? " is-failed" : "")}>
      {/* ---------- 镜子：灯泡 / 玻璃 / 别在上面的拍立得 ---------- */}
      <div className="mirror__disc" aria-hidden="true">
        {BULBS.map((i) => (
          <i key={i} className="mirror__bulb" style={{ ["--i" as string]: i }} />
        ))}
        <span className="mirror__glass">
          <span
            className={"mirror__photo" + (st.cover ? "" : " is-blank")}
            onDoubleClick={() => window.miniApi.action("focus")}
            title="双击回到主窗"
          >
            <i className="mirror__tape" />
            {st.cover ? (
              <img key={st.cover} className="mirror__img" src={st.cover} alt="" draggable={false} />
            ) : (
              <b className="mirror__initial">{initial}</b>
            )}
          </span>
          <i className="mirror__sheen" />
        </span>
      </div>

      {/* ---------- 便签：曲名 / 歌手 / 歌词 / 走带 ---------- */}
      <div className="mirror__sheet">
        <span className="mirror__under" aria-hidden="true" />
        <div className="mirror__note">
          <i className="mirror__tape mirror__tape--note" aria-hidden="true" />
          <span className={"mirror__onair" + (playing ? " is-on" : "")} aria-hidden="true">
            <i />
            {playing ? "ON AIR" : "STANDBY"}
          </span>

        <p className="mirror__title" title={st.title}>{st.title}</p>
        <p className="mirror__artist" title={st.artist ?? ""}>
          <span className="mirror__artist-name">{artistText}</span>
          {st.source ? <span className="mirror__src">{SOURCE_SHORT[st.source] ?? st.source}</span> : null}
        </p>

        <div className="mirror__lyric">
          <p key={line} className="mirror__line" title={line}>
            {st.lyric ? (
              <>
                <span className="mirror__line-on">{line.slice(0, lit)}</span>
                <span className="mirror__line-off">{line.slice(lit)}</span>
              </>
            ) : (
              line
            )}
          </p>
          {!failed && st.tr ? <p key={st.tr} className="mirror__tr" title={st.tr}>{st.tr}</p> : null}
        </div>

        <div className="mirror__seek">
          <span className="mirror__time">{fmt(shown)}</span>
          <div className="mirror__track">
            <i style={{ width: `${pct}%` }} aria-hidden="true" />
            <span className="mirror__knob" style={{ left: `${pct}%` }} aria-hidden="true" />
            <input
              className="mirror__range"
              type="range"
              min={0}
              max={Math.max(1, Math.round(st.dur))}
              value={Math.round(Math.min(shown, st.dur || shown))}
              /* 拖动中只更新本地预览（input），松手（change）才发意图 ——
                 每次 input 都发 seek: 会向主窗洪泛 dispatch */
              onChange={(e) => {
                const v = Number(e.currentTarget.value);
                setDragT(v);
                if (drag) return; // 拖动中：只画预览
                window.miniApi.action(`seek:${v}`); // 键盘/点击直接落到位置
              }}
              onPointerDown={() => {
                setDragT(st.t);
                setDrag(true);
              }}
              onPointerUp={(e) => {
                setDrag(false);
                window.miniApi.action(`seek:${Number(e.currentTarget.value)}`);
              }}
              onBlur={() => setDrag(false)}
              aria-label="播放进度"
            />
          </div>
          <span className="mirror__time mirror__time--dim">{fmt(st.dur)}</span>
        </div>

        <div className="mirror__dock">
          <div className="mirror__ops">
          <button type="button" onClick={() => window.miniApi.action("prev")} title="上一首" aria-label="上一首">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 3.4h1.8v9.2H4zM12.6 3.4v9.2L6.6 8z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="mirror__play"
            onClick={() => window.miniApi.action("toggle")}
            title={playing ? "暂停" : "播放"}
            aria-label={playing ? "暂停" : "播放"}
          >
            {playing ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.6 3.2h2.2v9.6H4.6zM9.2 3.2h2.2v9.6H9.2z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5.6 3.1l7.2 4.9-7.2 4.9z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button type="button" onClick={() => window.miniApi.action("next")} title="下一首" aria-label="下一首">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10.2 3.4H12v9.2h-1.8zM3.4 3.4v9.2L9.4 8z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className={"mirror__like" + (st.liked ? " is-on" : "")}
            onClick={() => window.miniApi.action("like")}
            title={st.liked ? "取消红心" : "加红心"}
            aria-label={st.liked ? "取消红心" : "加红心"}
            aria-pressed={Boolean(st.liked)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 13.2S2.6 9.9 2.6 6.2A3 3 0 0 1 8 4.3a3 3 0 0 1 5.4 1.9c0 3.7-5.4 7-5.4 7z"
                fill={st.liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button type="button" onClick={() => window.miniApi.action("focus")} title="回到主窗" aria-label="回到主窗">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2.6" y="3.4" width="10.8" height="7.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6.4 13h3.2M8 11v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="mirror__close" onClick={() => window.miniApi.close()} title="关闭迷你窗" aria-label="关闭迷你窗">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.6 4.6l6.8 6.8M11.4 4.6l-6.8 6.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </div>

        <div className="mirror__idle" aria-hidden="true">
          <span className="mirror__setlist">{failed ? "信号断了" : setlist}</span>
          <span className="mirror__hint">移过来看走带</span>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<Mini />);
