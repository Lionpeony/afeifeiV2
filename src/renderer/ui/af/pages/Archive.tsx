/* 演出档案 · 原型 .page（按日期归档 + 我记下的 + 今晚的） */
import { useEffect, useState } from "react";

import { getTracks, subscribe as subLibrary } from "../../../domain/library/state.js";
import { getLikes, subscribe as subLikes } from "../../../domain/likes/index.js";
import { useAf } from "../context.js";
import { TrackArt } from "../art.js";
import { IconBack, IconChevronRight, IconPickOutline, IconPlay } from "../icons.js";
import { EmptySetlist, Tape } from "../ui.js";

const pad = (n: number): string => String(n).padStart(2, "0");
const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const dayStart = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function ArchivePage() {
  const af = useAf();
  const [, setRev] = useState(0);
  useEffect(() => subLibrary(() => setRev((r) => r + 1)), []);
  useEffect(() => subLikes(() => setRev((r) => r + 1)), []);
  const [openId, setOpenId] = useState<string | null>(null);

  const likedTracks = getTracks().filter((t) => getLikes().has(t.id));
  const groups: { key: number; day: string; mon: string; title: string; venue: string; note: string; ids: string[] }[] = [];
  for (const h of af.history) {
    const key = dayStart(h.at);
    const g = groups.find((x) => x.key === key);
    if (g) g.ids.push(h.id);
    else {
      const d = new Date(h.at);
      groups.push({
        key,
        day: pad(d.getDate()),
        mon: MON[d.getMonth()],
        title: `${d.getMonth() + 1} 月 ${d.getDate()} 日的排练`,
        venue: "地下室 B1",
        note: groups.length === 0 ? "最近一次" : "再往前",
        ids: [h.id],
      });
    }
  }
  const tonight = groups[0]?.key === dayStart(Date.now()) ? groups[0].ids : [];
  const items = af.archiveFilter === "liked" ? likedTracks.map((t) => t.id) : af.archiveFilter === "tonight" ? tonight : groups[0]?.ids ?? [];

  return (
    <div className="page" data-screen-label="演出档案">
      <div className="page-head">
        <div>
          <button className="crumb" onClick={() => af.setPage("online")}><IconBack size={13} />返回发现</button>
          <div className="eyebrow" style={{ marginBottom: 10 }}>乐馆 · 演出档案库</div>
          <h1 className="display">每一次上台，<span className="marker">都留了档</span></h1>
          <p className="body" style={{ marginTop: 10, maxWidth: 460 }}>按演出整理的曲目单。有的场次只来了七个人，也记着。</p>
        </div>
      </div>

      <div className="row gap8" style={{ marginBottom: 26 }}>
        {[
          { id: "all", label: "全部档案" },
          { id: "liked", label: "我记下的" },
          { id: "tonight", label: "今晚的" },
        ].map((f) => (
          <button key={f.id} className={"chip" + (af.archiveFilter === f.id ? " is-on" : "")} onClick={() => af.setArchiveFilter(f.id)}>{f.label}</button>
        ))}
        <span className="spacer"></span>
        <span className="meta">共 {af.archiveFilter === "liked" ? likedTracks.length : af.archiveFilter === "tonight" ? tonight.length : groups.length} 项</span>
      </div>

      {af.archiveFilter === "liked" && likedTracks.length === 0 ? (
        <div style={{ maxWidth: 520 }}><EmptySetlist onGo={() => af.setPage("online")} /></div>
      ) : af.archiveFilter !== "all" ? (
        <div className="paper" style={{ padding: "20px 22px" }}>
          <Tape w={70} rot={-3} style={{ top: -9, left: 34 }} />
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div className="h2">{af.archiveFilter === "liked" ? "我记下的" : "今晚的曲目"}</div>
              <div className="meta" style={{ marginTop: 3 }}>{af.archiveFilter === "liked" ? "盖了拨片印记的都在这里。" : "公告墙上那张 setlist，抄了一遍。"}</div>
            </div>
            <button className="btn btn-primary btn-sm" disabled={!items[0]} onClick={() => items[0] && af.playIds(items)}>
              <IconPlay size={13} />全部播放
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
            {items.map((id, i) => {
              const t = af.resolveTrack(id);
              return (
                <button key={id + i} className={"archive-track" + (id === af.currentId ? " is-current" : "") + (af.struckId === id ? " is-struck" : "")} onClick={() => af.playIds(items, i)}>
                  <TrackArt id={id} size={26} radius={6} />
                  <span className="archive-track__no">{pad(i + 1)}</span>
                  <span style={{ minWidth: 0 }}><span className="truncate" style={{ display: "block" }}>{t.title}</span><span className="meta" style={{ fontSize: 10 }}>{t.artist}</span></span>
                  <span className="archive-track__dur">{fmt(t.dur)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="archive-grid">
          <div style={{ position: "relative" }}>
            <div className="poster">
              <span className="poster__art" style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#FF9EBB,#B8A9E8 62%,#9A8FD6)" }} />
              <div className="poster__vert"><span>本日ノ出演</span><span>セットリスト</span></div>
              <div className="poster__overlay">
                <span className="poster__no">ARCHIVE NO. 001</span>
                <span className="poster__title">空白小节<br />第一次上台</span>
                <span className="poster__meta">10.19 · 小剧场「回声」· 47 人到场</span>
              </div>
            </div>
            <div className="row gap8" style={{ marginTop: 18, justifyContent: "space-between" }}>
              <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>这张海报是事后补画的</span>
              <button className="icon-btn" onClick={() => groups[0] && af.playIds(groups[0].ids)} title="播放这一场"><IconPlay size={16} /></button>
            </div>
          </div>

          <div>
            <div className="archive-list">
              {groups.length === 0 ? (
                <EmptySetlist title="还没有演出档案。" sub="听过一首歌，这里就会记下一页。" cta="去发现页" onGo={() => af.setPage("online")} />
              ) : (
                groups.map((a) => {
                  const isOpen = openId === a.title;
                  const sum = a.ids.reduce((s, id) => s + af.resolveTrack(id).dur, 0);
                  return (
                    <div key={a.key}>
                      <button className={"archive-row" + (isOpen ? " is-open" : "")} onClick={() => setOpenId(isOpen ? null : a.title)}>
                        <span className="archive-row__date"><span className="archive-row__day">{a.day}</span><span className="archive-row__mon">{a.mon}</span></span>
                        <span style={{ minWidth: 0 }}>
                          <span className="archive-row__title">{a.title}</span>
                          <span className="archive-row__sub"><span>{a.venue}</span><span style={{ width: 3, height: 3, borderRadius: 9, background: "var(--text-3)" }}></span><span className="hand" style={{ fontSize: 11 }}>{a.note}</span></span>
                        </span>
                        <span className="archive-row__right"><span className="archive-row__count">{a.ids.length} 首 · {Math.round(sum / 60)}′</span><span className="archive-row__chev"><IconChevronRight size={15} /></span></span>
                      </button>
                      {isOpen ? (
                        <div className="archive-tracks">
                          <div className="row" style={{ justifyContent: "space-between", padding: "0 8px 6px" }}>
                            <span className="eyebrow">曲目单</span>
                            <button className="demo-link" style={{ color: "var(--pink-700)", textDecoration: "none" }} onClick={() => af.playIds(a.ids)}>从头听 →</button>
                          </div>
                          {a.ids.map((id, i) => {
                            const t = af.resolveTrack(id);
                            return (
                              <button key={id + i} className={"archive-track" + (id === af.currentId ? " is-current" : "")} onClick={() => af.playIds(a.ids, i)}>
                                <TrackArt id={id} size={26} radius={6} />
                                <span className="archive-track__no">{pad(i + 1)}</span>
                                <span style={{ minWidth: 0 }}><span className="truncate" style={{ display: "block" }}>{t.title}</span><span className="meta" style={{ fontSize: 10 }}>{t.artist}</span></span>
                                <span className="archive-track__dur">{fmt(t.dur)}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            <div className="row gap8" style={{ marginTop: 18, paddingLeft: 14 }}>
              <IconPickOutline size={14} style={{ color: "var(--coral)" }} />
              <span className="meta">收藏的曲目会盖一枚拨片，出现在「我记下的」里。</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
