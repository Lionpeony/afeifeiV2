/* AFEIFEI 二次元表现层与独立窗口组件
   OnomaLayer / FocusLines / MascotWalk / EggLayer / DemoPanel / LyricsBar / MiniCard / Auth
   从 offline_single/js/anime.jsx、Eggs.jsx、Extras.jsx、Auth.jsx 移植。 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useAf } from "./context.js";
import { EGGS, DEMO_INFO, sourceShort, sourceTone } from "./data.js";
import {
  GuitarFigure,
  IconArrowRight,
  IconCheck,
  IconMax,
  IconNext,
  IconNote,
  IconPrev,
  IconQueue,
  IconX,
  InstBass,
  InstDrum,
  InstGuitar,
  InstKeys,
  LogoMark,
  Silhouette,
  IconPick,
} from "./icons.js";
import { PlayGlyph, Tape } from "./ui.js";
import { usePref } from "./prefs.js";
import { Sound } from "./sound.js";
import { usePosition } from "./use-position.js";
import { lyricState, subscribeLyric } from "../lyric-source.js";

export interface OnomaItem {
  id: string;
  text: string;
  tone: string;
  x: number;
  y: number;
  rot: string;
}

export const OnomaLayer = ({ items }: { items: OnomaItem[] }) => (
  <div className="onoma-layer" aria-hidden="true">
    {items.map((o) => (
      <span
        key={o.id}
        className={"onoma onoma--" + o.tone}
        style={{ left: o.x + "px", top: o.y + "px", ["--rot" as string]: o.rot + "deg" }}
      >
        {o.text}
      </span>
    ))}
  </div>
);

export const FocusLines = () => <div className="focus-lines" aria-hidden="true"></div>;

export const MascotWalk = ({ onEnd }: { onEnd: () => void }) => {
  useEffect(() => {
    const t = setTimeout(onEnd, 9000);
    return () => clearTimeout(t);
  }, [onEnd]);
  return (
    <div className="mascot" aria-hidden="true">
      <div className="mascot__fig" title="好像有人路过">
        <svg viewBox="0 0 130 132" width="130" height="132">
          <ellipse className="mascot__shadow" cx="64" cy="124" rx="30" ry="5" />
          <g className="mascot__legs">
            <rect className="mascot__leg mascot__leg--a" x="54" y="96" width="7" height="24" rx="3.5" />
            <rect className="mascot__leg mascot__leg--b" x="66" y="96" width="7" height="24" rx="3.5" />
          </g>
          <path className="mascot__body" d="M48 76c0-8 7-14 16-14s16 6 16 14v16c0 6-5 10-11 10H59c-6 0-11-4-11-10z" />
          <g className="mascot__arm">
            <rect x="41" y="80" width="6" height="20" rx="3" transform="rotate(14 44 90)" />
          </g>
          <g className="mascot__head">
            <circle cx="65" cy="46" r="19" />
            <path d="M46 43c1-11 9-18 19-18s18 7 19 18c-4-4-9-6-14-6-6 0-10 2-14 6-3 3-6 4-10 3z" />
            <path d="M47 40c-4 1-7 6-8 12 3 1 6 0 8-2z" />
          </g>
          <g className="mascot__guitar">
            <path d="M92 62c7 0 12 5 12 11s-5 11-12 11-12-5-12-11 5-11 12-11z" />
            <rect x="96" y="34" width="5" height="30" rx="2.5" transform="rotate(17 98 49)" />
            <rect x="100" y="28" width="9" height="7" rx="2" transform="rotate(17 104 31)" />
          </g>
        </svg>
      </div>
      <span className="mascot__tag hand">…路过</span>
    </div>
  );
};

/* ---------- 歌词：订阅真实歌词源 ---------- */
export function useLyricLines(): { text: string; startMs: number }[] {
  const [state, setState] = useState(() => lyricState());
  useEffect(() => subscribeLyric(() => setState(lyricState())), []);
  return useMemo(() => (state.doc?.lines ?? []).map((l) => ({ text: l.text, startMs: l.startMs })), [state]);
}

