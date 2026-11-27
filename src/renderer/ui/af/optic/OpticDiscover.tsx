import type { HomeSection, RemoteTrack, Toplist } from "../../../../contracts/capability.js";
import { useAf } from "../context.js";
import { EGGS } from "../data.js";
import { TrackArt } from "../art.js";
import { IconArrowRight, IconPlay, IconRefresh } from "../icons.js";
import { RefreshMixSkeleton } from "../RefreshTape.js";
import { DotMatrixDigits } from "./DotMatrix.js";
import { OpticVuMeter } from "./OpticVuMeter.js";

export interface OpticDiscoverProps {
  sourceName: string;
  sourceId: string;
  canLogin: boolean;
  dailySongs: RemoteTrack[];
  dailyPreview: RemoteTrack[];
  dailyOffset: number;
  dailyTotal: number;
  dailyCover?: string | null;
  dailySub: string;
  dailyLoading: boolean;
  dailyError?: string | null;
  dailyHint?: string | null;
  homeSections: HomeSection[];
  homeNote?: string | null;
  toplists: Toplist[];
  onPlay(sourceId: string, track: RemoteTrack, list?: RemoteTrack[], origin?: string): Promise<void>;
  onReloadDaily(): void;
  onOpenLogin(): void;
  onOpenDetail(ref: { id: string; name: string; coverUrl?: string; kind: "chart" | "playlist" | "daily" }): void;
  onPrefetch(kind: "chart" | "playlist", id: string): void;
  fmtDur(ms: number): string;
  fmtPlays(n: number): string;
  thumb(url: string | undefined, size: number): string | undefined;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const WEEK_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * 发现页真正完全重做（仅 palette="default" 挂载）：
 * - 全局 <glass-toggle> 已迁回顶栏常驻，发现页 100% 归还给音乐；
 * - 首屏彻底告别白底三小块，改为全宽「深黑点阵 OLED 声学主舞台」（大透镜封面 + 16 柱实时点阵频谱 + 4 首烟熏玻璃试听矩阵）；
 * - 中段歌单彻底告别一排 6 个小方图，改为「左 5 列巨幕精选卡 + 右 7 列 3×2 光学卡带矩阵」；
 * - 底部双联精密模块：左新歌凹槽矩阵 + 右 3×2 实体打击垫榜单台。
 */
export function OpticDiscover(props: OpticDiscoverProps) {
  const af = useAf();
  const { eggs, sources, accounts, playing } = af;

  const today = new Date();
  const day = pad(today.getDate());
  const wk = WEEK_EN[today.getDay()] ?? "FRI";
  const mn = MON_EN[today.getMonth()] ?? "NOV";
  const linked = Object.values(accounts).filter(Boolean).length;

  const cardSections = props.homeSections.filter((s) => s.layout === "cards");
  const trackSections = props.homeSections.filter((s) => s.layout === "tracks");
  const leadTrack = props.dailyPreview[0];

  return (
    <div className="optic-disc">
      {/* STAGE 01 · 全宽深黑点阵 OLED 声学主舞台（强银黑材质反差，彻底跳出白卡片） */}
      <section className="optic-stage disc-hero" aria-label="声学主舞台与每日推荐">
        {props.dailyCover ? (
          <img className="optic-stage__amb" src={props.dailyCover} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
        ) : null}

        {/* 顶部硬件遥测条：大点阵日期 + 16 柱实时音频频谱 + 音源/彩蛋数显 */}
        <div className="optic-stage__bar">
          <div className="optic-stage__date">
            <DotMatrixDigits value={day} dotSize={3} gap={1.5} />
            <span className="optic-stage__cal">
              <b>{wk}</b>
              <span>{mn}</span>
            </span>
            <span className="optic-stage__div" aria-hidden="true" />
            <span className="optic-stage__src">
              <i className={"optic-led" + (linked > 0 ? " is-on" : "")} aria-hidden="true" />
              {props.sourceName} · {linked}/{sources.length} SRC
            </span>
          </div>

          <div className="optic-stage__meters">
            <OpticVuMeter bins={16} rows={6} playing={playing} />
            <span className="optic-stage__egg num">EGG {eggs.length}/{EGGS.length}</span>
          </div>
        </div>

        {/* 主舞台双区：左光学大透镜封面 + 右烟熏玻璃 4 曲试听矩阵 */}
        <div className="optic-stage__grid">
          <div className="optic-stage__lead">
            <div className="optic-stage__lens">
              {props.dailyCover ? (
                <img src={props.dailyCover} alt="" referrerPolicy="no-referrer" />
              ) : (
                <TrackArt id="daily-mix" size={172} radius={16} />
              )}
              <span className="optic-jewel-spine" aria-hidden="true" />
              <span className="optic-lens-bevel" aria-hidden="true" />
              <span className="optic-stage__count num">{pad(props.dailyTotal || 30)}</span>
            </div>

            <div className="optic-stage__copy">
              <span className="optic-stage__kicker">DAILY MIX · CURATED SESSION</span>
              <h2 className="optic-stage__title">每日推荐</h2>
              <p className="optic-stage__sub" title={leadTrack ? `${leadTrack.title} — ${leadTrack.artist}` : props.dailySub}>
                {leadTrack ? `${leadTrack.title} — ${leadTrack.artist}` : props.dailySub}
              </p>
              {props.dailyError ? <p className="optic-hero__err">{props.dailyError}</p> : null}
              <div className="optic-stage__acts">
                {props.dailySongs.length > 0 ? (
                  <button
                    type="button"
                    className="optic-stage__key optic-stage__key--play"
                    onClick={() => {
                      void props.onPlay(props.sourceId, props.dailySongs[0]!, props.dailySongs, "每日推荐");
                      af.openPlayer();
                    }}
                  >
                    <IconPlay size={14} />
                    <span>立即开播</span>
                  </button>
                ) : null}
                {props.dailyHint && props.canLogin ? (
                  <button type="button" className="optic-stage__key optic-stage__key--play" onClick={props.onOpenLogin}>
                    登录{props.sourceName}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="optic-stage__key"
                  onClick={props.onReloadDaily}
                  disabled={props.dailyLoading}
                >
                  <IconRefresh size={13} />
                  <span>换一批</span>
                </button>
              </div>
            </div>
          </div>

          <div className="optic-stage__tape">
            <div className="optic-stage__tapehead">
              <span className="optic-stage__kicker">QUICK AUDITION</span>
              {props.dailyTotal > 4 ? (
                <button
                  type="button"
                  className="optic-stage__more"
                  onClick={() => props.onOpenDetail({ id: "daily", name: "每日推荐", coverUrl: props.dailySongs[0]?.coverUrl, kind: "daily" })}
                >
                  全部 {props.dailyTotal} 首 <IconArrowRight size={12} />
                </button>
              ) : null}
            </div>
            <div className="optic-stage__rows">
              {props.dailyLoading && props.dailySongs.length === 0 ? (
                <RefreshMixSkeleton rows={4} />
              ) : props.dailyPreview.length > 0 ? (
                props.dailyPreview.map((t, i) => (
                  <button
                    key={`${t.sourceId}-${i}`}
                    type="button"
                    className="optic-srow"
                    onClick={() => {
                      void props.onPlay(props.sourceId, t, props.dailySongs, "每日推荐");
                      af.openPlayer();
                    }}
                  >
                    <span className="optic-srow__no num">{pad(props.dailyOffset + i + 1)}</span>
                    <span className="optic-srow__art" aria-hidden="true">
                      {t.coverUrl ? (
                        <img src={props.thumb(t.coverUrl, 64)} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <TrackArt id={t.sourceId} size={32} radius={6} />
                      )}
                    </span>
                    <span className="optic-srow__meta">
                      <b className="truncate">{t.title}</b>
                      <span className="truncate">{t.artist}</span>
                    </span>
                    <span className="optic-srow__dur num">{props.fmtDur(t.durationMs)}</span>
                  </button>
                ))
              ) : (
                <div className="optic-stage__empty">登录后自动同步今日 30 首推荐</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {props.homeNote ? <p className="lib-note" role="status">{props.homeNote}</p> : null}

      {/* STAGE 02 · 非对称编辑精选歌单展廊（左 5 列巨幕大展盒 + 右 7 列 3×2 光学卡带矩阵） */}
      {cardSections.map((sec, idx) => {
        const playlists = sec.items.filter((x) => x.kind === "playlist");
        const featured = playlists[0];
        const rest = playlists.slice(1, 7);
        if (!featured) return null;
        return (
          <section className="optic-gallery" key={sec.id}>
            <div className="optic-shelf__head">
              <div className="optic-shelf__titles">
                <span className="optic-mod-pill num">DECK 0{idx + 2}</span>
                <h2>{sec.title}</h2>
                {sec.subtitle ? <span className="optic-shelf__sub">{sec.subtitle}</span> : null}
              </div>
              <span className="optic-mod-spec num">{pad(playlists.length)} CARTRIDGES</span>
            </div>

            <div className="optic-gallery__grid">
              {/* 左 5 列：巨幕主推光学展盒 */}
              <button
                type="button"
                className="optic-feature"
                title={featured.title}
                onClick={() => props.onOpenDetail({ id: featured.id, name: featured.title, coverUrl: featured.coverUrl, kind: "playlist" })}
                onPointerEnter={() => props.onPrefetch("playlist", featured.id)}
              >
                {featured.coverUrl ? (
                  <img className="optic-feature__img" src={featured.coverUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <TrackArt id={featured.id} size={360} radius={16} />
                )}
                <span className="optic-jewel-spine" aria-hidden="true" />
                <span className="optic-lens-bevel" aria-hidden="true" />
                <span className="optic-album__sheen" aria-hidden="true" />
                <span className="optic-feature__dock">
                  <span className="optic-feature__tag">
                    <i className="optic-led is-on" aria-hidden="true" />
                    FEATURED{featured.playCount ? ` · ${props.fmtPlays(featured.playCount)}` : ""}
                  </span>
                  <b className="optic-feature__title">{featured.title}</b>
                </span>
              </button>

              {/* 右 7 列：3×2 光学卡带矩阵（零裁切、零多余横向滚动） */}
              <div className="optic-matrix" role="list" aria-label={sec.title}>
                {rest.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className="optic-cart"
                    title={item.title}
                    onClick={() => props.onOpenDetail({ id: item.id, name: item.title, coverUrl: item.coverUrl, kind: "playlist" })}
                    onPointerEnter={() => props.onPrefetch("playlist", item.id)}
                    onFocus={() => props.onPrefetch("playlist", item.id)}
                  >
                    <span className="optic-cart__tray">
                      <span className="optic-cart__art">
                        {item.coverUrl ? (
                          <img src={item.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <TrackArt id={item.id} size={180} radius={12} />
                        )}
                        <span className="optic-jewel-spine" aria-hidden="true" />
                        <span className="optic-lens-bevel" aria-hidden="true" />
                        <span className="optic-album__sheen" aria-hidden="true" />
                        {item.playCount && item.playCount > 0 ? (
                          <span className="optic-cart__oled num">{props.fmtPlays(item.playCount)}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="optic-cart__name">{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {/* STAGE 03 · 双联精密硬件模块（左：深黑 OLED 顶标新歌矩阵 / 右：6 键光学打击垫榜单台） */}
      <div className="optic-pair">
        {trackSections.map((sec) => {
          const secTracks = sec.items
            .filter((x): x is { kind: "track"; track: RemoteTrack } => x.kind === "track")
            .map((x) => x.track)
            .slice(0, 6);
          return (
            <section className="optic-module" key={sec.id}>
              <div className="optic-module__oled">
                <span className="optic-mod-tag">
                  <i className="optic-led is-on" aria-hidden="true" />
                  NEW RELEASES · {sec.title}
                </span>
                <span className="optic-mod-spec num">{pad(secTracks.length)} TRACKS</span>
              </div>
              <div className="optic-well-list">
                {secTracks.map((t, i) => (
                  <button
                    key={`${t.sourceId}-${i}`}
                    type="button"
                    className="optic-row"
                    onClick={() => {
                      void props.onPlay(props.sourceId, t, secTracks, sec.title);
                      af.openPlayer();
                    }}
                  >
                    <span className="optic-row__no num">{pad(i + 1)}</span>
                    <span className="optic-row__art" aria-hidden="true">
                      {t.coverUrl ? (
                        <img src={props.thumb(t.coverUrl, 64)} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <TrackArt id={t.sourceId} size={32} radius={6} />
                      )}
                    </span>
                    <span className="optic-row__meta">
                      <b className="truncate">{t.title}</b>
                      <span className="truncate">{t.artist}</span>
                    </span>
                    <span className="optic-row__dur num">{props.fmtDur(t.durationMs)}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        {props.toplists.length > 0 ? (
          <section className="optic-module">
            <div className="optic-module__oled">
              <span className="optic-mod-tag">
                <i className="optic-led is-on" aria-hidden="true" />
                CHARTS · 官方榜单
              </span>
              <span className="optic-mod-spec num">6-PAD MATRIX</span>
            </div>
            <div className="optic-pads">
              {props.toplists.slice(0, 6).map((c, ci) => (
                <button
                  key={c.id}
                  type="button"
                  className="optic-pad"
                  onClick={() => props.onOpenDetail({ id: c.id, name: c.name, coverUrl: c.coverUrl, kind: "chart" })}
                  onPointerEnter={() => props.onPrefetch("chart", c.id)}
                >
                  <span className="optic-pad__top">
                    <span className="optic-pad__art">
                      {c.coverUrl ? (
                        <img src={c.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <TrackArt id={c.id} size={40} radius={8} />
                      )}
                      <span className="optic-lens-bevel" aria-hidden="true" />
                    </span>
                    <span className="optic-pad__idx num">P{pad(ci + 1)}</span>
                  </span>
                  <span className="optic-pad__meta">
                    <b className="truncate">{c.name}</b>
                    <span className="num">{c.count > 0 ? `${c.count} TRK` : "CHART"}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
