/* 迷路漫游 · 原型 .wander（当前曲大封面 + 接下来三首） */
import { useAf } from "../context.js";
import { TrackArt } from "../art.js";
import { IconPause, IconPick, IconPlay, IconRefresh, IconSkip } from "../icons.js";
import { Tape } from "../ui.js";

const pad = (n: number): string => String(n).padStart(2, "0");
const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

export function RoamPage() {
  const af = useAf();
  const { track, queue, queueIndex, playing, setPlaying, userSkip, isLiked, toggleLike, goTo, shuffle, toggleShuffle, reportDislike } = af;
  const upcoming = [1, 2, 3]
    .map((k) => queue[(queueIndex + k) % Math.max(1, queue.length)])
    .filter(Boolean) as typeof queue;
  const liked = isLiked(track);
  const copies = ["还在找今晚的那首歌？♡", "不知道听什么的话，就让它自己走。", "切歌也算一种走路方式。"];
  const copy = copies[queueIndex % copies.length];

  return (
    <div className="wander roam" data-screen-label="迷路漫游">
      <span className="wander__glow wander__glow--a"></span>
      <span className="wander__glow wander__glow--b"></span>

      <div className="wander__inner">
        <div className="wander__eyebrow">
          <span className="eyebrow">迷路漫游</span>
          <span style={{ width: 14, height: 1, background: "var(--line-strong)" }}></span>
          <span className="meta">第 {pad(queueIndex + 1)} 首 / 共 {queue.length} 首</span>
        </div>

        <div className={"wander__cover-wrap" + (playing ? " loop is-breathing" : "")}>
          <Tape w={86} rot={-2.5} style={{ top: -11, left: "50%", marginLeft: -43 }} />
          {track.cover ? (
            <img key={track.id} className="wander__cover" src={track.cover} alt="" referrerPolicy="no-referrer" style={{ animation: "artIn .5s var(--ease) both" }} />
          ) : (
            <span className="wander__cover" style={{ display: "block", overflow: "hidden", animation: "artIn .5s var(--ease) both" }}>
              <TrackArt id={track.id || "wander"} size={264} radius={18} />
            </span>
          )}
          <span className="wander__badge" title="当前曲目编号">
            <IconPick size={44} style={{ opacity: 0.18 }} />
            <span style={{ position: "absolute", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--coral)" }}>
              {pad(queueIndex + 1)}
            </span>
          </span>
          <button
            className="icon-btn"
            onClick={() => setPlaying(!playing)}
            title={playing ? "暂停" : "播放"}
            style={{ position: "absolute", left: "50%", bottom: -18, transform: "translateX(-50%)", width: 44, height: 44, background: "var(--card)", boxShadow: "0 8px 20px rgba(61,43,57,.18)", color: "var(--pink-600)" }}
          >
            {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
          </button>
        </div>

        <h1 key={track.id} className="wander__title" style={{ marginTop: 16, animation: "fadeUp .4s var(--ease) both" }}>{track.title}</h1>
        <div className="wander__band jp">{track.artist} <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span> {track.album}</div>

        <div className="wander__actions acts">
          <button className="btn btn-ghost" onClick={() => userSkip("next")}>
            <IconSkip size={15} />跳过这首
          </button>
          <button className="btn btn-ghost" onClick={() => reportDislike(track)}>不喜欢 · 少推</button>
          <button className={"btn btn-ghost" + (liked ? " is-liked" : "")} onClick={() => toggleLike(track)} style={liked ? { color: "var(--coral)", borderColor: "rgba(198,42,63,.4)" } : undefined}>
            <IconPick size={14} />{liked ? "记下了" : "记下来"}
          </button>
          <button className="btn btn-primary" onClick={() => setPlaying(true)}>
            <IconPlay size={14} />继续听
          </button>
          <button className="btn btn-ghost" onClick={() => af.setPage("online")}>
            <IconRefresh size={14} />回发现换一批
          </button>
        </div>

        <p className="wander__copy">{copy}</p>
        <div className="wander__src">
          <span>漫游来源：当前队列 · 共 {queue.length} 首</span>
        </div>

        <div className="wander__queue">
          <div className="wander__queue-label">
            <span className="eyebrow">接下来</span>
            <button className={"chip chip--tag" + (shuffle ? " is-on" : "")} style={{ marginLeft: 6, cursor: "pointer" }} onClick={toggleShuffle}>
              {shuffle ? "绕路中" : "直着走"}
            </button>
          </div>
          <div className="wander__queue-rows">
            {upcoming.map((t, i) => (
              <button key={t.id + i} className="wander__qrow" onClick={() => goTo(t.id)} style={{ animationDelay: i * 50 + "ms" }}>
                <span>{pad(queueIndex + i + 2)}</span>
                <span className="truncate" style={{ textAlign: "left" }}>{t.title}</span>
                <span className="num" style={{ color: "var(--text-3)", fontSize: 10 }}>{fmt(t.dur)}</span>
              </button>
            ))}
            {upcoming.length === 0 ? <p className="lib-empty">队列里只有这一首。去发现页多挑几首。</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