/* ---------- 彩蛋层 ---------- */
export function EggLayer() {
  const { overlay, corner } = useAf();
  return (
    <>
      {overlay === "river" && (
        <div className="river">
          {[[68, 82, 5], [74, 86, 3.4], [81, 79, 4], [62, 88, 2.6], [86, 90, 3], [71, 92, 2.2]].map((p, i) => (
            <span
              key={i}
              className="river__light"
              style={{ left: p[0] + "%", top: p[1] + "%", width: p[2] * 2, height: p[2] * 2, ["--d" as string]: 800 + i * 50 + "ms" }}
            ></span>
          ))}
          <div className="river__copy">便利店的灯还亮着。</div>
          <div className="river__meta">02:47 · 河堤 · 没有别人</div>
        </div>
      )}

      {overlay === "live" && (
        <div className="live">
          <div className="live__beams">
            <span className="live__beam live__beam--1"></span>
            <span className="live__beam live__beam--2"></span>
            <span className="live__beam live__beam--3"></span>
          </div>
          <div className="live__floor"></div>
          <div className="live__stage">
            <div className="live__inst" style={{ animationDelay: ".42s" }}><InstDrum size={96} /><span>DRUMS</span></div>
            <div className="live__inst" style={{ animationDelay: ".46s" }}><InstBass size={92} /><span>BASS</span></div>
            <div className="live__inst" style={{ animationDelay: ".5s" }}><InstGuitar size={92} /><span>GUITAR</span></div>
            <div className="live__inst" style={{ animationDelay: ".54s" }}><InstKeys size={80} /><span>KEYS</span></div>
          </div>
        </div>
      )}

      {overlay === "lyric" && (
        <div className="lyric">
          <div className="lyric__note">
            <Tape w={72} rot={-2} style={{ top: -11, left: "50%", marginLeft: -36 }} />
            <div className="eyebrow" style={{ color: "rgba(61,43,57,.45)" }}>练习本 · 第 43 页</div>
            <div className="lyric__lines">
              <div className="lyric__line"></div>
              <div className="lyric__line"></div>
              <div className="lyric__line"></div>
              <div className="lyric__line"></div>
            </div>
            <div><span className="lyric__text">写了又划，划了又写。</span></div>
            <div className="lyric__meta">SAME SONG · 10 TIMES</div>
            <span className="lyric__cross"></span>
          </div>
        </div>
      )}

      {overlay === "idle" && (
        <div className="idle-veil">
          <div className="idle-figure"><Silhouette w={92} h={114} /></div>
          <div className="idle-copy">……在看吗？</div>
        </div>
      )}

      {corner && (
        <>
          <div className="corner-figure"><Silhouette w={66} h={82} /></div>
          <div className="corner-figure__copy">……我先回去练琴了。</div>
        </>
      )}
    </>
  );
}

