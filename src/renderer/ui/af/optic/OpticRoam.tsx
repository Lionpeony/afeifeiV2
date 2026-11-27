import { useRef, useState } from "react";
import { useAf } from "../context.js";
import { TrackArt } from "../art.js";
import { IconHeart, IconHeartFill, IconPause, IconPlay, IconRefresh, IconSkip } from "../icons.js";
import { OpticEmptyScreen } from "./OpticEmptyScreen.js";
import { OpticSpringSeg } from "./OpticSpringSeg.js";
import { OpticVuMeter } from "./OpticVuMeter.js";

const pad = (n: number): string => String(n).padStart(2, "0");
const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

/**
 * 光学漫游叠卡台（docs/34 v3.0 §5 #3，仅 palette="default" 渲染）。
 * 左主台：3D 透视亚克力唱片叠卡（支持指针水平拖拽甩切）+ 3 颗大号厚玻璃实体操控键；
 * 右仪台：深黑点阵电台状态屏（真实 8 柱频谱 + 弹簧顺序/随机切换）+ 阴刻待播槽。
 */
export function OpticRoam() {
  const af = useAf();
  const {
    track,
    queue,
    queueIndex,
    playing,
    setPlaying,
    userSkip,
    isLiked,
    toggleLike,
    goTo,
    shuffle,
    toggleShuffle,
    reportDislike,
  } = af;

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  const upcoming = [1, 2, 3, 4]
    .map((k) => queue[(queueIndex + k) % Math.max(1, queue.length)])
    .filter(Boolean) as typeof queue;
  const liked = isLiked(track);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    startX.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragX(Math.max(-180, Math.min(180, e.clientX - startX.current)));
  };
  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (dragX < -78) userSkip("next");
    else if (dragX > 78) userSkip("prev");
    setDragX(0);
  };

  if (queue.length === 0) {
    return (
      <div className="page optic-roam-wrap" data-screen-label="迷路漫游">
        <OpticEmptyScreen
          code="ROAM · STANDBY"
          title="当前队列还没有曲目"
          sub="去发现页挑一张歌单或每日推荐，漫游唱片台会自动接管后续播放。"
          ctaLabel="前往发现页"
          onCta={() => af.setPage("online")}
        />
      </div>
    );
  }

  return (
    <div className="page optic-roam" data-screen-label="迷路漫游">
      {/* 左主台：3D 透视亚克力唱片叠卡 + 实体厚玻璃大键 */}
      <section className="optic-roam__stage" aria-label="光学唱片叠卡台">
        {track.cover ? (
          <img className="optic-roam__amb" src={track.cover} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
        ) : null}
        <span className="optic-hero__wash" aria-hidden="true" />

        <div className="optic-roam__deck">
          {/* 背后 2 张微倾底卡 */}
          {upcoming[1] ? (
            <div className="optic-roam__ghost optic-roam__ghost--2" aria-hidden="true">
              {upcoming[1].cover ? <img src={upcoming[1].cover} alt="" referrerPolicy="no-referrer" /> : <TrackArt id={upcoming[1].id} size={240} radius={16} />}
            </div>
          ) : null}
          {upcoming[0] ? (
            <div className="optic-roam__ghost optic-roam__ghost--1" aria-hidden="true">
              {upcoming[0].cover ? <img src={upcoming[0].cover} alt="" referrerPolicy="no-referrer" /> : <TrackArt id={upcoming[0].id} size={240} radius={16} />}
            </div>
          ) : null}

          {/* 主亚克力唱片卡（可拖拽水平甩切） */}
          <div
            className={"optic-roam__card" + (dragging ? " is-dragging" : "")}
            style={{
              transform: dragX !== 0 ? `translate3d(${dragX}px, 0, 0) rotate(${(dragX * 0.045).toFixed(2)}deg)` : undefined,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            title="左右拖拽可切歌"
          >
            {track.cover ? (
              <img key={track.id} src={track.cover} alt="" draggable={false} referrerPolicy="no-referrer" />
            ) : (
              <TrackArt id={track.id || "roam"} size={280} radius={20} />
            )}
            <span className="optic-jewel-spine" aria-hidden="true" />
            <span className="optic-hero__glass" aria-hidden="true" />
            <span className="optic-roam__idx num">{pad(queueIndex + 1)} / {pad(queue.length)}</span>
          </div>
        </div>

        <div className="optic-roam__meta">
          <h2 className="optic-roam__title truncate">{track.title}</h2>
          <p className="optic-roam__sub truncate">
            {track.artist}{track.album ? ` · ${track.album}` : ""}
          </p>
        </div>

        <div className="optic-roam__ctrls">
          <button type="button" className="optic-roam__key" onClick={() => userSkip("next")} title="跳过这首" aria-label="跳过这首">
            <IconSkip size={18} />
          </button>
          <button
            type="button"
            className="optic-roam__key optic-roam__key--play"
            onClick={() => setPlaying(!playing)}
            title={playing ? "暂停" : "播放"}
            aria-label={playing ? "暂停" : "播放"}
          >
            {playing ? <IconPause size={22} /> : <IconPlay size={22} />}
          </button>
          <button
            type="button"
            className={"optic-roam__key" + (liked ? " is-liked" : "")}
            onClick={() => toggleLike(track)}
            title={liked ? "取消喜欢" : "喜欢"}
            aria-label={liked ? "取消喜欢" : "喜欢"}
          >
            {liked ? <IconHeartFill size={18} /> : <IconHeart size={18} />}
          </button>
        </div>

        <div className="optic-roam__minor">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => reportDislike(track)}>
            不喜欢 · 少推
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => af.setPage("online")}>
            <IconRefresh size={13} />回发现换一批
          </button>
        </div>
      </section>

      {/* 右仪台：深黑点阵电台遥测屏 + 阴刻待播槽 */}
      <aside className="optic-roam__side" aria-label="漫游电台状态与待播">
        <div className="optic-screen">
          <div className="optic-screen__top">
            <div className="optic-roam__telemetry">
              <span className="optic-stat__label">ROAM DECK</span>
              <b className="optic-roam__state">{playing ? "ON AIR · LIVE" : "STANDBY"}</b>
            </div>
            <OpticVuMeter bins={8} rows={5} playing={playing} />
          </div>
          <div className="optic-screen__foot">
            <span className="optic-screen__src">
              <i className={"optic-led" + (playing ? " is-on" : "")} aria-hidden="true" />
              QUEUE {pad(queueIndex + 1)}/{pad(queue.length)}
            </span>
            <span>DRAG CARD ⇄ SKIP</span>
          </div>
        </div>

        <div className="optic-well-panel">
          <div className="optic-panel-head">
            <span className="optic-kicker">UP NEXT</span>
            <OpticSpringSeg
              size="sm"
              ariaLabel="漫游播放顺序"
              value={shuffle ? "shuffle" : "order"}
              options={[
                { id: "order", label: "顺序" },
                { id: "shuffle", label: "随机" },
              ]}
              onChange={(m) => {
                if ((m === "shuffle") !== shuffle) toggleShuffle();
              }}
            />
          </div>
          <div className="optic-well-list">
            {upcoming.map((t, i) => (
              <button key={t.id + i} type="button" className="optic-row" onClick={() => goTo(t.id)}>
                <span className="optic-row__no num">{pad(queueIndex + i + 2)}</span>
                <span className="optic-row__art" aria-hidden="true">
                  {t.cover ? <img src={t.cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <TrackArt id={t.id} size={32} radius={6} />}
                </span>
                <span className="optic-row__meta">
                  <b className="truncate">{t.title}</b>
                  <span className="truncate">{t.artist}</span>
                </span>
                <span className="optic-row__dur num">{fmt(t.dur)}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
