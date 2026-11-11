import { today } from "./release-data.js";

/**
 * 首页三态里的两态（SPEC-UX §4）：加载骨架与空态。
 * 骨架 300ms 防闪 + 8s 超时由 LiveHome 的计时承担，这里只管形态；
 * 空态两种视觉同构（虚线封套 + 「未登记」钢印），文案与动作按 A 未登录 / B 曲库空区分。
 */

const ROWS = 6;

export function HomeSkeleton(): React.JSX.Element {
  return (
    <div className="rs-states" aria-busy="true">
      <section className="rs-hero rs-skel" aria-busy="true">
        <div className="rs-sleeve">
          <div className="rs-skel-sleeve" aria-hidden="true" />
        </div>
        <div className="rs-copy" aria-hidden="true">
          <span className="rs-sk-bar rs-sk-w40" />
          <span className="rs-sk-bar rs-sk-w70" />
          <span className="rs-sk-bar rs-sk-w45" />
          <span className="rs-sk-bar rs-sk-w50" />
          <span className="rs-sk-actions">
            <i className="rs-sk-pill" />
            <i className="rs-sk-pill" />
            <i className="rs-sk-pill" />
          </span>
        </div>
      </section>
      <section className="rs-tracks rs-skel" aria-busy="true">
        <header className="rs-tracks-head">
          <h2>接下来播放</h2>
        </header>
        <div className="rs-sk-rows" aria-hidden="true">
          {Array.from({ length: ROWS }, (_, i) => (
            <span className="rs-sk-row" key={i}>
              <i className="rs-sk-no" style={{ animationDelay: `${(i % ROWS) * 150}ms` }} />
              <i className="rs-sk-name" />
              <i className="rs-sk-leader" style={{ animationDelay: `${(i % ROWS) * 150}ms` }} />
              <i className="rs-sk-dur" />
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

/** kind：hint = 未登录（A，P0 去账号）；empty = 已登录曲库空（B，T 换一张）。 */
export function HomeEmpty({
  kind,
  hint,
  reloading,
  onAccount,
  onReload,
}: {
  kind: "hint" | "empty";
  hint: string;
  reloading: boolean;
  onAccount(): void;
  onReload(): void;
}): React.JSX.Element {
  const title = kind === "hint" ? "未登记" : "今天还没有推荐";
  const sub = kind === "hint" ? hint : "推荐源没有给出今天的曲目，晚点再刷新一次。";
  return (
    <section className="rs-hero rs-hero-empty" aria-labelledby="leadTitle">
      <div className="rs-sleeve">
        <div className="rs-sleeve-box rs-sleeve-blank">
          <span className="home-seal" data-lines="1" aria-hidden="true">
            <b>未登记</b>
          </span>
        </div>
        <p className="rs-plate" aria-hidden="true">
          <span>
            <b>待机</b> · {today(new Date())}
          </span>
          <span>0 TRACKS</span>
        </p>
      </div>
      <div className="rs-copy">
        <p className="rs-kick">STANDBY · 06:00 换新</p>
        <h1 id="leadTitle" className="rs-title">
          {title}
        </h1>
        <p className="rs-empty-sub">{sub}</p>
        {kind === "hint" ? (
          <button type="button" className="rs-btn-p0" onClick={onAccount}>
            去登录 / 切换账号
          </button>
        ) : (
          <button type="button" className="rs-reload" aria-busy={reloading} disabled={reloading} onClick={onReload}>
            换一张
          </button>
        )}
      </div>
    </section>
  );
}