export function DemoPanel() {
  const { setDemoOpen, eggs, triggerEgg } = useAf();
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDemoOpen(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [setDemoOpen]);
  return (
    <div className="demo" onClick={() => setDemoOpen(false)}>
      <div className="demo__panel" onClick={(e) => e.stopPropagation()}>
        <div className="demo__head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>原型演示</div>
            <h2 className="h1">17 个彩蛋，随手点一个</h2>
          </div>
          <button className="icon-btn" onClick={() => setDemoOpen(false)} aria-label="关闭"><IconX size={18} /></button>
        </div>
        <p className="demo__sub">
          真机上这些彩蛋靠时间、次数和动作触发（例如凌晨 2–4 点、同一首听 10 遍、连点 Logo 5 次）。
          这里为了方便评审，提供手动触发。
        </p>
        <div className="demo__grid">
          {EGGS.map((e) => (
            <button key={e.id} className="demo__item" onClick={() => triggerEgg(e.id)}>
              <span className="demo__id">{e.id}</span>
              <span className="demo__name">
                {e.name}
                <span className="meta" style={{ display: "block", fontSize: 10, marginTop: 2, lineHeight: 1.5 }}>
                  {DEMO_INFO[e.id]}
                </span>
              </span>
              <span className="demo__go">{eggs.includes(e.id) ? "再看" : "触发"}</span>
            </button>
          ))}
        </div>
        <div className="demo__foot">
          <span className="meta">已发现 {eggs.length} / 17 · 记录保存在本地</span>
          <span className="meta">按 Esc 或点空白关闭</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 桌面歌词条 ---------- */
export function LyricsBar() {
  const api = useAf();
  const { track, setLyricsBar } = api;
  const { pos } = usePosition(api);
  const lines = useLyricLines();
  const KEY = "afeifei.v42.lyricbar";
  const read = (): { x?: number; y?: number; scale?: number } => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}") as { x?: number; y?: number; scale?: number };
    } catch {
      return {};
    }
  };
  const [box, setBox] = useState(() => read());
  const [scale, setScale] = useState(() => read().scale || 1);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number; w: number; h: number } | null>(null);
  const persist = (next: { x?: number; y?: number; scale: number }): void => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式忽略 */
    }
  };

  let cur = 0;
  const ms = pos * 1000;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.startMs <= ms) cur = i;
    else break;
  }
  const start = lines[cur]?.startMs ?? 0;
  const end = lines[cur + 1]?.startMs ?? start + 4000;
  const p = Math.max(0, Math.min(1, (ms - start) / Math.max(1, end - start))) * 100;
  const now = lines[cur]?.text ?? "暂无歌词";
  const next = lines[cur + 1]?.text ?? "";

  const onDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest("button")) return;
    const r = e.currentTarget.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.max(8, Math.min(window.innerWidth - d.w - 8, e.clientX - d.dx));
    const y = Math.max(8, Math.min(window.innerHeight - d.h - 8, e.clientY - d.dy));
    setBox({ x, y, scale });
  };
  const onUp = (): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setBox((b) => {
      persist({ ...b, scale });
      return b;
    });
  };
  const setSize = (d: number): void => {
    const next = Math.max(0.85, Math.min(1.5, Math.round((scale + d) * 100) / 100));
    setScale(next);
    setBox((b) => {
      persist({ ...b, scale: next });
      return b;
    });
  };

  const style = {
    ["--lb-fs" as string]: scale,
    left: box.x != null ? box.x + "px" : undefined,
    top: box.x != null ? box.y + "px" : undefined,
    right: box.x != null ? "auto" : undefined,
    bottom: box.x != null ? "auto" : undefined,
  };

  return (
    <div
      className={"lyricbar" + (dragging ? " is-dragging" : "")}
      style={style}
      role="status"
      aria-label="桌面歌词"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span className="lyricbar__grip" title="拖动改变位置"><IconQueue size={13} /></span>
      <span className="lyricbar__badge"><IconNote size={12} />桌面歌词</span>
      <div className="lyricbar__stage">
        <span className="lyricbar__cur" key={cur} style={{ fontSize: 19 * scale + "px" }}>
          {now}
          <span className="lyricbar__fill" style={{ ["--p" as string]: p + "%", fontSize: 19 * scale + "px" }} aria-hidden="true">{now}</span>
        </span>
        <span className="lyricbar__next">{next}</span>
      </div>
      <div className="lyricbar__tools">
        <button onClick={() => setSize(-0.08)} title="缩小字号">A-</button>
        <button onClick={() => setSize(0.08)} title="放大字号">A+</button>
      </div>
      <button className="lyricbar__close" onClick={() => setLyricsBar(false)} title="关闭桌面歌词" aria-label="关闭桌面歌词">
        <IconX size={14} />
      </button>
    </div>
  );
}

/* ---------- 迷你模式 ---------- */
export function MiniCard() {
  const api = useAf();
  const { track, playing, setPlaying, userSkip, setMiniMode, source, onoma, isLiked, toggleLike } = api;
  const { pos, dur } = usePosition(api);
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
  const liked = isLiked(track);
  return (
    <div className="mini-stage" data-screen-label="迷你模式">
      <div className="mini-stage__wall">
        <span className="mini-stage__mark">AFEIFEI</span>
        <span className="mini-stage__hint hand">窗口收拢成一张便签 · 点右上角展开</span>
        <span className="mini-stage__note">真实客户端会收成一个无边框置顶小窗；原型内为样式演示。</span>
      </div>
      <div className="mini-card" role="region" aria-label="迷你播放器">
        <button className="mini-card__art" onClick={() => setMiniMode(false)} title="展开完整窗口">
          {track.cover ? <img src={track.cover} alt="" /> : <span style={{ display: "grid", placeItems: "center", height: "100%" }}><IconPick size={22} /></span>}
          {playing && <span className="mini-card__glow"></span>}
        </button>
        <div className="mini-card__body">
          <span className="mini-card__title truncate">{track.title}</span>
          <span className="mini-card__artist truncate">
            {track.artist}
            <span className="mini-card__src" style={{ color: sourceTone(source) }}>{sourceShort(source)}</span>
          </span>
        </div>
        <div className="mini-card__ctrl">
          <button onClick={() => userSkip("prev")} title="上一首" aria-label="上一首"><IconPrev size={15} /></button>
          <button className="mini-card__play" onClick={() => setPlaying(!playing)} title={playing ? "暂停" : "播放"} aria-label={playing ? "暂停" : "播放"}>
            <PlayGlyph playing={playing} size={14} />
          </button>
          <button onClick={() => userSkip("next")} title="下一首" aria-label="下一首"><IconNext size={15} /></button>
          <button
            onClick={() => { onoma("ポンッ", { tone: "coral", x: window.innerWidth - 120, y: window.innerHeight - 120 }); toggleLike(track); }}
            className={liked ? "is-on" : ""}
            title="喜欢"
            aria-label="喜欢"
          >
            {liked ? <IconCheck size={14} /> : <IconPick size={14} />}
          </button>
          <button onClick={() => setMiniMode(false)} title="展开完整窗口" aria-label="展开完整窗口"><IconMax size={13} /></button>
        </div>
        <div className="mini-card__line" title="播放进度"><i style={{ width: pct + "%" }} /></div>
      </div>
    </div>
  );
}

