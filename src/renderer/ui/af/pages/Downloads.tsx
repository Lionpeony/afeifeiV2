/* 下载管理 · 原型 .page.loc（下载中 / 已完成 + 拨片进度） */
import { useEffect, useState } from "react";

import { dispatch, getState, subscribe } from "../../../kernel/index.js";
import { useAf } from "../context.js";
import { OpticEmptyScreen } from "../optic/OpticEmptyScreen.js";
import { OpticSpringSeg } from "../optic/OpticSpringSeg.js";
import { TrackArt } from "../art.js";
import { IconDownload, IconPause, IconPlay, IconRefresh, IconX } from "../icons.js";
import { EmptySetlist, PageHead } from "../ui.js";
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
  const failed = tasks.filter((r) => r.state === "error");
  const srcName = (id: string): string => af.sources.find((s) => s.id === id)?.name ?? id;
  /* 取消/删除必须连文件一起清：只摘列表会让文件留在下载目录，下次扫描又冒出来。 */
  const removeTask = (d: { id: string; destPath: string }): void => {
    void window.api.downloadCancel(d.id).catch(() => undefined);
    dispatch({ type: "download/remove", id: d.id });
    void window.api.downloadRemove(d.destPath).catch(() => undefined);
  };

  return (
    <div className="page loc" data-screen-label="下载管理">
      <PageHead
        eyebrow="DOWNLOADS · 缓存目录"
        title="下载管理"
        sub="下载只是把音源那边的文件存到本地缓存，卸载时就一起清掉。"
        aside={
          <div className="row gap8">
            <button className="btn btn-ghost btn-sm" onClick={() => af.setPage("online")}>
              <IconRefresh size={13} />去发现页找歌
            </button>
          </div>
        }
      />

      <div className="loc__tabs">
        {af.palette === "default" ? (
          <OpticSpringSeg
            ariaLabel="本地与下载切换"
            value="downloads"
            options={[
              { id: "local", label: "本地音乐" },
              { id: "downloads", label: "下载管理", badge: tasks.length + done.length },
            ]}
            onChange={(p) => af.setPage(p)}
          />
        ) : (
          <>
            <button className="loc__tab" onClick={() => af.setPage("local")}>本地音乐</button>
            <button className="loc__tab is-on" onClick={() => af.setPage("downloads")}>下载管理</button>
          </>
        )}
        <span className="spacer"></span>
        <span className="meta num">{tasks.length + done.length} 个任务</span>
      </div>

      <div className="loc__sect">
        <h2 className="sect-title">下载中<span>IN PROGRESS</span></h2>
        <span className="meta num">{tasks.length} 个任务</span>
        {failed.length > 0 ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => failed.forEach((d) => dispatch({ type: "download/retry", id: d.id }))}
          >
            <IconRefresh size={13} /> 全部重试
          </button>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        af.palette === "default" ? (
          <OpticEmptyScreen
            code="NO ACTIVE DOWNLOADS"
            title="没有正在下载的曲目"
            sub="在任意曲目上右键即可加入离线下载队列。"
            ctaLabel="去歌单挑一首"
            onCta={() => af.setPage("playlists")}
          />
        ) : (
          <EmptySetlist title="没有正在下载的歌。" sub="在曲目上右键就能下一首，慢慢来。" cta="去歌单挑一首" onGo={() => af.setPage("playlists")} />
        )
      ) : (
        <div className="dl-list">
          {tasks.map((d) => {
            const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0;
            return (
              <div key={d.id} className="dl-row">
                <span className="dl-row__art"><TrackArt id={d.id} size={44} radius={10} /></span>
                <span className="dl-row__main">
                  <span className="dl-row__title truncate">{d.title}</span>
                  <span className="dl-row__meta truncate">
                    {srcName(d.sourceId)} · {fmtSize(d.total)} · {STATE_TEXT[d.state] ?? d.state} {fmtSpeed(d.speed)}
                    {d.state === "error" && d.error ? ` · ${d.error}` : ""}
                  </span>
                  <span className="dl-bar">
                    <i style={{ width: pct + "%" }}></i>
                    <span className="dl-bar__pick"><IconDownload size={11} /></span>
                  </span>
                </span>
                <span className="dl-row__pct num">{d.state === "error" ? "失败" : d.total > 0 ? pct + "%" : "…"}</span>
                <button
                  className="icon-btn"
                  title={d.state === "error" ? "重试" : d.state === "paused" ? "继续" : "暂停"}
                  onClick={() =>
                    dispatch({
                      type: d.state === "error" ? "download/retry" : d.state === "paused" ? "download/resume" : "download/pause",
                      id: d.id,
                    })
                  }
                >
                  {d.state === "error" ? <IconRefresh size={14} /> : d.state === "paused" ? <IconPlay size={14} /> : <IconPause size={14} />}
                </button>
                <button className="icon-btn" title="取消" onClick={() => removeTask(d)}>
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
        {done.length > 0 ? (
          <button className="btn btn-ghost btn-sm" onClick={() => done.forEach(removeTask)}>
            <IconX size={13} /> 清空已完成
          </button>
        ) : null}
      </div>

      <div className="paper loc__sheet">
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
              <button className="icon-btn" title="删除" onClick={(e) => { e.stopPropagation(); removeTask(d); }}>
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
