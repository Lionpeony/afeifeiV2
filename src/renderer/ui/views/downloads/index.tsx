import { useEffect, useState } from "react";
import { dispatch, getState, subscribe } from "../../../kernel/index.js";
import { downloadRows, fmtBytes, fmtSpeed, type DownloadRow } from "../../../projection/download.js";
import type { Services } from "../../services.js";
import { PageHead } from "../../PageHead.js";

const STATE_TEXT: Record<DownloadRow["state"], string> = {
  queued: "排队中",
  active: "下载中",
  paused: "已暂停",
  done: "已完成",
  error: "失败",
};

/**
 * 下载管理页（M7）。只渲染投影 + 发 intent：状态机在 store，策略在 domain，
 * 这里没有任何一行业务判断（50 §2 的环纪律）。
 */
export function DownloadsView({
  services,
  onRemove,
}: {
  services: Services;
  onRemove(id: string): Promise<void>;
}) {
  const [rows, setRows] = useState<DownloadRow[]>(downloadRows(getState()));
  const [usage, setUsage] = useState(0);
  const [note, setNote] = useState("");

  useEffect(
    () =>
      subscribe(() => {
        setRows(downloadRows(getState()));
      }),
    [],
  );

  useEffect(() => {
    void services.downloadUsage().then(setUsage).catch(() => undefined);
  }, [services, rows.length]);

  const act = (fn: () => void, msg?: string): void => {
    fn();
    if (msg) setNote(msg);
  };

  return (
    <section className="library">
      <PageHead title="下载" meta="DOWNLOADS" />
      <div className="lib-head">
        <span className="lib-count">
          已用 {fmtBytes(usage)} / 2GB · {rows.length} 个任务
        </span>
        <button
          type="button"
          onClick={() =>
            void services.setDownloadDir().then((dir) => {
              if (dir) setNote(`下载目录已改为 ${dir}（已有文件不搬，新任务生效）`);
            })
          }
        >
          更改下载目录
        </button>
        {note ? <span className="lib-count">{note}</span> : null}
      </div>

      <div className="lib-list">
        {rows.map((r) => (
          <div key={r.id} className="lib-row online-row" title={r.destPath}>
            <span className="lib-title">{r.title}</span>
            <span className="lib-artist">
              {STATE_TEXT[r.state]}
              {r.pct !== null ? ` ${r.pct}%` : ""} · {fmtBytes(r.received)}
              {r.total > 0 ? ` / ${fmtBytes(r.total)}` : ""}
              {fmtSpeed(r.speed) ? ` · ${fmtSpeed(r.speed)}` : ""}
            </span>
            {r.state === "error" && r.error ? <span className="lib-artist">{r.error}</span> : null}
            <span className="lib-actions">
              {r.state === "active" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    act(() => dispatch({ type: "download/pause", id: r.id }));
                  }}
                >
                  暂停
                </button>
              ) : null}
              {r.state === "paused" || r.state === "error" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    act(() => dispatch({ type: "download/resume", id: r.id }));
                  }}
                >
                  {r.state === "error" ? "重试" : "继续"}
                </button>
              ) : null}
              {r.state !== "done" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    act(() => dispatch({ type: "download/remove", id: r.id }), "已取消。");
                    void services.removeDownload(r.id);
                  }}
                >
                  取消
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onRemove(r.id).then(() => setNote("已删除。"));
                  }}
                >
                  删除
                </button>
              )}
            </span>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="lib-empty">还没有下载任务。在「在线」页点歌名旁的「下载」。</p>
        ) : null}
      </div>
    </section>
  );
}
