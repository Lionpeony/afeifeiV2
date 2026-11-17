/* 播放历史 · 原型 .page（按天分堆 + 统计 + 再听一次） */
import { useState } from "react";

import { useAf } from "../context.js";
import { TrackArt } from "../art.js";
import { IconPlay } from "../icons.js";
import { EmptySetlist } from "../ui.js";

const dayStart = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const dayLabel = (t: number): string => {
  const diff = Math.round((dayStart(Date.now()) - dayStart(t)) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(t).getDay()];
  const d = new Date(t);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};
const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function HistoryPage() {
  const af = useAf();
  const [confirmClear, setConfirmClear] = useState(false);
  const rows = af.history
    .map((h) => ({ ...h, track: af.resolveTrack(h.id) }))
    .filter((r) => r.track && r.track.title && r.track.title !== r.id);
  const groups: { key: number; label: string; items: typeof rows }[] = [];
  for (const r of rows) {
    const key = dayStart(r.at);
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(r);
    else groups.push({ key, label: dayLabel(r.at), items: [r] });
  }
  const totalPlays = rows.reduce((a, r) => a + (af.plays[r.id] || 1), 0);
  const todayCount = rows.filter((r) => dayStart(r.at) === dayStart(Date.now())).length;
  const ids = rows.map((r) => r.id);

  return (
    <div className="page" data-screen-label="播放历史">
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>HISTORY · {rows.length} 条记录</div>
          <h1 className="display">播放历史</h1>
          <p className="body" style={{ marginTop: 8, maxWidth: 460 }}>听过什么，台侧都记着。按天分堆，最近的排在最上面。</p>
        </div>
        <div className="page-head__aside">
          <div className="row gap8">
            {rows.length > 0 ? (
              <button className="btn btn-ghost btn-sm" onClick={() => af.playIds(ids)}>
                <IconPlay size={13} />从最近开始放
              </button>
            ) : null}
            <button
              className={"btn btn-sm " + (confirmClear ? "btn-primary" : "btn-ghost")}
              onClick={() => {
                if (!rows.length) { af.toast("还没有记录可以清", { hand: true }); return; }
                if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3600); return; }
                af.clearHistory();
                setConfirmClear(false);
                af.toast("历史清空了，歌单不受影响", { hand: true });
              }}
            >
              {confirmClear ? "确认清空" : "清空历史"}
            </button>
          </div>
        </div>
      </div>

      <div className="hist__stats">
        <div className="hist__stat"><b>{rows.length}</b><span>条播放记录</span></div>
        <div className="hist__stat"><b>{todayCount}</b><span>今天听过的</span></div>
        <div className="hist__stat"><b>{new Set(rows.map((r) => r.id)).size}</b><span>首不同的歌</span></div>
        <div className="hist__stat"><b>{totalPlays}</b><span>累计播放次数</span></div>
      </div>

      {rows.length === 0 ? (
        <EmptySetlist title="还没有人开过口。" sub="从发现页随便点一首，这里就开始记账了。" cta="去听一首" onGo={() => af.setPage("online")} />
      ) : (
        groups.map((g) => (
          <section className="hist__group" key={g.key}>
            <div className="hist__group-title">
              {g.label}<i></i><span style={{ letterSpacing: 0, textTransform: "none" }}>{g.items.length} 条</span>
            </div>
            {g.items.map((r, i) => {
              const t = r.track;
              const isCur = af.currentId === t.id;
              const groupIds = g.items.map((x) => x.id);
              return (
                <button key={r.at + t.id + i} className="hist__row" onClick={() => af.playIds(groupIds, i)} title={"再听一次 · " + t.title}>
                  <span className="hist__time">
                    {String(new Date(r.at).getHours()).padStart(2, "0")}:{String(new Date(r.at).getMinutes()).padStart(2, "0")}
                  </span>
                  <span className="hist__cover">{t.cover ? <img src={t.cover} alt="" referrerPolicy="no-referrer" /> : <TrackArt id={t.id} size={34} radius={8} />}</span>
                  <span className="hist__name truncate" style={isCur ? { color: "var(--pink-700)", fontWeight: 600 } : undefined}>{t.title}</span>
                  <span className="hist__artist truncate">{t.artist || "—"}</span>
                  <span className="hist__count">{af.plays[r.id] || 1} 次</span>
                  <span className="hist__dur">{fmt(t.dur)}</span>
                </button>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
