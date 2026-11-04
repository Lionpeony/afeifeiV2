import type { RemoteTrack } from "../../contracts/capability.js";
import { fmtDuration } from "./views/library/rows.js";
import type { AccountState } from "./account-data.js";

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
  onPlay(sourceId: string, track: RemoteTrack): void;
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function AccountBlock({ title, note, state, empty, extra, onPlay }: AccountBlockProps) {
  const count = state.songs.length;
  return (
    <section className="acct" aria-label={title}>
      <div className="acct-head">
        <h3>{title}</h3>
        <span className="acct-meta">{state.loading ? "LOADING" : `${count} 首`}</span>
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
              className="acct-row"
              role="button"
              tabIndex={0}
              onClick={() => onPlay(state.sourceId, track)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onPlay(state.sourceId, track);
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
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
