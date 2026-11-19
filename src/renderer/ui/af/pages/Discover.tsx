/* 发现页 · 原型 .page.disc（每日推荐 / 榜单 / 热门 / 传单墙 + 搜索态）
   数据逻辑沿用现有 DiscoverView：账号每日推荐、榜单、搜索、下载。 */
import { Fragment, useEffect, useRef, useState } from "react";
import type { HomeSection, RemoteTrack, Toplist } from "../../../../contracts/capability.js";
import { getNet, invalidatePrefix, loadNet, refreshNet } from "../../../domain/net-cache/index.js";
import { useAccountBundle, type AccountBundle } from "../../account-data.js";
import { toast } from "../../toast.js";
import { useActiveSource } from "../../use-active-source.js";
import { LoginDialog } from "../../views/discover/LoginDialog.js";
import { remoteTrackId } from "../../../kernel/index.js";
import { useAf } from "../context.js";
import type { AfTrack } from "../context.js";
import { TrackArt } from "../art.js";
import { AfTrackTable } from "../TrackTable.js";
import { IconArrowRight, IconBack, IconPlay, IconRefresh, IconSparkle, IconDownload } from "../icons.js";
import { Tape } from "../ui.js";

export interface AfSourceOption {
  id: string;
  name: string;
  canAuth: boolean;
  canDownload: boolean;
  canPlaylists: boolean;
  canToplists: boolean;
}

