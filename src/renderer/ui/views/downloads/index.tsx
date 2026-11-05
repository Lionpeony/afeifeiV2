import { useEffect, useState } from "react";
import { dispatch, getState, subscribe } from "../../../kernel/index.js";
import { downloadRows, fmtBytes, fmtSpeed, type DownloadRow } from "../../../projection/download.js";
import type { Services } from "../../services.js";
import { PageHead } from "../../PageHead.js";
import { RoomBoard } from "../../live/RoomBoard.js";
import { boardProgram } from "../../../projection/room-program.js";
import { toast } from "../../toast.js";
import { NAME_TEMPLATE_DEFAULT, NAME_TEMPLATE_HINT } from "../../../domain/download/naming.js";
import {
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  DEFAULT_CONCURRENCY,
} from "../../../domain/download/settings.js";

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
  const [template, setTemplate] = useState(NAME_TEMPLATE_DEFAULT);
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY);
  const [settingsNote, setSettingsNote] = useState("");

  useEffect(() => {
    void services
      .downloadSettings()
      .then((s) => {
        setTemplate(s.template);
        setConcurrency(s.concurrency);
      })
      .catch(() => undefined);
  }, [services]);

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
    if (msg) toast(msg);
  };

  const saveSettings = async (): Promise<void> => {
    try {
      const saved = await services.setDownloadSettings({ template, concurrency });
      setTemplate(saved.template);
      setConcurrency(saved.concurrency);
      setSettingsNote("已保存；新任务按这个模板命名，并发立即生效。");
      toast("下载设置已保存");
    } catch (err) {
      setSettingsNote(err instanceof Error ? err.message : String(err));
    }
  };

  // 看板只读：状态迁移看得见，操作仍在下面的表格
  const board = boardProgram(rows.map((row) => ({ id: row.id, title: row.title, state: row.state })));

  return (
    <section className="library">
      <PageHead title="下载" meta="DOWNLOADS" />
      <div className="lib-head">
        <span className="badge">
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
        {note ? <span className="badge">{note}</span> : null}
      </div>

      {/* 下载设置（B-10）：模板只管文件名，目录另设；并发默认 2、上限 6 */}
      <div className="dl-settings">
        <label className="dl-set-field">
          文件名
          <input
            className="dl-template"
            value={template}
            aria-label="下载文件名模板"
            onChange={(e) => setTemplate(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveSettings();
            }}
          />
        </label>
        <label className="dl-set-field">
          并发
          <select
            value={concurrency}
            aria-label="同时下载数"
            onChange={(e) => setConcurrency(Number(e.target.value))}
          >
            {Array.from({ length: MAX_CONCURRENCY - MIN_CONCURRENCY + 1 }, (_, i) => i + MIN_CONCURRENCY).map(
              (n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ),
            )}
          </select>
        </label>
        <button type="button" className="primary" onClick={() => void saveSettings()}>
          保存设置
        </button>
      </div>
      {/* 说明单独一行：塞进上面那行会被 flex 挤成半截，用户看不到占位符全名 */}
      <p className="dl-settings-hint">
        {NAME_TEMPLATE_HINT}
        {concurrency > 3 ? " · 并发偏高，容易被上游限流" : ""}
        {settingsNote ? ` · ${settingsNote}` : ""}
      </p>

      <RoomBoard program={board} note="看板只显示状态；暂停 / 继续 / 删除在最下面的任务表里。" />

      <div className="lib-list">
        <div className="lib-thead dl-thead">
          <span className="th-title">TASK</span>
          <span className="th-artist">STATUS</span>
          <span className="th-actions">ACTION</span>
        </div>
        {rows.map((r) => (
          <div key={r.id} className="lib-row dl-row" title={r.destPath}>
            <span className="lib-title">{r.title}</span>
            <span className="lib-artist">
              {STATE_TEXT[r.state]}
              {r.pct !== null ? ` ${r.pct}%` : ""} · {fmtBytes(r.received)}
              {r.total > 0 ? ` / ${fmtBytes(r.total)}` : ""}
              {fmtSpeed(r.speed) ? ` · ${fmtSpeed(r.speed)}` : ""}
              {r.state === "error" && r.error ? ` · ${r.error}` : ""}
            </span>
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
