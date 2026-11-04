import { useEffect, useRef, useState } from "react";
import type { LrclibHit } from "../domain/lyrics/fetch-lrclib.js";
import { pushPanel } from "./input/panels.js";

/**
 * 手动换词（P0-19）：搜「歌名 歌手」→ 挑一版 → 当前曲立刻换成它。
 *
 * 结构复用命令面板那套（遮罩 + `.palette`），不引第二个弹窗样式。
 * **`seqRef` 是抄 MusicFree 的那一招**：慢请求回来时如果查询已经变了，直接丢弃，
 * 否则用户连打两次字，先发的旧结果会盖掉新结果 —— 看起来像"搜出来的东西不对"。
 */

const fmt = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** 可用的词：同步优先，退纯文本；都没有就是空（点不动）。 */
const textOf = (hit: LrclibHit): string => hit.syncedLyrics?.trim() || hit.plainLyrics?.trim() || "";

export function FindLyric({
  initialQuery,
  onSearch,
  onPick,
  onClose,
}: {
  initialQuery: string;
  onSearch(query: string): Promise<LrclibHit[]>;
  onPick(hit: LrclibHit): Promise<void>;
  onClose(): void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<LrclibHit[] | null>(null); // null = 还没搜过
  const [searchedFor, setSearchedFor] = useState(""); // 结果对应哪次查询
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);

  const run = async (text: string): Promise<void> => {
    const my = (seqRef.current += 1);
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    setError("");
    try {
      const list = await onSearch(q);
      if (my !== seqRef.current) return; // 期间又搜了一次，这次的结果作废
      setHits(list);
      setSearchedFor(q);
      setSel(0);
    } catch (err) {
      if (my !== seqRef.current) return;
      setHits([]);
      setSearchedFor(q);
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      if (my === seqRef.current) setBusy(false);
    }
  };

  useEffect(() => pushPanel("find-lyric", "modal", onClose), [onClose]);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    void run(initialQuery);
    // 只跑一次：打开就按「歌名 歌手」搜一遍，用户多数时候直接挑第一条
  }, []);

  const choose = async (hit: LrclibHit | undefined): Promise<void> => {
    if (!hit || !textOf(hit) || busy) return;
    setBusy(true);
    try {
      await onPick(hit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "换词失败");
      setBusy(false);
    }
  };

  const fresh = hits !== null && searchedFor === query.trim();

  return (
    <div
      className="dialog-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-label="换一份歌词">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="歌名 歌手…（Enter 搜，↑↓ 选，再 Enter 换上）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (hits?.length) setSel((s) => Math.min(s + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              // 结果还是上一次查询的 → 先搜；结果已对应当前查询 → 就挑
              if (fresh) void choose(hits?.[sel]);
              else void run(query);
            }
          }}
        />
        <div className="palette-list">
          {busy && hits === null ? <div className="palette-row">正在搜…</div> : null}
          {error ? <div className="palette-row">搜索失败：{error}</div> : null}
          {hits?.length === 0 && !busy ? (
            <div className="palette-row">
              {error ? "没有可用的候选" : "没有搜到，换个写法（歌名 + 歌手）再试"}
            </div>
          ) : null}
          {hits?.map((hit, i) => {
            const usable = !!textOf(hit);
            return (
              <div
                key={hit.id}
                className={`palette-row${i === sel ? " on" : ""}`}
                style={usable ? undefined : { opacity: 0.45, cursor: "not-allowed" }}
                onMouseEnter={() => setSel(i)}
                onClick={() => void choose(hit)}
                title={usable ? "用这版歌词" : "这一版没有歌词（纯音乐）"}
              >
                <span>
                  {hit.trackName}
                  {hit.artistName ? ` — ${hit.artistName}` : ""}
                  {hit.albumName ? ` · ${hit.albumName}` : ""}
                </span>
                <span className="palette-hint">
                  {fmt(hit.duration)}
                  {hit.syncedLyrics ? " · 逐行时间轴" : hit.plainLyrics ? " · 纯文本" : " · 无词"}
                </span>
              </div>
            );
          })}
          {hits === null && !busy ? <div className="palette-row">输入「歌名 歌手」后按 Enter</div> : null}
        </div>
      </div>
    </div>
  );
}