/* ---------- 入场登记 ---------- */
export function Auth() {
  const { sources, accounts, loggedIn, loginFor, toast } = useAf();
  const [entered, setEntered] = usePref("entered", false);
  if (entered || loggedIn) return null;
  const linkedAny = Object.values(accounts).some(Boolean);
  return (
    <div className="auth" data-screen-label="入场登记">
      <span className="auth__glow auth__glow--a"></span>
      <span className="auth__glow auth__glow--b"></span>
      <div className="auth__ticket">
        <Tape w={96} rot={-2.2} style={{ top: -13, left: "50%", marginLeft: -48 }} />
        <div className="auth__top">
          <span className="eyebrow">AFEIFEI · 后台入口 · NO. 001</span>
          <span className="auth__no">ADMIT ONE</span>
        </div>
        <h1 className="display auth__title">今晚的演出<br />需要<span className="marker">你的门票</span></h1>
        <p className="body auth__lead">
          这个播放器本身不带音乐。登记一个音源账号，歌单和推荐才从你那边取过来。
          <span className="hand auth__lead-hand">（真实登录，扫码或验证码）</span>
        </p>
        <div className="auth__sources">
          {sources.filter((s) => s.canAuth !== false).map((src) => {
            const on = Boolean(accounts[src.id]);
            return (
              <button key={src.id} className={"auth-src" + (on ? " is-linked" : "")} onClick={() => loginFor(src.id)} style={{ ["--src" as string]: src.tone }}>
                <span className="auth-src__bar" style={{ background: src.tone }}></span>
                <span className="auth-src__head">
                  <span className="auth-src__dot" style={{ background: src.tone }}></span>
                  <span className="auth-src__name">{src.name}</span>
                  <span className="auth-src__state">{on ? "已登记" : "未登录"}</span>
                </span>
                <span className="auth-src__body">
                  <span className="auth-src__qr" style={{ display: "grid", placeItems: "center", color: "var(--text-3)" }}>
                    <IconNote size={34} />
                  </span>
                  <span className="auth-src__meta">
                    {on ? (
                      <>
                        <span className="auth-src__account">{src.account ?? "已登录"}</span>
                        <span className="auth-src__line">歌单与每日推荐已同步</span>
                        <span className="auth-src__ok"><IconCheck size={13} /> 数据已同步</span>
                      </>
                    ) : (
                      <>
                        <span className="auth-src__line">扫码登录 / 账号密码</span>
                        <span className="auth-src__hint hand">点这张卡 = 打开真实登录</span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="auth__foot">
          <button
            className="btn btn-primary auth__enter"
            disabled={!linkedAny}
            onClick={() => {
              setEntered(true);
              Sound.paper();
              toast("幕布拉开了，今晚的自助。", { hand: true, ms: 2600 });
            }}
          >
            {linkedAny ? "拉开幕布，进后台" : "先登记一个账号"}
            <IconArrowRight size={15} />
          </button>
          <button className="auth__skip hand" onClick={() => { setEntered(true); toast("没登录也能逛，只是没有歌单数据。", { hand: true }); }}>
            先随便逛逛（不要账号）
          </button>
        </div>
        <span className="auth__fine">曲目、歌单、榜单均来自你登录的音源账号 · 不连接未授权平台</span>
      </div>
    </div>
  );
}
