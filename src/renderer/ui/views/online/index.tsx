import { useEffect, useState } from "react";
import type { RemoteTrack } from "../../../../contracts/capability.js";

export interface SourceOption {
  id: string;
  name: string;
  canAuth: boolean;
}

export interface OnlineViewProps {
  sources: SourceOption[];
  onSearch(sourceId: string, keyword: string): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  /** 抛错时由本组件把错误文案显示出来 —— 界面只认人话，不认错误码。 */
  onPlay(sourceId: string, track: RemoteTrack): Promise<void>;
}

const pad = (n: number): string => String(n).padStart(2, "0");

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/**
 * 在线页（M3）：音源选择 + 搜索 + 结果。
 *
 * 音源列表来自注册表，**不写死** —— 加第三家源时这个下拉框自动多一项。
 * 点一首能不能播由能力声明决定：demo 源声明了 canGetUrl 但实现里明确抛错，
 * 正好验证"能力缺失/不支持"的提示链路。
 */
export function OnlineView({ sources, onSearch, onPlay }: OnlineViewProps) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<RemoteTrack[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sourceId && sources[0]) setSourceId(sources[0].id);
  }, [sources, sourceId]);

  const run = async (): Promise<void> => {
    if (!sourceId) return;
    setBusy(true);
    setNote("");
    try {
      const result = await onSearch(sourceId, keyword);
      setRows(result.items);
      if (result.items.length === 0) setNote("没搜到。换个词试试。");
    } catch (err) {
      setRows([]);
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const play = async (track: RemoteTrack): Promise<void> => {
    setNote("");
    try {
      await onPlay(sourceId, track);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="library">
      <div className="lib-head">
        <select
          className="source-pick"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.canAuth ? "" : "（免登录）"}
            </option>
          ))}
        </select>
        <input
          className="search"
          value={keyword}
          placeholder="搜索在线歌曲"
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
        />
        <button type="button" onClick={() => void run()} disabled={busy}>
          {busy ? "搜索中…" : "搜索"}
        </button>
        <span className="lib-count">{rows.length > 0 ? `${rows.length} 条` : ""}</span>
      </div>

      {note ? <p className="lib-note">{note}</p> : null}

      <div className="lib-list">
        {rows.map((track) => (
          <div
            key={track.sourceId}
            className="lib-row online-row"
            onClick={() => void play(track)}
            title={`${track.title} — ${track.artist}`}
          >
            <span className="lib-title">{track.title}</span>
            <span className="lib-artist">{track.artist}</span>
            <span className="lib-artist">{track.album}</span>
            <span className="lib-dur">{fmtDuration(track.durationMs)}</span>
          </div>
        ))}
        {rows.length === 0 && !note ? (
          <p className="lib-empty">选一个音源，输入关键词搜索。</p>
        ) : null}
      </div>
    </section>
  );
}