export interface DiscoverPageProps {
  sources: AfSourceOption[];
  daily(): Promise<AccountBundle>;
  listToplists(sourceId: string): Promise<Toplist[]>;
  /** 首页栏目（数据驱动）：源返回几块就渲染几块 */
  home(sourceId: string): Promise<HomeSection[]>;
  playlistTracks(sourceId: string, listId: string, page?: number): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  artistTracks(sourceId: string, artistId: string, page?: number): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  albumTracks(sourceId: string, albumId: string, page?: number): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  onPlay(sourceId: string, track: RemoteTrack, list?: RemoteTrack[], origin?: string): Promise<void>;
  onSearch(sourceId: string, keyword: string): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  onDownload(sourceId: string, track: RemoteTrack): Promise<string>;
  onDownloadMany(sourceId: string, tracks: RemoteTrack[]): Promise<string>;
  startLogin(sourceId: string, channel?: string): Promise<{ key?: string; qrImage?: string; loggedIn?: boolean }>;
  pollLogin(key: string): Promise<{ code: number; loggedIn: boolean; message: string }>;
  sendCaptcha(phone: string): Promise<{ ok: boolean; message: string }>;
  loginByCaptcha(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>;
  seekQuery?: { text: string; at: number } | null;
  tabs?: React.ReactNode;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const fmtDur = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};
/** 播放量：亿/万分级，避免角标撑破封面 */
const fmtPlays = (n: number): string => {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)} 亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(n >= 1e5 ? 0 : 1)} 万`;
  return String(n);
};
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

type DetailKind = "chart" | "playlist" | "artist" | "album";
interface DetailRef {
  id: string;
  name: string;
  coverUrl?: string;
  kind: DetailKind;
}

export function DiscoverPage(props: DiscoverPageProps) {
  const af = useAf();
  const [sourceId] = useActiveSource(props.sources);
  const toAf = (t: RemoteTrack): AfTrack => ({
    id: remoteTrackId(sourceId, t.sourceId),
    title: t.title,
    artist: t.artist,
    album: t.album,
    cover: t.coverUrl ?? null,
    dur: t.durationMs / 1000,
    remote: { sourceId, songId: t.sourceId, coverUrl: t.coverUrl },
  });
  const currentSource = props.sources.find((s) => s.id === sourceId);
  const sourceName = currentSource?.name ?? sourceId;
  const canLogin = currentSource?.canAuth === true;
  const acct = useAccountBundle(props.daily, "daily");

  const [loginOpen, setLoginOpen] = useState(false);
  const [note, setNote] = useState("");
  const [lists, setLists] = useState<Toplist[]>([]);
  const [listNote, setListNote] = useState("");
  const [homeSections, setHomeSections] = useState<HomeSection[]>([]);
  /** 榜 / 歌单 / 歌手 / 专辑详情：整页切换，返回恢复原滚动位置 */
  const [detail, setDetail] = useState<DetailRef | null>(null);
  const [detailStack, setDetailStack] = useState<DetailRef[]>([]);
  const [detailTracks, setDetailTracks] = useState<RemoteTrack[]>([]);
  const [detailNext, setDetailNext] = useState<number | undefined>(undefined);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailNote, setDetailNote] = useState("");
  const [detailShown, setDetailShown] = useState(0);
  const savedScroll = useRef(0);
  const [chartTick, setChartTick] = useState(0);
  const canCharts = currentSource?.canToplists === true;

  useEffect(() => {
    if (!sourceId || !canCharts) {
      setLists([]);
      setDetail(null);
      setDetailStack([]);
      setListNote("");
      return;
    }
    let alive = true;
    const key = `charts:toplists:${sourceId}`;
    setLists(getNet<Toplist[]>(key) ?? []);
    setDetail(null);
    setDetailStack([]);
    setListNote("");
    loadNet(key, () => props.listToplists(sourceId))
      .then((list) => {
        if (!alive) return;
        setLists(list);
        if (list.length === 0) setListNote("这个音源没有给出榜单。");
      })
      .catch((err: unknown) => {
        if (alive) setListNote(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, chartTick, canCharts]);

  /** 首页栏目：与榜单并行取，失败只少一块，不挡整页 */
  useEffect(() => {
    if (!sourceId) {
      setHomeSections([]);
      return;
    }
    let alive = true;
    const key = `charts:home:${sourceId}`;
    setHomeSections(getNet<HomeSection[]>(key) ?? []);
    loadNet(key, () => props.home(sourceId))
      .then((sections) => {
        if (alive) setHomeSections(sections);
      })
      .catch(() => {
        if (alive) setHomeSections([]);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, chartTick]);

  /** 打开详情：记住列表滚动位置，进详情后回到顶部；从详情里点歌手/专辑会压栈 */
  const openDetail = (item: DetailRef): void => {
    const main = document.querySelector<HTMLElement>(".main__page");
    if (detail) setDetailStack((s) => [...s, detail]);
    else savedScroll.current = main ? main.scrollTop : 0;
    setDetail(item);
    setDetailTracks([]);
    setDetailNext(undefined);
    setDetailNote("");
    setDetailShown(0);
    if (main) main.scrollTop = 0;
    void loadDetail(item.kind, item.id, 0);
  };

  const loadDetail = async (kind: DetailKind, listId: string, page: number): Promise<void> => {
    const key = `charts:tracks:${sourceId}:${kind}:${listId}:${page}`;
    const cached = page === 0 ? getNet<{ items: RemoteTrack[]; nextPage?: number }>(key) : undefined;
    if (cached) {
      setDetailTracks(cached.items);
      setDetailNext(cached.nextPage);
      setDetailShown(Math.min(120, cached.items.length));
      return;
    }
    setDetailBusy(true);
    setDetailNote("");
    const loader =
      kind === "artist" ? props.artistTracks : kind === "album" ? props.albumTracks : props.playlistTracks;
    try {
      const result = await loadNet(key, () => loader(sourceId, listId, page));
      setDetailTracks((prev) => (page === 0 ? result.items : [...prev, ...result.items]));
      setDetailNext(result.nextPage);
      setDetailShown((n) => (page === 0 ? Math.min(120, result.items.length) : n + result.items.length));
      if (page === 0 && result.items.length === 0) setDetailNote("这里暂时取不到曲目。");
    } catch (err) {
      setDetailNote(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailBusy(false);
    }
  };

  const closeDetail = (): void => {
    if (detailStack.length > 0) {
      const prev = detailStack[detailStack.length - 1]!;
      setDetailStack((s) => s.slice(0, -1));
      setDetail(prev);
      setDetailTracks([]);
      setDetailNext(undefined);
      setDetailNote("");
      setDetailShown(0);
      void loadDetail(prev.kind, prev.id, 0);
      return;
    }
    setDetail(null);
    setDetailStack([]);
    setDetailTracks([]);
    setDetailNext(undefined);
    setDetailNote("");
    setDetailShown(0);
    setTimeout(() => {
      const main = document.querySelector<HTMLElement>(".main__page");
      if (main) main.scrollTop = savedScroll.current;
    }, 0);
  };

  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<RemoteTrack[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  const run = async (query: string): Promise<void> => {
    if (!sourceId || !query) return;
    setBusy(true);
    setSlow(false);
    setNote("");
    const slowTimer = setTimeout(() => setSlow(true), 5000);
    try {
      const result = await props.onSearch(sourceId, query);
      setRows(result.items);
      setSelected(new Set());
      if (result.items.length === 0) setNote("没搜到。换个词试试。");
    } catch (err) {
      setRows([]);
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!props.seekQuery?.text) return;
    setKeyword(props.seekQuery.text);
    void run(props.seekQuery.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.seekQuery?.at]);

  useEffect(() => {
    if (!keyword) return;
    void run(keyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const clearQuery = (): void => {
    setKeyword("");
    setRows([]);
    setSelected(new Set());
    setNote("");
  };

  const playFound = async (track: RemoteTrack): Promise<void> => {
    setNote("");
    try {
      const short = keyword.length > 16 ? `${keyword.slice(0, 16)}…` : keyword;
      await props.onPlay(sourceId, track, rows, keyword ? `搜索 · ${short}` : undefined);
      af.openPlayer();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const download = async (track: RemoteTrack): Promise<void> => {
    setNote("");
    try {
      toast(await props.onDownload(sourceId, track));
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const togglePick = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadMany = async (): Promise<void> => {
    const picked = rows.filter((t) => selected.has(t.sourceId));
    if (picked.length === 0) return;
    setNote("");
    try {
      toast(await props.onDownloadMany(sourceId, picked));
      setSelected(new Set());
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const today = new Date();
  const dayNum = pad(today.getDate());
  const monStr = MONTHS[today.getMonth()];
  const weekday = WEEKDAYS[today.getDay()];
  const dailyCover = acct.songs[0]?.coverUrl ?? null;
  const dailySub = acct.hint
    ? acct.hint
    : acct.loading
      ? "正在取今天的推荐…"
      : `来自${sourceName}账号 · ${acct.songs.length} 首 · 每天 06:00 换新`;
  const hot = acct.songs.slice(0, 8);
  const hotOrigin = "今日推荐";

  /* 传单墙来自真实播放历史：按天归档，最多三张；没有记录就不摆假海报 */
  const dayMap = new Map<number, { at: number; ids: string[] }>();
  for (const h of af.history) {
    const d = new Date(h.at);
    d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    const row = dayMap.get(key);
    if (row) row.ids.push(h.id);
    else dayMap.set(key, { at: key, ids: [h.id] });
  }
  const flyerDays = [...dayMap.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, 3)
    .map((g) => {
      const d = new Date(g.at);
      const first = g.ids[0] ? af.resolveTrack(g.ids[0]) : null;
      return {
        key: g.at,
        day: pad(d.getDate()),
        mon: MONTHS[d.getMonth()],
        count: g.ids.length,
        title: first?.title ?? "一场没有留下曲名的排练",
        cover: first?.cover ?? null,
      };
    });

  if (detail) {
    const visibleTracks = detailTracks.slice(0, detailShown);
    const now = new Date();
    const dateLabel = `${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    const loadedMin = Math.round(detailTracks.reduce((sum, t) => sum + t.durationMs, 0) / 60000);
    const playedAll = detailNext === undefined && detailShown >= detailTracks.length && detailTracks.length > 0;
    const kicker = detail.kind === "chart" ? "榜单" : detail.kind === "playlist" ? "歌单" : detail.kind === "artist" ? "歌手" : "专辑";
    const heroCover = detail.coverUrl ?? visibleTracks[0]?.coverUrl;

    return (
      <div className="page disc disc-detail page-setlist" data-screen-label="榜单详情">
        <button type="button" className="setlist-back" onClick={closeDetail}>
          <IconBack size={14} />返回
        </button>

        <div className="setlist">
          <aside className="setlist-spine" aria-hidden="true">
            <span className="setlist-spine__word">SETLIST</span>
            <span className="setlist-spine__kana">セットリスト</span>
            <span className="setlist-spine__date">{dateLabel}</span>
            <span className="setlist-spine__count">
              {detailTracks.length > 0 ? `${detailTracks.length} 首 · ${loadedMin} 分` : "…"}
            </span>
            <span className="setlist-spine__stamp">本番</span>
            <span className="setlist-spine__mascot" aria-hidden="true" />
          </aside>

          <div className="setlist-body">
            <header className="setlist-poster">
              <Tape w={70} rot={-4} style={{ top: -11, left: 40 }} />
              <div className="setlist-poster__frame">
                <div className="setlist-poster__photo">
                  {heroCover ? (
                    <img src={heroCover} alt="" referrerPolicy="no-referrer" decoding="async" />
                  ) : (
                    <span className="setlist-poster__initial">{detail.name.trim().slice(0, 1)}</span>
                  )}
                </div>
              </div>
              <div className="setlist-poster__info">
                <div className="eyebrow">LIVE SETLIST · {kicker}</div>
                <h1 className="setlist-poster__title">{detail.name}</h1>
                <p className="setlist-poster__hand">今晚这一场，按曲顺来——别掉拍。</p>
                <div className="setlist-poster__stats num">
                  {detailTracks.length > 0 ? `${detailTracks.length} 首 · 约 ${loadedMin} 分钟` : "取曲目中…"}
                </div>
                <div className="setlist-poster__acts">
                  <button
                    className="setlist-play"
                    disabled={!detailTracks[0]}
                    onClick={() => {
                      if (!detailTracks[0]) return;
                      void props.onPlay(sourceId, detailTracks[0], detailTracks, detail.name);
                      af.openPlayer();
                    }}
                  >
                    <IconPlay size={14} />全部播放
                  </button>
                </div>
              </div>
            </header>

            {detailNote ? <p className="lib-note" role="status">{detailNote}</p> : null}

            <ol className="tracklist tracklist--setlist">
              {visibleTracks.map((t, i) => {
                const play = (): void => {
                  void props.onPlay(sourceId, t, detailTracks, detail.name);
                  af.openPlayer();
                };
                return (
                  <Fragment key={`${t.sourceId}-${i}`}>
                    {i === 15 ? (
                      <li className="setlist-side" aria-hidden="true">
                        <i />
                        <span>SIDE B</span>
                        <i />
                      </li>
                    ) : null}
                    <li className="tracklist__row">
                      <span className="tracklist__no">{pad(i + 1)}</span>
                      <button type="button" className="tracklist__art" title={`播放 ${t.title}`} aria-label={`播放 ${t.title}`} onClick={play}>
                        {t.coverUrl ? (
                          <img src={t.coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                        ) : (
                          <TrackArt id={t.sourceId} size={38} radius={7} />
                        )}
                        <span className="tracklist__artplay" aria-hidden="true"><IconPlay size={12} /></span>
                      </button>
                      <span className="tracklist__main">
                        <button type="button" className="tracklist__title" onClick={play}>
                          {t.title}
                        </button>
                        <span className="tracklist__meta">
                          {t.artistId ? (
                            <button
                              type="button"
                              className="tracklist__link"
                              title={`查看歌手 ${t.artist}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetail({ id: t.artistId!, name: t.artist, coverUrl: t.coverUrl, kind: "artist" });
                              }}
                            >
                              {t.artist}
                            </button>
                          ) : (
                            <span>{t.artist}</span>
                          )}
                          <span className="tracklist__dot">·</span>
                          {t.albumId ? (
                            <button
                              type="button"
                              className="tracklist__link"
                              title={`查看专辑 ${t.album}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetail({ id: t.albumId!, name: t.album, coverUrl: t.coverUrl, kind: "album" });
                              }}
                            >
                              {t.album}
                            </button>
                          ) : (
                            <span>{t.album}</span>
                          )}
                        </span>
                      </span>
                      <span className="tracklist__leader" aria-hidden="true" />
                      <span className="tracklist__dur num">{fmtDur(t.durationMs)}</span>
                    </li>
                  </Fragment>
                );
              })}
            </ol>

            {detailShown < detailTracks.length || detailNext !== undefined ? (
              <button
                className="setlist-more"
                disabled={detailBusy}
                onClick={() => {
                  if (detailShown < detailTracks.length) setDetailShown((n) => n + 120);
                  else if (detailNext !== undefined) void loadDetail(detail.kind, detail.id, detailNext);
                }}
              >
                {detailBusy
                  ? "翻页中…"
                  : detailShown < detailTracks.length
                    ? `翻开下一页 · 还有 ${detailTracks.length - detailShown} 首`
                    : "加载更多曲目"}
              </button>
            ) : null}

            {playedAll ? <p className="setlist-encore">つづく…</p> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page disc" data-screen-label="发现">
      <div className="disc__head">
        <div>
          <div className="eyebrow disc__eyebrow">DISCOVER · {sourceName}{acct.hint ? " · 未登录" : " · 已登录"}</div>
          <h1 className="display">发现</h1>
        </div>
        <div className="disc__date" title="今天的日期">
          <b>{dayNum}</b>
          <span>{monStr}<br />{weekday}</span>
        </div>
      </div>

      {note ? <p className="lib-note" role="status">{note}</p> : null}
      {slow ? <p className="lib-note dim" role="status">还在搜——这个音源的上游响应比较慢，再等几秒。</p> : null}

      {keyword ? (
        <section className="paper" style={{ padding: "18px 18px 10px" }} aria-label="搜索结果">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div className="h2">{keyword}</div>
              <div className="meta">{busy ? "搜索中…" : rows.length > 0 ? `${rows.length} 条` : "没有结果"}</div>
            </div>
            <div className="row gap8">
              {currentSource?.canDownload && rows.length > 0 ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(rows.map((t) => t.sourceId)))}>全选</button>
                  <button className="btn btn-soft btn-sm" disabled={selected.size === 0} onClick={() => void downloadMany()}>
                    <IconDownload size={13} />下载选中{selected.size > 0 ? `（${selected.size}）` : ""}
                  </button>
                </>
              ) : null}
              <button className="btn btn-ghost btn-sm" onClick={clearQuery}>清空</button>
            </div>
          </div>
          <div className="tbl">
            <div className="tbl__head">
              <span className="tbl__c-no">#</span>
              <span className="tbl__c-title">TITLE</span>
              <span className="tbl__c-artist">ARTIST</span>
              <span className="tbl__c-album">ALBUM</span>
              <span className="tbl__c-time">TIME</span>
            </div>
            {rows.map((t, i) => (
              <div key={t.sourceId} className="tbl__row" role="button" tabIndex={0} onClick={() => void playFound(t)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void playFound(t); } }}>
                <span className="tbl__c-no num">{pad(i + 1)}</span>
                <span className="tbl__c-title">
                  {currentSource?.canDownload ? (
                    <input
                      type="checkbox"
                      checked={selected.has(t.sourceId)}
                      aria-label={`选择 ${t.title}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => togglePick(t.sourceId)}
                    />
                  ) : null}
                  {t.coverUrl ? <img className="tbl__cover" src={t.coverUrl} alt="" referrerPolicy="no-referrer" /> : <TrackArt id={t.sourceId} size={34} radius={4} />}
                  <span className="tbl__title-text"><span className="tbl__name truncate">{t.title}</span></span>
                </span>
                <span className="tbl__c-artist truncate">{t.artist}</span>
                <span className="tbl__c-album truncate">{t.album}</span>
                <span className="tbl__c-time">
                  {currentSource?.canDownload ? (
                    <button className="tbl__heart" title="下载" onClick={(e) => { e.stopPropagation(); void download(t); }}><IconDownload size={14} /></button>
                  ) : null}
                  <span className="num">{fmtDur(t.durationMs)}</span>
                </span>
              </div>
            ))}
            {busy ? <div className="search-busy"><span className="hand">在翻曲库……</span></div> : null}
          </div>
        </section>
      ) : (
        <>
          <section className="mix disc-hero" aria-label="每日推荐">
            <div className="mix__cover">
              {dailyCover ? <img src={dailyCover} alt="" referrerPolicy="no-referrer" /> : <TrackArt id="daily-mix" size={224} radius={14} />}
              <span className="mix__tag">DAILY MIX</span>
              <span className="mix__stamp">{acct.songs.length || 33}</span>
            </div>
            <div className="mix__body">
              <div className="eyebrow">DAILY MIX · 今日发行</div>
              <h2 className="mix__title">每日推荐</h2>
              <div className="mix__meta">{dailySub}</div>
              {acct.error ? <div className="mix__meta" style={{ color: "var(--coral)" }}>{acct.error}</div> : null}
              <div className="row gap10" style={{ marginTop: 16 }}>
                {acct.songs.length > 0 ? (
                  <button className="btn btn-primary" onClick={() => { void props.onPlay(acct.sourceId, acct.songs[0]!, acct.songs, "每日推荐"); af.openPlayer(); }}>
                    <IconPlay size={14} />今日开播
                  </button>
                ) : null}
                {acct.hint && canLogin ? (
                  <button className="btn btn-primary" onClick={() => setLoginOpen(true)}>登录{sourceName}</button>
                ) : null}
                <button className="btn btn-ghost" onClick={acct.reload} disabled={acct.loading}>
                  <IconRefresh size={14} />换一批
                </button>
              </div>
              <div className="mix__list">
                {acct.songs.slice(0, 4).map((t, i) => (
                  <button key={`${t.sourceId}-${i}`} className="mix-row" onClick={() => { void props.onPlay(acct.sourceId, t, acct.songs, "每日推荐"); af.openPlayer(); }}>
                    <span className="mix-row__no num">{pad(i + 1)}</span>
                    <span className="mix-row__title truncate">{t.title}</span>
                    <span className="mix-row__artist truncate">{t.artist}</span>
                    <span className="mix-row__dur num">{fmtDur(t.durationMs)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mix__bigdate" aria-hidden="true"><b>{dayNum}</b><span>{monStr}</span></div>
          </section>

          {homeSections
            .filter((sec) => sec.layout === "cards")
            .map((sec) => (
              <section className="disc__sect home-sec" key={sec.id}>
                <h2 className="sect-title">
                  {sec.title}
                  {sec.subtitle ? <span>{sec.subtitle}</span> : null}
                </h2>
                <div className="home-grid" role="list" aria-label={sec.title}>
                  {sec.items.map((item) =>
                    item.kind === "playlist" ? (
                      <button
                        key={item.id}
                        role="listitem"
                        className="home-card"
                        title={item.title}
                        onClick={() => openDetail({ id: item.id, name: item.title, coverUrl: item.coverUrl, kind: "playlist" })}
                      >
                        <span className="home-card__art">
                          <span className="home-card__tape" aria-hidden="true" />
                          {item.coverUrl ? (
                            <img src={item.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          ) : (
                            <TrackArt id={item.id} size={132} radius={12} />
                          )}
                          {item.playCount && item.playCount > 0 ? (
                            <span className="home-card__plays num">{fmtPlays(item.playCount)}</span>
                          ) : null}
                        </span>
                        <span className="home-card__name">{item.title}</span>
                      </button>
                    ) : null,
                  )}
                </div>
              </section>
            ))}

          {homeSections.some((sec) => sec.layout === "tracks") ? (
            <div className="home-pair">
              {homeSections
                .filter((sec) => sec.layout === "tracks")
                .map((sec) => {
                  const secTracks = sec.items
                    .filter((x): x is { kind: "track"; track: RemoteTrack } => x.kind === "track")
                    .map((x) => x.track)
                    .slice(0, 6);
                  return (
                    <section className="disc__sect home-sec home-sec--list" key={sec.id}>
                      <h2 className="sect-title">
                        {sec.title}
                        {sec.subtitle ? <span>{sec.subtitle}</span> : null}
                      </h2>
                      <div className="home-rows" role="list">
                        {secTracks.map((track, i) => (
                          <button
                            key={`${track.sourceId}-${i}`}
                            role="listitem"
                            className="home-trow"
                            title={`${track.title} — ${track.artist}`}
                            onClick={() => void props.onPlay(sourceId, track, secTracks, sec.title)}
                          >
                            <span className="home-trow__no num">{String(i + 1).padStart(2, "0")}</span>
                            <span className="home-trow__art">
                              {track.coverUrl ? (
                                <img src={track.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                              ) : (
                                <TrackArt id={track.sourceId} size={32} radius={6} />
                              )}
                            </span>
                            <span className="home-trow__meta">
                              <span className="home-trow__title truncate">{track.title}</span>
                              <span className="home-trow__artist truncate">{track.artist}</span>
                            </span>
                            <span className="home-trow__dur num">{fmtDur(track.durationMs)}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
            </div>
          ) : null}

          <div className="disc__sect">
            <h2 className="sect-title">榜单<span>TOPLISTS</span></h2>
            <div className="row gap10">
              {canCharts && lists.length > 0 ? <span className="meta">{lists.length} 个榜单</span> : null}
              {canCharts ? (
                <button className="icon-btn" title="刷新榜单" onClick={() => {
                  if (!sourceId) return;
                  refreshNet(`charts:toplists:${sourceId}`);
                  refreshNet(`charts:home:${sourceId}`);
                  invalidatePrefix(`charts:tracks:${sourceId}:`);
                  setChartTick((t) => t + 1);
                }}><IconRefresh size={15} /></button>
              ) : null}
            </div>
          </div>

          {!canCharts ? <p className="lib-note">{sourceName} 不提供榜单，切到网易云或 QQ 音乐看榜。</p> : null}
          {listNote ? <p className="lib-note" role="status">{listNote}</p> : null}

          {canCharts && lists.length > 0 ? (
            <>
              <div className="chart-board" role="list" aria-label="榜单目录">
                {lists.map((list, i) => (
                  <button
                    key={list.id}
                    role="listitem"
                    className="chart-row"
                    onClick={() => openDetail({ id: list.id, name: list.name, coverUrl: list.coverUrl, kind: "chart" })}
                    title={list.name}
                  >
                    <span className="chart-row__no">{pad(i + 1)}</span>
                    <span className="chart-row__name truncate">{list.name}</span>
                    <span className="chart-row__count num">{list.count > 0 ? `${list.count} 首` : "—"}</span>
                    <IconArrowRight size={13} className="chart-row__go" />
                  </button>
                ))}
              </div>

            </>
          ) : null}

          {hot.length > 0 ? (
            <>
              <div className="disc__sect">
                <h2 className="sect-title">今日再听<span>HOT TRACKS</span></h2>
                <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>从{hotOrigin}里挑的几首</span>
              </div>
              <div className="hot-cards">
                {hot.slice(0, 2).map((t, i) => (
                  <button key={t.sourceId + i} className="hot-card" onClick={() => { void props.onPlay(sourceId, t, hot, hotOrigin); af.openPlayer(); }}>
                    {t.coverUrl ? <img className="hot-card__img" src={t.coverUrl} alt="" referrerPolicy="no-referrer" /> : <span className="hot-card__img" style={{ display: "grid", placeItems: "center" }}><TrackArt id={t.sourceId} size={62} radius={10} /></span>}
                    <span className="hot-card__body">
                      <span className="hot-card__kicker">HOT · {pad(i + 1)}</span>
                      <span className="hot-card__title truncate">{t.title}</span>
                      <span className="hot-card__meta truncate">{t.artist} · {t.album}</span>
                    </span>
                    <span className="hot-card__play"><IconPlay size={14} /></span>
                  </button>
                ))}
              </div>

              <AfTrackTable
                items={hot.map(toAf)}
                onPlay={(i) => { const t = hot[i]; if (t) { void props.onPlay(sourceId, t, hot, hotOrigin); af.openPlayer(); } }}
                sourceLabel={sourceName}
              />
            </>
          ) : null}

          <div className="disc__sect">
            <h2 className="sect-title">传单墙<span>FLYERS</span></h2>
            <button className="btn btn-ghost btn-sm" onClick={() => af.setPage("archive")}>全部演出<IconArrowRight size={14} /></button>
          </div>
          {flyerDays.length > 0 ? (
            <div className="flyers flyers--compact">
              {flyerDays.map((f, i) => (
                <div key={f.key} style={{ position: "relative" }}>
                  <Tape w={60} rot={-3} style={{ top: -9, left: "50%", marginLeft: -30 }} />
                  <button
                    className="flyer flyer__rot"
                    style={{ ["--rot" as string]: i === 1 ? "0.9deg" : "-1.2deg" }}
                    onClick={() => { af.setArchiveFilter("all"); af.setPage("archive"); }}
                    title={`${f.mon} ${f.day} · ${f.count} 首`}
                  >
                    <span
                      className={"flyer__img flyer__img--g" + (i % 3)}
                      style={f.cover ? { backgroundImage: `url("${f.cover}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    />
                    <span className="flyer__scrim"></span>
                    <span className="flyer__halftone"></span>
                    <span className="flyer__tag">{f.count} 首</span>
                    <span className="flyer__body">
                      <span className="flyer__kicker" style={{ display: "block" }}>{f.mon} {f.day} · SETLIST</span>
                      <span className="flyer__title" style={{ display: "block" }}>{f.title}</span>
                      <span className="flyer__meta"><span>已归档</span><span style={{ opacity: 0.5 }}>/</span><span>点开回看</span></span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="lib-note hand">还没有演出记录。随便播几首，这里就会长出第一张传单。</p>
          )}

          <div className="row gap8" style={{ marginTop: 24 }}>
            <IconSparkle size={13} style={{ color: "var(--pink-400)" }} />
            <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>推荐与榜单都由账号那边的数据算，这里只负责摆得好看。</span>
          </div>
        </>
      )}

      {loginOpen ? (
        <LoginDialog
          start={async (ch) => {
            const r = await props.startLogin(sourceId, ch);
            if (typeof r.key !== "string" || typeof r.qrImage !== "string") throw new Error("获取二维码失败");
            return { key: r.key, qrImage: r.qrImage };
          }}
          poll={props.pollLogin}
          scanHint={sourceId === "qq" ? "使用 QQ、微信、QQ 音乐任一 App 扫一扫" : "请打开网易云音乐 App → 扫一扫"}
          sourceName={sourceName}
          sendCaptcha={sourceId === "netease" ? props.sendCaptcha : undefined}
          loginByCaptcha={sourceId === "netease" ? props.loginByCaptcha : undefined}
          onSuccess={() => { setLoginOpen(false); acct.reload(); }}
          onClose={() => setLoginOpen(false)}
        />
      ) : null}
    </div>
  );
}
