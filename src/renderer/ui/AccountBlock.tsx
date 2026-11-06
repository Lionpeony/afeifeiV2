import { useState } from "react";
import type { RemoteTrack } from "../../contracts/capability.js";
import { fmtDuration } from "./views/library/rows.js";
import type { AccountState } from "./account-data.js";
import { RefreshButton } from "./RefreshButton.js";

/**
 * 账号数据区块（喜欢的音乐 / 最近播放 / 首页之外的复用块）。
 *
 * 只做显示，不自己拉数据：数据由 `useAccountBundle` 给，这样三个页面共用同一种
 * 加载中 / 未登录 / 出错 / 空 四种状态的表现，不会各写一套文案。
 */
export interface AccountBlockProps {
  title: string;
  /** 标题下面那行说明，写清「这是账号的，不是本地的」 */
  note: string;
  state: AccountState;
  /** 有账号但一首都没有时的文案 */
  empty: string;
  /** 行右侧的附加说明（如播放次数）；返回 null 就退回时长 */
  extra?(track: RemoteTrack, index: number): string | null;
  /** list = 这一栏全部曲目：点哪首就从哪首开始（队列 = 整个红心/听歌排行） */
  onPlay(sourceId: string, track: RemoteTrack, list?: RemoteTrack[]): void;
  /**
   * 给了就在每行挂一颗心（账号红心可取消）。
   * 行为照 folia 的 `handleLike`：**心和提示先答，请求后发**；失败把行放回去并提示一次。
   */
  onUnlike?(sourceId: string, songId: string): Promise<void>;
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function AccountBlock({ title, note, state, empty, extra, onPlay, onUnlike }: AccountBlockProps) {
  const count = state.songs.length;
  // 正在取消的行：先灰掉、禁点，请求落地再真正移除——不做「点完瞬间消失、失败又诈尸」
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const unlike = (track: RemoteTrack): void => {
    if (!onUnlike) return;
    setPending((p) => new Set(p).add(track.sourceId));
    void onUnlike(state.sourceId, track.sourceId)
      .then(() => state.removeSong(track.sourceId))
      .catch(() => undefined) // 提示由调用方给，这里只负责让行回到可用状态
      .finally(() =>
        setPending((p) => {
          const next = new Set(p);
          next.delete(track.sourceId);
          return next;
        }),
      );
  };
  return (
    <section className="acct" aria-label={title}>
      <div className="acct-head">
        <h3>{title}</h3>
        <div className="acct-head-r">
          <span className="acct-meta">{state.loading ? "LOADING" : `${count} 首`}</span>
          <RefreshButton onClick={state.reload} />
        </div>
      </div>
      <p className="acct-note">{note}</p>

      {state.loading ? <p className="acct-state">正在取…</p> : null}

      {!state.loading && state.error ? (
        <p className="acct-state err">
          {state.error}
          <button type="button" className="link" onClick={state.reload}>
            重试
          </button>
        </p>
      ) : null}

      {!state.loading && !state.error && state.hint ? <p className="acct-state hint">{state.hint}</p> : null}

      {!state.loading && !state.error && !state.hint && count === 0 ? (
        <p className="acct-state">{empty}</p>
      ) : null}

      {count > 0 ? (
        <div className="acct-rows">
          {state.songs.map((track, i) => (
            <div
              key={`${track.sourceId}-${i}`}
              className={`acct-row${onUnlike ? " with-like" : ""}${pending.has(track.sourceId) ? " pending" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => onPlay(state.sourceId, track, state.songs)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onPlay(state.sourceId, track, state.songs);
              }}
              title={`${track.title} — ${track.artist}`}
            >
              <span className="no">{pad(i + 1)}</span>
              <span className="tx">
                <b>{track.title}</b>
                <span>{track.artist}</span>
              </span>
              <span className="tag">{track.album || "—"}</span>
              <span className="du">{extra?.(track, i) ?? fmtDuration(track.durationMs)}</span>
              {onUnlike ? (
                <button
                  type="button"
                  className="hm"
                  aria-label={`从账号红心移除《${track.title}》`}
                  title="从账号红心移除"
                  onClick={(e) => {
                    e.stopPropagation();
                    unlike(track);
                  }}
                >
                  ♥
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
