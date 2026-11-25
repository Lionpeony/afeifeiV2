/* 全屏播放页 · 原型 .np（海报栏 / 歌词舞台 / 演出单 / 控制台 / 幕布） */
import { useMemo, useRef, useState, useEffect } from "react";

import { useAf } from "./context.js";
import { TrackArt, artPaletteOf } from "./art.js";
import { IconChevronDown, IconNote, IconNext, IconPrev, IconRepeat, IconRepeatOne, IconShuffle, IconPick, IconPickOutline, IconVolume, IconX, IconShare, IconKeys, IconMini, IconMin, IconMax, IconRestore, IconExpand, GuitarFigure } from "./icons.js";
import { PlayGlyph, Strike, Tape } from "./ui.js";
import { LyricWall } from "./LyricWall.js";
import { ShareCard } from "./ShareCard.js";
import { usePosition } from "./use-position.js";
import { useDialogFocus } from "./dialog-focus.js";
import { eggText, stageCopy } from "./copy.js";
import { segmentOf, stageOf, pickStageEgg, type StageEgg } from "./stage.js";

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/* 源数据偶尔把同一位艺人拼两遍（「柳瑞蔓 · 柳瑞蔓」），显示前压成一份 */
function dedupeActor(name: string): string {
  const parts = name.split(" · ").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 && parts.every((p) => p === parts[0]) ? parts[0]! : name;
}

