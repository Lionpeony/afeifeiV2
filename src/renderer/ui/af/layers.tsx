/* AFEIFEI 二次元表现层与独立窗口组件
   OnomaLayer / FocusLines / EggLayer / DemoPanel / Auth
   从 offline_single/js/anime.jsx、Eggs.jsx、Extras.jsx、Auth.jsx 移植。 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useAf } from "./context.js";
import { useDialogFocus } from "./dialog-focus.js";
import { SceneSwitch } from "./SceneSwitch.js";
import { EGGS, DEMO_INFO, PALETTES, sourceShort, sourceTone } from "./data.js";
import { eggText, packLineCopy } from "./copy.js";
import {
  GuitarFigure,
  IconArrowRight,
  IconCheck,
  IconX,
  InstBass,
  InstDrum,
  InstGuitar,
  InstKeys,
  LogoMark,
  Silhouette,
  IconPick,
} from "./icons.js";
import { Tape } from "./ui.js";
import { usePref } from "./prefs.js";
import { Sound } from "./sound.js";
import { lyricState, subscribeLyric } from "../lyric-source.js";
import { hashStr } from "./art.js";

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

/* walking mascot（MascotWalk）已按 2026-11-20 的决定整体退场：角色太突兀。
   角落剪影（E13 告辞 / E27 断网探头）保留——那是 2.9s 的事件反馈，不是巡游。 */

/* ---------- 歌词：订阅真实歌词源 ---------- */
export function useLyricLines(): { text: string; startMs: number; translations?: Record<string, string> }[] {
  const [state, setState] = useState(() => lyricState());
  useEffect(() => subscribeLyric(() => setState(lyricState())), []);
  return useMemo(
    () => (state.doc?.lines ?? []).map((l) => ({ text: l.text, startMs: l.startMs, translations: l.translations })),
    [state]
  );
}

/* ---------- 彩蛋层 ---------- */
export function EggLayer() {
  const { overlay, corner, palette, themeScene, setOverlay, reduce } = useAf();
  /* 换装签名（docs/30 §42）：色板落地后 620ms 的「场地特征」，一包一种，只演一次 */
  const [packFx, setPackFx] = useState<string | null>(null);
  const prevPalette = useRef(palette);
  useEffect(() => {
    if (prevPalette.current === palette) return;
    prevPalette.current = palette;
    if (reduce || palette === "default") return;
    setPackFx(palette);
    const id = window.setTimeout(() => setPackFx(null), 620);
    return () => window.clearTimeout(id);
  }, [palette, reduce]);
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
        <div className="lyric" role="button" title="点一下收起来" onClick={() => setOverlay(null)}>
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

      {overlay === "unbox" && (
        <div className="unbox" aria-hidden="true">
          <div className="unbox__burst">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <i key={i} style={{ ["--a" as string]: `${i * 45}deg`, ["--j" as string]: `${0.82 + (i % 3) * 0.18}` }}></i>
            ))}
          </div>
          <div className="unbox__box">
            <span className="unbox__ribbon"></span>
            <span className="unbox__dot"></span>
            <span className="unbox__lid"></span>
          </div>
          <div className="unbox__copy">{(PALETTES.find((p) => p.id === palette) ?? PALETTES[0]).label}</div>
          <div className="unbox__meta">THEME UNBOXED</div>
        </div>
      )}

      {themeScene ? (
        <SceneSwitch
          scene={{
            kind: "theme",
            phase: themeScene.phase,
            label: (PALETTES.find((p) => p.id === themeScene.id) ?? PALETTES[0]).label,
            sub: "换装 · PALETTE",
            tone: "var(--pink-600)",
            dir: themeScene.dir,
          }}
        />
      ) : null}

      {packFx && !reduce ? <div key={packFx} className={"packfx packfx--" + packFx} aria-hidden="true" /> : null}

      {corner && (
        <>
          <div className="corner-figure">
            <Silhouette w={66} h={82} pose={corner === "peek" ? "peek" : "wave"} />
          </div>
          <div className="corner-figure__copy">
            {corner === "peek" ? eggText(palette, "netBack") : "……我先回去练琴了。"}
          </div>
        </>
      )}
    </>
  );
}

export function DemoPanel() {
  const { setDemoOpen, eggs, triggerEgg } = useAf();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, panelRef);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDemoOpen(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [setDemoOpen]);
  return (
    <div className="demo" role="dialog" aria-modal="true" aria-label="原型演示" onClick={() => setDemoOpen(false)}>
      <div ref={panelRef} tabIndex={-1} className="demo__panel" onClick={(e) => e.stopPropagation()}>
        <div className="demo__head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>原型演示</div>
            <h2 className="h1">{EGGS.length} 个彩蛋，随手点一个</h2>
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
          <span className="meta">已发现 {eggs.length} / {EGGS.length} · 记录保存在本地</span>
          <span className="meta">按 Esc 或点空白关闭</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 入场登记 ---------- */
/** 程序化二维码：11×11 确定性点阵 + 三个定位角，原型同款 */
function FakeQR({ seed = "afeifei", size = 96 }: { seed?: string; size?: number }) {
  const n = 11;
  const h = hashStr(seed);
  const cells: [number, number][] = [];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const finder = (x < 4 && y < 4) || (x > n - 5 && y < 4) || (x < 4 && y > n - 5);
      if (finder) continue;
      if ((h >>> ((x * 5 + y * 7) % 29)) & 1) cells.push([x, y]);
    }
  }
  const Finder = ({ fx, fy }: { fx: number; fy: number }) => (
    <g>
      <rect x={fx} y={fy} width="4" height="4" rx="1" />
      <rect x={fx + 1} y={fy + 1} width="2" height="2" fill="var(--card)" />
    </g>
  );
  return (
    <svg className="auth-src__qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
      <rect width={n} height={n} fill="var(--card)" />
      <g fill="var(--text)">
        {cells.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="1" height="1" />
        ))}
        <Finder fx={0} fy={0} />
        <Finder fx={n - 4} fy={0} />
        <Finder fx={0} fy={n - 4} />
      </g>
    </svg>
  );
}

export function Auth() {
  const { sources, accounts, loggedIn, loginFor, toast, palette } = useAf();
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
                    <FakeQR seed={src.id + "afeifei"} size={94} />
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
              toast(packLineCopy(palette, "guide"), { hand: true, ms: 2600 });
            }}
          >
            {linkedAny ? "拉开幕布，进后台" : "先登记一个账号"}
            <IconArrowRight size={15} />
          </button>
          <button className="auth__skip hand" onClick={() => { setEntered(true); toast(packLineCopy(palette, "emptyLoggedOut"), { hand: true }); }}>
            先随便逛逛（不要账号）
          </button>
        </div>
        <span className="auth__fine">曲目、歌单、榜单均来自你登录的音源账号 · 不连接未授权平台</span>
      </div>
    </div>
  );
}
