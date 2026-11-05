import type { RemoteTrack } from "../../../contracts/capability.js";
import { useAccountBundle, type AccountBundle } from "../account-data.js";

/**
 * 首页 = 当前账号的每日推荐。
 *
 * 不再展示本地排播：没有元数据的本地曲库在首页只会是一墙「未知专辑 / 未知歌手」，
 * 对用户没有意义。这里只回答一件事：今天给你推什么。
 */

export function LiveHome({
  account,
  accountName,
  onPlayRemote,
  onAccount,
}: {
  account(): Promise<AccountBundle>;
  accountName: string;
  onPlayRemote(sourceId: string, track: RemoteTrack): void;
  onAccount(): void;
}) {
  const state = useAccountBundle(account);
  const today = new Date();
  const date = `${today.getMonth() + 1} 月 ${today.getDate()} 日`;

  return (
    <section className="live-home daily-home">
      <header className="daily-head">
        <div>
          <span className="daily-k">DAILY · 每日推荐</span>
          <h1>{date}</h1>
          <p>
            {state.sourceId ? `${accountName || state.sourceId} · 共 ${state.songs.length} 首` : `${accountName || "当前音源"}`}
            <em> · 每天 06:00 换新</em>
          </p>
        </div>
        <button type="button" className="daily-account" onClick={onAccount}>
          账号
        </button>
      </header>

      {state.loading ? <p className="daily-state">正在取今天的推荐…</p> : null}

      {!state.loading && state.error ? <p className="daily-state">{state.error}</p> : null}

      {!state.loading && !state.error && state.hint ? (
        <div className="daily-gate">
          <p>{state.hint}</p>
          <button type="button" className="live-btn primary" onClick={onAccount}>
            去登录 / 切换账号
          </button>
        </div>
      ) : null}

      {!state.loading && !state.error && !state.hint && state.songs.length === 0 ? (
        <p className="daily-state">今天的推荐还没出来，晚点再看看。</p>
      ) : null}

      {state.songs.length > 0 ? (
        <div className="daily-grid">
          {state.songs.map((track, index) => (
            <button
              type="button"
              className="daily-card"
              key={track.sourceId}
              onClick={() => onPlayRemote(state.sourceId, track)}
              title={`${track.title} — ${track.artist}`}
            >
              <span className="daily-cover">
                {track.coverUrl ? <img src={track.coverUrl} alt="" loading="lazy" /> : <i />}
                <b>{String(index + 1).padStart(2, "0")}</b>
              </span>
              <span className="daily-title">{track.title}</span>
              <span className="daily-sub">{track.artist}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