export function NowPlaying() {
  const api = useAf();
  const {
    track,
    playing,
    setPlaying,
    queue,
    queueIndex,
    goTo,
    userSkip,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    isLiked,
    toggleLike,
    discover,
    setPage,
    toast,
    palette,
    closePlayer,
    playerClosing,
    openDiscoverDetail,
    chorusAt,
    markChorus,
    struckId,
    sheerSide,
    onomaAt,
    lyricsOn,
    lyricsFull,
    setKeysOpen,
    keysHintSeen,
    dismissKeysHint,
    reduce,
    stageFx,
    volume,
    setVolume,
    muted,
    toggleMute,
  } = api;
  const { pos, dur } = usePosition(api);
  /* 播放页是整块 dialog：焦点进来、Tab 不出框，收起后还给点开它的按钮 */
  const npRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, npRef);
  const total = track.dur || dur || 0;
  // 专辑与艺人/歌名同名（单曲/同名单）时不重复报一遍（docs/30 §37：播放页去重）
  const bandName = dedupeActor(track.artist || "未知艺人");
  const albumText = track.album && track.album !== track.artist && track.album !== track.title ? track.album : "";
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  /* 演出单是这版播放页的第三根柱子，默认摊开；窄窗或想安静时收成一条 */
  const [queueOpen, setQueueOpen] = useState(true);
  /* 演出状态机（docs/30 §41）：开演标记 / 换场 0.9s / 跨半场 8s 中场窗口 */
  const [seenPlay, setSeenPlay] = useState(playing);
  const [changeFx, setChangeFx] = useState(false);
  const [intermissionFx, setIntermissionFx] = useState(false);
  /* 演出彩蛋（§43）：副歌进一次掷一次，换场另掷断弦；总开关与减弱动效都拦在外面 */
  const [stageEgg, setStageEgg] = useState<StageEgg | null>(null);
  const eggTimer = useRef<number | null>(null);
  const chorusRolled = useRef<string | null>(null);
  const firstTrackEgg = useRef(true);
  useEffect(() => () => { if (eggTimer.current) window.clearTimeout(eggTimer.current); }, []);
  const prevIndex = useRef(queueIndex);
  const firstTrack = useRef(true);
  useEffect(() => {
    if (playing) setSeenPlay(true);
  }, [playing]);
  useEffect(() => {
    if (firstTrack.current) { firstTrack.current = false; return; }
    setChangeFx(true);
    const id = setTimeout(() => setChangeFx(false), 900);
    return () => clearTimeout(id);
  }, [track.id]);
  useEffect(() => {
    const half = Math.ceil(queue.length / 2);
    const crossed = playing && queue.length > 2 && prevIndex.current < half && queueIndex >= half;
    prevIndex.current = queueIndex;
    if (!crossed) return;
    setIntermissionFx(true);
    const id = setTimeout(() => setIntermissionFx(false), 8000);
    return () => clearTimeout(id);
  }, [queueIndex, queue.length, playing]);
  /* 播放页盖住了顶栏，窗口控制得自己带（最大化/还原态与主窗口同步） */
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.api.windowIsMaximized().then((v) => {
      if (alive) setMaximized(v);
    });
    window.api.onWindowMaximized((v) => setMaximized(v));
    return () => {
      alive = false;
    };
  }, []);
  /* 全屏播放模式：窗口层真全屏；chrome 鼠标静止 2.8s 隐退，Esc 退出（对齐 QQ/网易全屏，docs/30 §22） */
  const [fs, setFs] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.api.windowIsFullscreen().then((v) => {
      if (alive) setFs(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    document.body.toggleAttribute("data-fs", fs);
    if (!fs) { document.body.classList.remove("np-idle"); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = (): void => {
      if (timer) clearTimeout(timer);
      document.body.classList.remove("np-idle");
      timer = setTimeout(() => document.body.classList.add("np-idle"), 2800);
    };
    arm();
    const onMove = (): void => arm();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") void window.api.toggleFullscreen(false).then(setFs);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("np-idle");
      document.body.removeAttribute("data-fs");
      if (timer) clearTimeout(timer);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [fs]);
  const liked = isLiked(track);
  /* 演出话术随包（docs/30 §39）：状态行 / 幕名 / 演出单抬头 / 空态 / 散场倒计时 */
  const sc = stageCopy(palette);

  /* 红心飞出：点喜欢（或长按盖火焰时顺手点亮）就从按钮上方飘一颗心 */
  const [heartSeq, setHeartSeq] = useState(0);
  const flyHeart = (): void => setHeartSeq((s) => s + 1);

  /* E19 长按红心：按住 1 秒触发火焰，之后的那次 click 作废；文案递进池按次数 */
  const likeHold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const likeFired = useRef(false);
  const likeCount = useRef(0);
  const cancelLikeHold = (): void => {
    if (likeHold.current) { clearTimeout(likeHold.current); likeHold.current = null; }
  };
  useEffect(() => cancelLikeHold, []);

  const ratioFromEvent = (e: React.PointerEvent): number => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const seek = (e: React.PointerEvent): void => {
    api.seekTo(ratioFromEvent(e) * total);
  };
  const onDown = (): void => {
    setDragging(true);
  };
  const onUp = (e: React.PointerEvent): void => {
    seek(e);
    setDragging(false);
  };

  const chorusPct = chorusAt != null && total > 0 ? (chorusAt / total) * 100 : null;
  const showChorusHint = chorusAt != null && pos >= chorusAt - 8 && pos < chorusAt;
  const pct = total > 0 ? Math.min(100, (pos / total) * 100) : 0;

  const acts = useMemo(() => {
    if (queue.length <= 12) return [queue];
    const out = [];
    for (let i = 0; i < queue.length; i += 4) out.push(queue.slice(i, i + 4));
    return out;
  }, [queue]);
  const actSize = acts[0]?.length ?? 0;
  const actIndex = actSize > 0 ? Math.min(acts.length - 1, Math.floor(queueIndex / actSize)) : 0;

  const nextTrack = queue.length > 1 ? queue[(queueIndex + 1) % queue.length] : null;
  const totalDur = queue.reduce((s, t) => s + t.dur, 0);
  /* 散场倒计时要活的：前面几首放完的 + 当前这首已播的，从总时长里扣，
     播满一分钟少一分钟（ceil：52:31 显示还剩 53，跨过整分才跳） */
  const playedDur =
    queue.slice(0, queueIndex).reduce((s, t) => s + t.dur, 0) + Math.min(pos, track.dur || dur || 0);
  const remainMin = Math.max(0, Math.ceil((totalDur - playedDur) / 60));
  /* 状态行与舞台节点同源（§39 话术 × §41 状态机）；换场那 0.9s 也说出来 */
  const started = seenPlay || playing || pos > 0 || queueIndex > 0;
  const stage = changeFx
    ? "change"
    : stageOf({ queueLength: queue.length, index: queueIndex, playing, started, pos, dur: total, intermission: intermissionFx });
  const seg = segmentOf(pos, total);
  const stageLabel = stage === "idle"
    ? sc.idle
    : stage === "curtain"
      ? sc.curtain
      : stage === "intermission"
        ? sc.intermission
        : stage === "paused"
          ? sc.paused
          : stage === "change"
            ? sc.trackChange
            : stage === "encore"
              ? sc.encore
              : sc.live;

  const fireEgg = (egg: StageEgg): void => {
    setStageEgg(egg);
    const ms =
      egg === "rain-up" ? 8000
        : egg === "passerby" ? 9000
          : egg === "danmaku" ? 7000
            : egg === "glass-streak" ? 2400
              : egg === "spot-slip" ? 800
                : 500;
    if (eggTimer.current) window.clearTimeout(eggTimer.current);
    eggTimer.current = window.setTimeout(() => setStageEgg(null), ms);
  };
  useEffect(() => {
    if (firstTrackEgg.current) { firstTrackEgg.current = false; return; }
    if (reduce || !stageFx) return;
    const egg = pickStageEgg(palette, queueIndex + 1, "change");
    if (egg) fireEgg(egg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);
  useEffect(() => {
    if (!stageFx || reduce || !playing || seg !== "chorus") return;
    if (chorusRolled.current === track.id) return;
    chorusRolled.current = track.id;
    const egg = pickStageEgg(palette, queueIndex + 1, "chorus");
    if (egg) fireEgg(egg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg, playing, track.id, palette, queueIndex, stageFx, reduce]);

  return (
    <div ref={npRef} tabIndex={-1} className={["np", `np--${palette}`, playing ? "np--playing" : "np--paused", playerClosing ? "np--closing" : "", lyricsFull && lyricsOn ? "np--lyrics-full" : ""].filter(Boolean).join(" ")} data-stage={stage} data-seg={seg} data-egg={stageEgg ?? undefined} data-screen-label="播放页" role="dialog" aria-modal="true" aria-label="播放页">
      {!reduce && !playerClosing && (
        <>
          <div className="curtain curtain--l"></div>
          <div className="curtain curtain--r"></div>
        </>
      )}
      {!reduce && playerClosing && (
        <>
          <div className="curtain curtain--close curtain--close-l"></div>
          <div className="curtain curtain--close curtain--close-r"></div>
        </>
      )}

      {/* 氛围层：位于内容之下，歌词与操作区零噪点；材质与漂浮物随包（docs/30 §35） */}
      <div className="np__amb" aria-hidden="true">
        <span className="np__amb-float" />
        <span className="np__amb-prop"><GuitarFigure w={220} h={113} /></span>
        <span className="np__amb-tri" />
        <span className="np__egg np__egg--spot" />
        <span className="np__egg np__egg--tear" />
        <span className="np__egg np__egg--rain" />
        <span className="np__egg np__egg--streak" />
        <span className="np__egg np__egg--walk" />
        <span className="np__egg np__egg--chat" />
        <span key={track.id} className="np__cutbar" />
      </div>

      {/* 换场扫光（docs/30 §44）：btr 柔暗场 / mygo 水雾漫过 / gbc 洋红横扫 */}
      <span className="np__change" aria-hidden="true" />

      <div className="np__top">
        <button className="np__close" onClick={closePlayer}>
          <IconChevronDown size={17} />收起
        </button>
        <span className="np__top-sep" aria-hidden="true"></span>
        <span className="np__top-label" title={stage === "intermission" ? sc.intermissionTip : undefined}>
          <IconNote size={13} />
          {stageLabel}
          {queue.length > 0 ? (
            <> · SETLIST · 第 {queueIndex + 1} 首 / 共 {queue.length} 首</>
          ) : null}
        </span>
        <span className="spacer"></span>
        {palette === "gbc" && (
          <span className="np__rec" aria-hidden="true"><i></i>REC</span>
        )}
        {/* 右上 = 视窗/环境操作带（对齐主流播放器「左上离开 / 右上管窗 / 底部管歌」分区；docs/30 §20/§21）
            内容操作（分享/快捷键/迷你/全屏）与窗口操作分组，窗口组降一档存在感 */}
        <div className="np__ops">
          <button className="icon-btn np__op-labeled" onClick={() => setShareOpen(true)} title="把这首做成分享卡片" aria-label="分享卡片"><IconShare size={16} /><span>分享</span></button>
          <button className="icon-btn np__op-labeled" onClick={() => setKeysOpen(true)} title="键盘快捷键清单（?）" aria-label="快捷键"><IconKeys size={16} /><span>快捷键</span></button>
          <button className="icon-btn" onClick={() => { void window.api.toggleMini(); }} title="迷你模式（K）" aria-label="迷你模式"><IconMini size={16} /></button>
          <button
            className="icon-btn"
            onClick={() => void window.api.toggleFullscreen().then(setFs)}
            title={fs ? "退出全屏（Esc）" : "全屏模式"}
            aria-label={fs ? "退出全屏" : "全屏模式"}
          >
            <IconExpand size={16} />
          </button>
        </div>
        <span className="np__windiv" aria-hidden="true"></span>
        <div className="np__winops">
          <button className="icon-btn np__winbtn" onClick={() => void window.api.minimizeWindow()} title="最小化" aria-label="最小化"><IconMin size={13} /></button>
          <button
            className="icon-btn np__winbtn"
            onClick={() => void window.api.toggleMaximize().then(setMaximized)}
            title={maximized ? "还原" : "最大化"}
            aria-label={maximized ? "还原" : "最大化"}
          >
            {maximized ? <IconRestore size={12} /> : <IconMax size={12} />}
          </button>
          <button className="icon-btn np__winbtn np__winclose" onClick={() => void window.api.closeWindow()} title="关闭" aria-label="关闭"><IconX size={13} /></button>
        </div>
      </div>

      {/* 三根柱子：左海报 / 中歌词舞台 / 右演出单 */}
      <div className="np__main">
        <section className="np__poster" aria-label="本场海报">
          <div key={"art-" + track.id} className={"np__art np__track-swap" + (playing ? " loop is-breathing" : "")}>
            <Tape w={78} rot={-4} style={{ top: -11, left: 34 }} />
            {track.cover ? (
              <img key={track.id} className="np__art-img" src={track.cover} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="np__art-img" style={{ display: "block", overflow: "hidden" }}>
                <span
                  className="np__art-glow"
                  style={{ background: `radial-gradient(closest-side, ${artPaletteOf(track.id)[2]}, transparent 72%)` }}
                  aria-hidden="true"
                />
                <TrackArt id={track.id} size={352} radius={20} />
              </span>
            )}
            <span className="np__art-badge">
              <IconPick size={40} style={{ position: "absolute", opacity: 0.16 }} />
              <b style={{ position: "relative" }}>{String(queueIndex + 1).padStart(2, "0")}</b>
            </span>
            <span className="np__stage-tag">{sc.artTag}</span>
            {struckId && <span className={"sheer is-on sheer--" + (sheerSide || "r")}></span>}
          </div>

          <div key={"info-" + track.id} className="np__info np__track-swap">
            <div className="np__setline" aria-label="演出状态">
              <span className="np__setline-act">{queueIndex >= queue.length - 2 ? sc.setEncore : sc.setMain}</span>
              <span className="np__setline-rule" aria-hidden="true"></span>
            </div>
            <h1 key={track.id} className="np__title">{track.title}</h1>
            <span key={track.id + "-sw"} className="np__title-sweep" aria-hidden="true"></span>
            <div className="np__band jp">
              {track.remote?.artistId ? (
                <button
                  className="np__band-link"
                  title={`去看 ${bandName} 的艺人页`}
                  onClick={() => {
                    openDiscoverDetail({ kind: "artist", id: track.remote!.artistId!, name: bandName, coverUrl: track.cover ?? undefined });
                    closePlayer();
                  }}
                >
                  {bandName}
                </button>
              ) : (
                <span>{bandName}</span>
              )}
            </div>
            {albumText ? (
              <div className="np__album" title={albumText}>
                <span className="eyebrow">{albumText}</span>
              </div>
            ) : null}
          </div>
        </section>

        <section key={track.id} className="np__lyric-swap" aria-label="歌词舞台">
          <LyricWall />
        </section>

        <aside className={"np__queue" + (queueOpen ? " is-open" : " is-collapsed")}>
          <Tape w={72} rot={-2} style={{ top: -10, left: "50%", marginLeft: -36 }} />
          <div className="np__queue-head">
            <div className="np__queue-headmain">
              <div className="np__queue-eyebrow">RUNNING ORDER</div>
              <div className="np__queue-title">{sc.setlistTitle}</div>
              <div className="np__queue-sub">
                {queueOpen
                  ? acts.length > 1
                    ? `分 ${acts.length} 幕 · 每幕四首`
                    : `${queue.length} 首 · 一口气听完`
                  : nextTrack
                    ? `下一首 · ${nextTrack.title}`
                    : "就这一首"}
              </div>
            </div>
            <span className="np__queue-count num">{queueOpen ? `共 ${queue.length} 首` : `还剩 ${remainMin} 分`}</span>
            <button
              className="np__queue-toggle"
              onClick={() => setQueueOpen((v) => !v)}
              aria-expanded={queueOpen}
              title={queueOpen ? "收起队列" : "展开队列"}
              aria-label={queueOpen ? "收起队列" : "展开队列"}
            >
              <IconChevronDown size={15} />
            </button>
          </div>

          {queueOpen ? (
            <>
              {queue.length === 0 ? (
                /* 空演出单：别只留一片灰，给个能立刻开演的下一步 */
                <div className="np__queue-empty">
                  <span className="np__queue-empty__pick" aria-hidden="true"><IconPick size={30} /></span>
                  <b>{sc.emptyTitle}</b>
                  <span className="hand">{sc.emptySub}</span>
                  <button className="btn btn-primary btn-sm" onClick={() => { setPage("online"); closePlayer(); }}>去发现挑歌</button>
                </div>
              ) : (
              <div className="np__queue-list scroll">
                <svg className="qpath" width="18" height="100%" viewBox="0 0 18 600" preserveAspectRatio="none" aria-hidden="true">
                  <path className="qpath__straight" d="M9 0 V600" vectorEffect="non-scaling-stroke" />
                  <path
                    className={"qpath__detour" + (shuffle ? " is-on" : "")}
                    d="M9 0 C-4 40, 22 70, 9 110 S -3 170, 9 210 S 21 280, 9 320 S -3 380, 9 420 S 21 490, 9 530 S -2 580, 9 600"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {acts.map((group, gi) => (
                  <div key={gi} className="np__queue-act">
                    {acts.length > 1 && (
                      <div className="act-sep">
                        <span className="act-sep__num">{["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ"][gi] ?? String(gi + 1)}</span>
                        <span className="act-sep__name">{sc.actNames[gi] ?? sc.actNames[3]}</span>
                        <span className={"act-sep__bar act-sep__bar--" + ((gi % 3) + 1)}></span>
                      </div>
                    )}
                    {group.map((t, i) => {
                      const idx = gi * (acts.length > 1 ? 4 : group.length) + i;
                      const isCur = t.id === track.id;
                      const isNext = nextTrack != null && t.id === nextTrack.id && !isCur;
                      return (
                        <button
                          key={t.id + idx}
                          className={"qrow" + (isCur ? " is-current" : "") + (isNext ? " is-next" : "") + (struckId === t.id ? " is-struck" : "")}
                          onClick={() => goTo(t.id)}
                        >
                          {isCur && playing ? (
                            <span className="qrow__playing"><i></i><i></i><i></i></span>
                          ) : (
                            <span className="qrow__no">{String(idx + 1).padStart(2, "0")}</span>
                          )}
                          <span className="qrow__art" aria-hidden="true">
                            {t.cover ? (
                              <img src={t.cover} alt="" loading="lazy" referrerPolicy="no-referrer" />
                            ) : (
                              <TrackArt id={t.id} size={22} radius={5} />
                            )}
                          </span>
                          <span className="qrow__name">
                            <span className="qrow__title" title={t.title}>{t.title}</span>
                            {isCur ? <span className="qrow__cue">NOW</span> : isNext ? <span className="qrow__cue qrow__cue--next">NEXT</span> : null}
                          </span>
                          <span className="qrow__dur">{fmt(t.dur)}</span>
                          {struckId === t.id && <Strike />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              )}
              {queue.length > 0 ? (
                <div className="np__queue-foot">
                  <span className="np__stagecall">
                    <span className="hand">{sc.remain(remainMin)}</span>
                    <IconPickOutline size={13} style={{ color: "var(--coral)", opacity: 0.6 }} />
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
        </aside>
      </div>

      {!keysHintSeen && !lyricsFull ? (
        <div className="np-hint" role="status">
          <span className="np-hint__text"><b>键盘</b><kbd>空格</kbd>播放<kbd>← →</kbd>切歌<kbd>?</kbd>全部</span>
          <button className="np-hint__go" onClick={() => { setKeysOpen(true); dismissKeysHint(); }}>快捷键</button>
          <button className="np-hint__close" onClick={dismissKeysHint} title="知道了" aria-label="知道了"><IconX size={11} /></button>
        </div>
      ) : null}

      {/* 控制台：上层是整场演出时间线，下层是「传输 · 进度 · 音量」一条 */}
      <footer className="np__console">
        <div className="np__timeline">
          <span className="np__timeline-label">
            {acts.length > 1
              ? `演出时间线 · 第 ${actIndex + 1} 幕 / 共 ${acts.length} 幕 · 第 ${queueIndex + 1} 首`
              : `演出时间线 · 第 ${queueIndex + 1} 首 / 共 ${queue.length} 首`}
          </span>
          <div className="np__timeline-track">
            {acts.length > 1
              ? acts.map((group, gi) => (
                  <button
                    key={group[0]?.id ?? gi}
                    className={"tl-seg" + (gi === actIndex ? " is-current" : "") + (gi < actIndex ? " is-past" : "")}
                    style={{ flexGrow: group.length }}
                    onClick={() => { const first = group[0]; if (first) goTo(first.id); }}
                    title={`第 ${gi + 1} 幕 · ${group[0]?.title ?? ""}`}
                    aria-label={`第 ${gi + 1} 幕`}
                  ></button>
                ))
              : queue.map((t, i) => (
                  <button
                    key={t.id + i}
                    className={"tl-seg" + (t.id === track.id ? " is-current" : "") + (i < queueIndex ? " is-past" : "")}
                    style={{ flexGrow: Math.max(0.4, t.dur / 60) }}
                    onClick={() => goTo(t.id)}
                    title={t.title}
                    aria-label={t.title}
                  ></button>
                ))}
          </div>
        </div>

        <div className="np__deck">
          <div className="np__controls">
            <button className={"np__ctrl" + (shuffle ? " is-on" : "")} onClick={(e) => { onomaAt(e.currentTarget, "シャッ", "mint"); toggleShuffle(); }} title="随机（绕路）">
              <IconShuffle size={18} />
            </button>
            <button className="np__ctrl" onClick={() => userSkip("prev")} title="上一首">
              <IconPrev size={20} />
            </button>
            <button className={"np__ctrl np__ctrl--main" + (playing ? " is-playing" : "")} onClick={() => setPlaying(!playing)} title={playing ? "暂停" : "播放"}>
              <PlayGlyph playing={playing} size={22} />
            </button>
            <button className="np__ctrl" onClick={() => userSkip("next")} title="下一首">
              <IconNext size={20} />
            </button>
            <button className={"np__ctrl" + (repeat !== "off" ? " is-on" : "")} onClick={cycleRepeat} title="循环">
              {repeat === "one" ? <IconRepeatOne size={18} /> : <IconRepeat size={18} />}
            </button>
            <span className="np__ctrl-sep"></span>
            <button
              className={"np__ctrl like-btn" + (liked ? " is-liked" : "")}
              onClick={(e) => {
                if (likeFired.current) { likeFired.current = false; return; }
                onomaAt(e.currentTarget, "ポンッ", "coral");
                if (!liked) flyHeart();
                toggleLike(track);
              }}
              onPointerDown={(e) => {
                likeFired.current = false;
                const btn = e.currentTarget;
                likeHold.current = setTimeout(() => {
                  likeFired.current = true;
                  likeCount.current += 1;
                  onomaAt(btn, "燃——", "coral");
                  if (!liked) { toggleLike(track); flyHeart(); }
                  discover("E19");
                  toast(eggText(palette, "longPressLike", likeCount.current), { hand: true });
                }, 1000);
              }}
              onPointerUp={cancelLikeHold}
              onPointerLeave={cancelLikeHold}
              onPointerCancel={cancelLikeHold}
              title="喜欢（盖一枚拨片）· 长按 1 秒是火焰"
            >
              {liked ? <IconPick size={19} /> : <IconPickOutline size={19} />}
              {heartSeq > 0 ? (
                <span key={heartSeq} className="np-heart-fly" aria-hidden="true">
                  <svg viewBox="0 0 20 18" width="16" height="15">
                    <path
                      d="M10 17C4 12.6.8 9.4.8 6.1.8 3.3 3 1.2 5.7 1.2c1.7 0 3.3.8 4.3 2.2 1-1.4 2.6-2.2 4.3-2.2 2.7 0 4.9 2.1 4.9 4.9 0 3.3-3.2 6.5-9.2 10.9z"
                      fill="var(--coral)"
                    />
                  </svg>
                </span>
              ) : null}
            </button>
          </div>

          <div className="np__seek">
            {showChorusHint && <span className="np__chorus-hint">要来了♡</span>}
            <div
              className={"np__progress" + (dragging ? " is-dragging" : "")}
              ref={barRef}
              role="slider"
              tabIndex={0}
              aria-label="播放进度"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, Math.round(total))}
              aria-valuenow={Math.round(pos)}
              aria-valuetext={`${fmt(pos)} / ${fmt(total)}`}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
                e.preventDefault();
                e.stopPropagation();
                const step = e.shiftKey ? 15 : 5;
                const next = e.key === "Home" ? 0 : e.key === "End" ? total : pos + (e.key === "ArrowRight" ? step : -step);
                api.seekTo(Math.max(0, Math.min(total, next)));
              }}
              onPointerDown={onDown}
              onPointerUp={onUp}
              onPointerLeave={() => setDragging(false)}
              onPointerMove={(e) => {
                if (dragging) api.seekTo(ratioFromEvent(e) * total);
              }}
              title="点击跳转 · ←→ 5s · Shift 15s"
            >
              <div className="np__progress-track" style={{ ["--p" as string]: String(pct / 100) }}>
                <div className="np__progress-fill"></div>
                {chorusPct != null && (
                  <span className="np__chorus-mark" style={{ left: chorusPct + "%" }}>
                    <IconPick size={13} />
                  </span>
                )}
                <span className="np__progress-knob" aria-hidden="true"></span>
              </div>
            </div>
            <div className="np__times">
              <span className="num np__times-pos">{fmt(pos)}</span>
              <button
                type="button"
                className="np__chorus-btn"
                onClick={() => markChorus(pos)}
                title="把当前进度记作副歌点"
                aria-label="把当前进度记作副歌点"
              >
                <IconPick size={12} />标副歌
              </button>
              <span className="num np__times-end">-{fmt(Math.max(0, total - pos))}</span>
            </div>
          </div>

          <div className="np__vol">
            <button
              className={"np__ctrl np__ctrl--sm" + (muted ? " is-on" : "")}
              onClick={toggleMute}
              aria-pressed={muted}
              title={muted ? "取消静音" : "静音（M）"}
            >
              <IconVolume size={15} />
            </button>
            <input
              className="vol__range"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              style={{ "--fill": `${Math.round((muted ? 0 : volume) * 100)}%` } as React.CSSProperties}
              onChange={(e) => setVolume(Number(e.currentTarget.value))}
              aria-label={"音量 " + Math.round((muted ? 0 : volume) * 100) + "%"}
              title={"音量 " + Math.round((muted ? 0 : volume) * 100) + "%"}
            />
          </div>
        </div>
        {palette === "gbc" ? (
          <div className="np__stream" aria-label="推流状态">
            <span className="np__stream-live"><i aria-hidden="true"></i>STREAM</span>
            <span className="num">{queueIndex + 1} / {queue.length} 首</span>
            <span className="np__stream-remain">剩余 {remainMin} 分</span>
          </div>
        ) : null}
      </footer>

      {shareOpen ? <ShareCard onClose={() => setShareOpen(false)} /> : null}
    </div>
  );
}
