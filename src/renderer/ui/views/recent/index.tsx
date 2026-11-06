import { useEffect, useState } from "react";
import type { RemoteTrack } from "../../../../contracts/capability.js";
import type { Track } from "../../../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary, trackById } from "../../../domain/library/state.js";
import { clearHistory, getHistory, subscribe as subscribeHistory } from "../../../domain/history/index.js";
import { AccountBlock } from "../../AccountBlock.js";
import { useAccountBundle, type AccountBundle } from "../../account-data.js";
import { PageHead } from "../../PageHead.js";
import { TapeRail } from "../../live/TapeRail.js";
import { tapeFromEntries } from "../../../projection/room-program.js";
import { fmtDuration } from "../library/rows.js";
import { isLiked, subscribe as subscribeLikes, toggleLike } from "../../../domain/likes/index.js";

export interface RecentViewProps {
  onPlayGroup(tracks: Track[], startAt: number): void;
  /** 账号听歌排行（A 方案：账号在上、本机记录在下） */
  account(): Promise<AccountBundle>;
  onPlayRemote(sourceId: string, track: RemoteTrack): void;
}

interface Line {
  track: Track;
  at: number;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** 当天 14:32；昨天 / 更早折叠成日期，扫读时按天分组 */
const dayOf = (at: number): string => {
  const now = new Date();
  const d = new Date(at);
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return "今天";
  const yesterday = new Date(now.getTime() - 86400000);
  if (sameDay(d, yesterday)) return "昨天";
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};

/**
 * 最近播放（ref pages-v11/09-recent）。
 * 历史（domain/history）是「每首只留最后一次」的去重表，所以这里是"最近听过的 N 首"，
 * 不是逐次流水——文案照实说，不假装有完整播放流水账。
 */
export function RecentView({ onPlayGroup, account, onPlayRemote }: RecentViewProps) {
  const [, setRev] = useState(0);
  const bump = (): void => setRev((r) => r + 1);
  const acct = useAccountBundle(account, "week");

  useEffect(() => subscribeLibrary(bump), []);
  useEffect(() => subscribeHistory(bump), []);
  useEffect(() => subscribeLikes(bump), []);

  const tracks = getTracks();
  const lines: Line[] = [];
  let lost = 0;
  for (const entry of getHistory()) {
    // 历史存的是原始播放路径（盘符大小写 / 反斜杠），曲库 id 是归一化后的；
    // 直接按 id 相等查会把本机曲目全判成"不在曲库"
    const track = trackById(entry.trackId);
    if (track) lines.push({ track, at: entry.at });
    else lost += 1; // 在线直链或已删除文件：不装成空行，统计里说一声
  }
  const totalMs = lines.reduce((sum, l) => sum + (l.track.durationMs || 0), 0);
  const tape = lines.length
    ? tapeFromEntries(
        lines.map((line) => ({
          item: {
            id: line.track.id,
            title: line.track.title,
            sub: line.track.artist,
            durationMs: line.track.durationMs,
            cover: line.track.hasCover,
          },
          at: line.at,
        })),
        Date.now(),
        "最近播放",
      )
    : null;

  const play = (at: number): void => {
    if (lines.length > 0) onPlayGroup(lines.map((l) => l.track), at);
  };

  return (
    <section className="recent">
      <PageHead
        title="最近播放"
        desc="上栏是当前账号的听歌排行（跨设备）；下栏是本机记录，每首只留最后一次。"
        meta={`RECENT · ${acct.songs.length + lines.length}`}
      />

      <AccountBlock
        title="账号听歌排行"
        note="平台按账号统计的播放次数排序；本机记录在下面，两者口径不同，所以分开放。"
        state={acct}
        empty="这个账号还没有播放记录。"
        onPlay={onPlayRemote}
      />

      <div className="acct-div" />

      {tape ? (
        <TapeRail
          program={tape}
          note="按播放时间归档 · 每首只留最后一次"
          onPlay={(id) => play(lines.findIndex((line) => line.track.id === id))}
        />
      ) : null}

      <div className="ops">
        <button type="button" className="btn primary" onClick={() => play(0)} disabled={lines.length === 0}>
          从最新的一首放起
        </button>
        <button type="button" className="btn" onClick={() => play(lines.length - 1)} disabled={lines.length === 0}>
          从最早的一首放起
        </button>
        <span className="sp" />
        <span className="order">
          合计 <b>{Math.round(totalMs / 60000)} 分钟</b>
          {lost > 0 ? ` · ${lost} 条不在曲库` : ""}
        </span>
        <button type="button" className="sort" onClick={() => clearHistory()} disabled={lines.length === 0}>
          清空记录
        </button>
      </div>

      <div className="timeline">
        {lines.map((line, i) => {
          const day = dayOf(line.at);
          const prev = i === 0 ? null : dayOf(lines[i - 1].at);
          const d = new Date(line.at);
          return (
            <div key={line.track.id}>
              {day !== prev ? <p className="daymark">{day}</p> : null}
              <div
                className="rr rec"
                role="button"
                tabIndex={0}
                onClick={() => play(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") play(i);
                }}
              >
                <span className="no">{pad(d.getHours())}:{pad(d.getMinutes())}</span>
                <button
                  type="button"
                  className={isLiked(line.track.id) ? "hm on" : "hm"}
                  aria-label={isLiked(line.track.id) ? "取消红心" : "加红心"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike(line.track.id);
                  }}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 13C4.8 10.8 2.9 8.9 2.9 6.7c0-1.6 1.2-2.8 2.7-2.8 1 0 1.9.5 2.4 1.4.5-.9 1.4-1.4 2.4-1.4 1.5 0 2.7 1.2 2.7 2.8 0 2.2-1.9 4.1-5.1 6.3z" />
                  </svg>
                </button>
                <span className="tx">
                  <b>{line.track.title}</b>
                  <span>{line.track.artist}</span>
                </span>
                <span className="tag">{line.track.album || "—"}</span>
                <span className="du">{fmtDuration(line.track.durationMs)}</span>
              </div>
            </div>
          );
        })}
        {lines.length === 0 ? <p className="lib-empty">还没有播放记录。随便点一首，这里就开始按天记。</p> : null}
      </div>

      <div className="foot">
        <i />
        <span>本表最多保留 300 首（每首一条）· 仅供本机使用</span>
        <i />
      </div>
    </section>
  );
}
