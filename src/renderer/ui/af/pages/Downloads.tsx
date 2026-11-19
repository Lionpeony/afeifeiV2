/* 下载管理 · 原型 .page.loc（下载中 / 已完成 + 拨片进度） */
import { useEffect, useState } from "react";

import { dispatch, getState, subscribe } from "../../../kernel/index.js";
import { useAf } from "../context.js";
import { TrackArt } from "../art.js";
import { IconDownload, IconPause, IconPlay, IconRefresh, IconX } from "../icons.js";
import { EmptySetlist, Tape } from "../ui.js";
import { packLineCopy } from "../copy.js";

const fmtSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "—";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
};
const fmtSpeed = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "";
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB/s` : `${Math.round(kb)} KB/s`;
};
const STATE_TEXT: Record<string, string> = { queued: "排队中", active: "下载中", paused: "已暂停", done: "已完成", error: "失败" };

export function DownloadsPage() {
  const af = useAf();
  const [rows, setRows] = useState(() => [...getState().download.items]);

  useEffect(() => subscribe(() => setRows([...getState().download.items])), []);

  const tasks = rows.filter((r) => r.state !== "done");
  const done = rows.filter((r) => r.state === "done");
  const srcName = (id: string): string => af.sources.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="page loc" data-screen-label="下载管理">
      <div className="loc__head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>DOWNLOADS · 缓存目录</div>
          <h1 className="display">下载管理</h1>
          <p className="body" style={{ marginTop: 10, maxWidth: 460 }}>下载只是把音源那边的文件存到本地缓存，卸载时就一起清掉。</p>
        </div>
        <div className="row gap8">
          <button className="btn btn-ghost btn-sm" onClick={() => af.setPage("online")}>
            <IconRefresh size={13} />去发现页找歌
          </button>
        </div>
      </div>

      <div className="loc__tabs">
        <button className="loc__tab" onClick={() => af.setPage("local")}>本地音乐</button>
        <button className="loc__tab is-on" onClick={() => af.setPage("downloads")}>下载管理</button>
        <span className="spacer"></span>
        <span className="meta num">{tasks.length + done.length} 个任务</span>
      </div>

      <div className="loc__sect">
        <h2 className="sect-title">下载中<span>IN PROGRESS</span></h2>
        <span className="meta num">{tasks.length} 个任务</span>
      </div>

      {tasks.length === 0 ? (
        <EmptySetlist title="没有正在下载的歌。" sub="在曲目上右键就能下一首，慢慢来。" cta="去歌单挑一首" onGo={() => af.setPage("playlists")} />
      ) : (
        <div className="dl-list">
          {tasks.map((d) => {
            const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0;
            return (
              <div key={d.id} className="dl-row">
                <span className="dl-row__art"><TrackArt id={d.id} size={44} radius={10} /></span>
                <span className="dl-row__main">
                  <span className="dl-row__title truncate">{d.title}</span>
                  <span className="dl-row__meta truncate">{srcName(d.sourceId)} · {fmtSize(d.total)} · {STATE_TEXT[d.state] ?? d.state} {fmtSpeed(d.speed)}</span>
                  <span className="dl-bar">
                    <i style={{ width: pct + "%" }}></i>
                    <span className="dl-bar__pick"><IconDownload size={11} /></span>
                  </span>
                </span>
                <span className="dl-row__pct num">{d.total > 0 ? pct + "%" : "…"}</span>
                <button className="icon-btn" title={d.state === "paused" ? "继续" : "暂停"} onClick={() => dispatch({ type: d.state === "paused" ? "download/resume" : "download/pause", id: d.id })}>
                  {d.state === "paused" ? <IconPlay size={14} /> : <IconPause size={14} />}
                </button>
                <button className="icon-btn" title="取消" onClick={() => dispatch({ type: "download/remove", id: d.id })}>
                  <IconX size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="loc__sect" style={{ marginTop: 28 }}>
        <h2 className="sect-title">已完成<span>FINISHED</span></h2>
        <span className="meta num">{done.length} 首</span>
      </div>

      <div className="paper loc__sheet">
        <Tape w={64} rot={-1.6} style={{ top: -9, left: 28 }} />
        {done.length === 0 ? (
          <p className="lib-empty">{packLineCopy(af.palette, "emptyDownloads")}</p>
        ) : (
          done.map((d) => (
            <div key={d.id} className="loc-row" role="button" tabIndex={0} onClick={() => { af.goTo(d.destPath); af.openPlayer(); }} onKeyDown={(e) => { if (e.key === "Enter") { af.goTo(d.destPath); af.openPlayer(); } }}>
              <span className="loc-row__art"><TrackArt id={d.id} size={36} radius={8} /></span>
              <span className="loc-row__main">
                <span className="loc-row__title truncate">{d.title}</span>
                <span className="loc-row__path truncate">{srcName(d.sourceId)} · {d.destPath}</span>
              </span>
              <span className="loc-row__tag loc-row__tag--done">已下载</span>
              <span className="loc-row__fmt num">{fmtSize(d.total)}</span>
              <span className="loc-row__dur num">完成</span>
              <button className="icon-btn" title="播放" onClick={(e) => { e.stopPropagation(); af.goTo(d.destPath); af.openPlayer(); }}>
                <IconPlay size={15} />
              </button>
              <button className="icon-btn" title="删除" onClick={(e) => { e.stopPropagation(); dispatch({ type: "download/remove", id: d.id }); }}>
                <IconX size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="row gap8" style={{ marginTop: 18 }}>
        <IconDownload size={13} style={{ color: "var(--text-3)" }} />
        <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>进度条上的拨片走到头，这首就落地了。</span>
      </div>
    </div>
  );
}
