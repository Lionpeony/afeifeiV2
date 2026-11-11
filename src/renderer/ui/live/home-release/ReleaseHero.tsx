import type { RemoteTrack } from "../../../../contracts/capability.js";
import { fmtDuration } from "../../views/library/rows.js";
import { titleUnits } from "./release-data.js";
import { MixedTitle, ReleaseSleeve, type SleeveChip } from "./ReleaseSleeve.js";

/**
 * 发行区 hero（docs/29 §6.2 / SPEC-VISUAL §2.3）：封套区（左）+ 文字区（右）。
 * kick 行（mono 10，--fg-dim，R1 修订）→ 标题（58/44/截断三档）→ 元数据行（R3 分隔点
 * --ink-faint）→ 操作组（P0 填充 / S ghost / I icon；P0 = 全页唯一填充件）。
 */
export function ReleaseHero({
  track,
  cat,
  seal,
  chip,
  chipText,
  stateName,
  date,
  total,
  kicker,
  liked,
  onPlay,
  onQueue,
  onLike,
  error,
  onRetry,
}: {
  track: RemoteTrack | null;
  cat: string;
  seal: string[];
  chip: SleeveChip;
  chipText: string;
  stateName: string;
  date: string;
  total: number;
  /** kick 行整行文案（含 TODAY'S RELEASE / GUEST RELEASE / STANDBY 前标） */
  kicker: string;
  liked: boolean;
  onPlay(): void;
  onQueue(): void;
  onLike(): void;
  /** 错误态：标题行原位替换错误文案（onair 橙）+ T 级重试；元数据/操作组不渲染 */
  error?: string | null;
  onRetry?(): void;
}) {
  const title = track?.title ?? "";
  // 字号降档（SPEC-VISUAL §4.1）：>14 计长单位降 44，>24 单行截断 + title 全文
  const units = titleUnits(title);
  const titleCls = units > 24 ? "rs-title rs-title-one" : units > 14 ? "rs-title rs-title-md" : "rs-title";
  const artist = track?.artist ?? "";
  const album = track?.album ?? "";
  const durText = track ? fmtDuration(track.durationMs) : "";

  return (
    <section className="rs-hero" aria-labelledby="leadTitle">
      <ReleaseSleeve
        track={track}
        cat={cat}
        seal={seal}
        chip={chip}
        chipText={chipText}
        stateName={stateName}
        date={date}
        total={total}
      />
      {/* key=曲目：换曲时文字区重挂，pane-swap 200ms（reduce 直切） */}
      <div className="rs-copy" key={track?.sourceId ?? "copy"}>
        <p className="rs-kick">{kicker}</p>
        {error ? (
          <div className="rs-error">
            <h1 id="leadTitle" className="rs-title rs-title-md" role="alert">
              {error}
            </h1>
            <button type="button" className="rs-reload" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : (
          <>
            <h1 id="leadTitle" className={titleCls} title={units > 24 ? title : undefined}>
              <MixedTitle text={title} />
            </h1>
            <p className="rs-meta">
              <b>{artist}</b>
              {album ? (
                <>
                  <i className="rs-dot" aria-hidden="true" />
                  <span>{album}</span>
                </>
              ) : null}
              <i className="rs-dot" aria-hidden="true" />
              <span>{durText}</span>
            </p>
            <div className="rs-actions">
              <button type="button" className="rs-btn-p0" onClick={onPlay}>
                立即播放
              </button>
              <button type="button" className="rs-btn-s" onClick={onQueue}>
                加入队列
              </button>
              <button
                type="button"
                className="rs-btn-i"
                aria-pressed={liked}
                aria-label={`喜欢 ${title}`}
                title={liked ? "取消喜欢" : "喜欢这首歌"}
                onClick={onLike}
              >
                <svg
                  className="rs-heart"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 13C4.8 10.8 2.9 8.9 2.9 6.7c0-1.6 1.2-2.8 2.7-2.8 1 0 1.9.5 2.4 1.4.5-.9 1.4-1.4 2.4-1.4 1.5 0 2.7 1.2 2.7 2.8 0 2.2-1.9 4.1-5.1 6.3z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
