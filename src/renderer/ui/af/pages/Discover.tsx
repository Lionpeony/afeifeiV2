/* 发现页 · 原型 .page.disc（每日推荐 / 榜单 / 热门 / 传单墙 + 搜索态）
   数据逻辑沿用现有 DiscoverView：账号每日推荐、榜单、搜索、下载。 */
import { Fragment, useEffect, useRef, useState } from "react";
import type { HomeSection, RemoteTrack, Toplist } from "../../../../contracts/capability.js";
import { getNet, invalidatePrefix, loadNet, refreshNet } from "../../../domain/net-cache/index.js";
import { subscribeAccountInvalidation, useAccountBundle, type AccountBundle } from "../../account-data.js";
import { toast } from "../../toast.js";
import { useActiveSource } from "../../use-active-source.js";
import { LoginDialog } from "../../views/discover/LoginDialog.js";
import { useAf } from "../context.js";
import { svcText, packCopy } from "../copy.js";
import { PALETTES } from "../data.js";
import { TrackArt } from "../art.js";
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
/* 行内小图降到缩略尺寸：详情页一次渲染 120 行，300px 原图要几百 KB。
   QQ 的 gtimg 用路径段控制尺寸，网易云用 param 查询参数。 */
const thumb = (url: string | undefined, size: number): string | undefined => {
  if (!url) return url;
  if (url.includes("y.gtimg.cn")) {
    /* y.gtimg 只烤固定尺寸（90/120/150/300/500 实测，R64x64 直接 404）——
       取 ≥ 请求尺寸的最小一档，不然 QQ 的行内封面全是破图（2026-11-21 用户实测：每日推荐） */
    const bucket = [90, 120, 150, 300, 500].find((s) => s >= size) ?? 500;
    return url.replace(/R\d+x\d+M000/, `R${bucket}x${bucket}M000`);
  }
  if (url.includes("music.126.net")) {
    const clean = url.replace(/[?&]param=\d+y\d+/, "");
    return `${clean}${clean.includes("?") ? "&" : "?"}param=${size}y${size}`;
  }
  return url;
};
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
/** 一次即止：卡片 stagger 只在冷启动后首进发现页播一次，回页不重放（polish.css §17 [data-first]） */
let staggerPlayed = false;

/** 今日一句 · 手写便签（E-氛围）：句子随包换口气，按一年中的第几天轮换，落款包名。 */
function NoteLine({ palette }: { palette: string }) {
  const quotes = packCopy(palette).noteQuotes;
  const now = new Date();
  const doy = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const text = quotes[doy % quotes.length] ?? quotes[0];
  const from = PALETTES.find((p) => p.id === palette)?.label ?? "阿飞飞";
  return (
    <section className="disc-note" aria-label="今日一句">
      <p className="disc-note__text">{text}</p>
      <span className="disc-note__from">—— {from}</span>
    </section>
  );
}

type DetailKind = "chart" | "playlist" | "artist" | "album";
interface DetailRef {
  id: string;
  name: string;
  coverUrl?: string;
  kind: DetailKind;
}
/** 返回栈里保存的是整份视图状态：退回上级不重拉、也不丢展开页数 */
interface DetailSnapshot {
  ref: DetailRef;
  tracks: RemoteTrack[];
  next?: number;
  note: string;
  shown: number;
  scroll: number;
}

export function DiscoverPage(props: DiscoverPageProps) {
  const af = useAf();
  const [sourceId] = useActiveSource(props.sources);
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
  const [detailStack, setDetailStack] = useState<DetailSnapshot[]>([]);
  const [detailTracks, setDetailTracks] = useState<RemoteTrack[]>([]);
  const [detailNext, setDetailNext] = useState<number | undefined>(undefined);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailNote, setDetailNote] = useState("");
  const [detailShown, setDetailShown] = useState(0);
  const [homeNote, setHomeNote] = useState("");
  const detailReq = useRef(0);
  /* 已经发过预取的 key：指针扫过一排卡片时只发一次，失败才允许重试 */
  const prefetched = useRef(new Set<string>());
  const savedScroll = useRef(0);
  const [chartTick, setChartTick] = useState(0);
  const canCharts = currentSource?.canToplists === true;
  /** 榜单目录封顶：先给 12 行索引，想翻全量再展开（30+ 行同权重平铺会把后面的节全埋掉） */
  const [allCharts, setAllCharts] = useState(false);

  /* stagger 播完一轮（12×30ms + 260ms ≈ 620ms）就置位，回页不再重放 */
  useEffect(() => {
    const t = setTimeout(() => { staggerPlayed = true; }, 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!sourceId || !canCharts) {
      setLists([]);
      detailReq.current += 1;
      setDetail(null);
      setDetailStack([]);
      setListNote("");
      return;
    }
    let alive = true;
    const key = `charts:toplists:${sourceId}`;
    setLists(getNet<Toplist[]>(key) ?? []);
    detailReq.current += 1;
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
    setHomeNote("");
    loadNet(key, () => props.home(sourceId))
      .then((sections) => {
        if (alive) setHomeSections(sections);
      })
      .catch(() => {
        if (alive) {
          setHomeSections([]);
          setHomeNote("推荐栏目暂时取不到，点右上角刷新再试");
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, chartTick]);

  /** 打开详情：记住列表滚动位置；从详情里再点歌手/专辑时把整份视图压栈 */
  const openDetail = (item: DetailRef): void => {
    const main = document.querySelector<HTMLElement>(".main__page");
    if (detail) {
      setDetailStack((s) => [
        ...s,
        {
          ref: detail,
          tracks: detailTracks,
          next: detailNext,
          note: detailNote,
          shown: detailShown,
          scroll: main ? main.scrollTop : 0,
        },
      ]);
    } else {
      savedScroll.current = main ? main.scrollTop : 0;
    }
    detailReq.current += 1;
    setDetail(item);
    setDetailTracks([]);
    setDetailNext(undefined);
    setDetailBusy(false);
    setDetailNote("");
    setDetailShown(0);
    if (main) main.scrollTop = 0;
    void loadDetail(item.kind, item.id, 0);
  };

  const loadDetail = async (kind: DetailKind, listId: string, page: number): Promise<void> => {
    const key = `charts:tracks:${sourceId}:${kind}:${listId}:${page}`;
    const req = detailReq.current;
    const cached = page === 0 ? getNet<{ items: RemoteTrack[]; nextPage?: number }>(key) : undefined;
    if (cached) {
      if (req !== detailReq.current) return;
      setDetailBusy(false);
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
      if (req !== detailReq.current) return; // 期间换了详情/切了源：旧结果作废
      setDetailTracks((prev) => (page === 0 ? result.items : [...prev, ...result.items]));
      setDetailNext(result.nextPage);
      setDetailShown((n) => (page === 0 ? Math.min(120, result.items.length) : n + result.items.length));
      if (page === 0 && result.items.length === 0) setDetailNote("这里暂时取不到曲目。");
    } catch (err) {
      if (req === detailReq.current) setDetailNote(err instanceof Error ? err.message : String(err));
    } finally {
      if (req === detailReq.current) setDetailBusy(false);
    }
  };

  /* 悬停/聚焦预取详情首屏：指针从卡片扫到点下去这段，网络已经在跑 */
  const prefetchDetail = (kind: DetailKind, listId: string): void => {
    if (!sourceId) return;
    const key = `charts:tracks:${sourceId}:${kind}:${listId}:0`;
    if (getNet(key) || prefetched.current.has(key)) return;
    prefetched.current.add(key);
    const loader =
      kind === "artist" ? props.artistTracks : kind === "album" ? props.albumTracks : props.playlistTracks;
    void loadNet(key, () => loader(sourceId, listId, 0)).catch(() => prefetched.current.delete(key));
  };

  const closeDetail = (): void => {
    if (detailStack.length > 0) {
      const prev = detailStack[detailStack.length - 1]!;
      setDetailStack((s) => s.slice(0, -1));
      detailReq.current += 1;
      setDetail(prev.ref);
      setDetailBusy(false);
      setDetailTracks(prev.tracks);
      setDetailNext(prev.next);
      setDetailNote(prev.note);
      setDetailShown(prev.shown);
      setTimeout(() => {
        const main = document.querySelector<HTMLElement>(".main__page");
        if (main) main.scrollTop = prev.scroll;
      }, 0);
      return;
    }
    detailReq.current += 1;
    setDetail(null);
    setDetailStack([]);
    setDetailBusy(false);
    setDetailTracks([]);
    setDetailNext(undefined);
    setDetailNote("");
    setDetailShown(0);
    setTimeout(() => {
      const main = document.querySelector<HTMLElement>(".main__page");
      if (main) main.scrollTop = savedScroll.current;
    }, 0);
  };

  /* 搜索浮层 / 搜索表发起的艺人 / 专辑跳转：at 变化即开门（详情系统在页内，通路是 af.discoverDetail） */
  const detailSeekAt = af.discoverDetail?.at ?? 0;
  useEffect(() => {
    const ref = af.discoverDetail;
    if (!ref) return;
    openDetail({ kind: ref.kind, id: ref.id, name: ref.name, coverUrl: ref.coverUrl });
    af.clearDiscoverDetail(); // 一次性信号：消费即清，回页不再自动重开
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailSeekAt]);

  /* 登录/退出后账号相关的推荐缓存要刷新，否则首页栏目还是匿名数据 */
  useEffect(() => subscribeAccountInvalidation(() => setChartTick((t) => t + 1)), []);

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
      toast(svcText(await props.onDownload(sourceId, track)));
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
        toast(svcText(await props.onDownloadMany(sourceId, picked)));
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
                <div className="setlist-poster__badges">
                  <span className="setlist-badge num">
                    {detailTracks.length > 0 ? `${detailTracks.length} 首` : "取曲目中…"}
                  </span>
                  {detailTracks.length > 0 ? <span className="setlist-badge num">约 {loadedMin} 分钟</span> : null}
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
                          <img src={thumb(t.coverUrl, 96)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                        ) : (
                          <TrackArt id={t.sourceId} size={38} radius={7} />
                        )}
                        <span className="tracklist__artplay" aria-hidden="true"><IconPlay size={12} /></span>
                      </button>
                      <span className="tracklist__main">
                        <button type="button" className="tracklist__title" onClick={play}>
                          {t.title}
                          {t.vip ? <span className="tbl__badge is-vip">VIP</span> : null}
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
                  {t.coverUrl ? <img className="tbl__cover" src={thumb(t.coverUrl, 64)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <TrackArt id={t.sourceId} size={34} radius={4} />}
                  <span className="tbl__title-text">
                    <span className="tbl__name-row">
                      <span className="tbl__name truncate">{t.title}</span>
                      {t.vip ? <span className="tbl__badge is-vip">VIP</span> : null}
                    </span>
                  </span>
                </span>
                <span className="tbl__c-artist truncate">
                  {t.artistId ? (
                    <button
                      type="button"
                      className="tbl__link"
                      title={`查看歌手 ${t.artist}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail({ id: t.artistId!, name: t.artist, coverUrl: t.coverUrl, kind: "artist" });
                      }}
                    >
                      {t.artist}
                    </button>
                  ) : (
                    t.artist
                  )}
                </span>
                <span className="tbl__c-album truncate">
                  {t.albumId ? (
                    <button
                      type="button"
                      className="tbl__link"
                      title={`查看专辑 ${t.album}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail({ id: t.albumId!, name: t.album, coverUrl: t.coverUrl, kind: "album" });
                      }}
                    >
                      {t.album}
                    </button>
                  ) : (
                    t.album
                  )}
                </span>
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
                    <span className="mix-row__art" aria-hidden="true">
                      {t.coverUrl ? <img src={thumb(t.coverUrl, 64)} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <TrackArt id={t.sourceId} size={26} radius={5} />}
                    </span>
                    <span className="mix-row__title truncate">{t.title}</span>
                    <span className="mix-row__artist truncate">{t.artist}</span>
                    <span className="mix-row__dur num">{fmtDur(t.durationMs)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mix__bigdate" aria-hidden="true"><b>{dayNum}</b><span>{monStr}</span></div>
          </section>

          {homeNote ? <p className="lib-note" role="status">{homeNote}</p> : null}

          {homeSections
            .filter((sec) => sec.layout === "cards")
            .map((sec) => (
              <section className="disc__sect home-sec" key={sec.id}>
                <h2 className="sect-title">
                  {sec.title}
                  {sec.subtitle ? <span>{sec.subtitle}</span> : null}
                </h2>
                <div className="home-grid" role="list" aria-label={sec.title} data-first={staggerPlayed ? undefined : "1"}>
                  {sec.items.map((item) =>
                    item.kind === "playlist" ? (
                      <button
                        key={item.id}
                        role="listitem"
                        className="home-card"
                        title={item.title}
                        onClick={() => openDetail({ id: item.id, name: item.title, coverUrl: item.coverUrl, kind: "playlist" })}
                        onPointerEnter={() => prefetchDetail("playlist", item.id)}
                        onFocus={() => prefetchDetail("playlist", item.id)}
                      >
                        <span className="home-card__art">
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
                                <img src={thumb(track.coverUrl, 64)} alt="" loading="lazy" referrerPolicy="no-referrer" />
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

          {/* 今日再听紧跟推荐单曲：同是歌块，排在一起扫一遍就完（不再隔着榜单目录互相打断） */}
          {hot.length > 0 ? (
            <>
              <div className="disc__sect">
                <h2 className="sect-title">今日再听<span>HOT TRACKS</span></h2>
                <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>从{hotOrigin}里挑的几首</span>
              </div>
              {/* 卡片即列表：不再在卡片下面重复摆同一批歌的表格 */}
              <div className="hot-cards">
                {hot.slice(0, 4).map((t, i) => (
                  <button key={t.sourceId + i} className="hot-card" onClick={() => { void props.onPlay(sourceId, t, hot, hotOrigin); af.openPlayer(); }}>
                    {t.coverUrl ? <img className="hot-card__img" src={thumb(t.coverUrl, 124)} alt="" referrerPolicy="no-referrer" /> : <span className="hot-card__img" style={{ display: "grid", placeItems: "center" }}><TrackArt id={t.sourceId} size={62} radius={10} /></span>}
                    <span className="hot-card__body">
                      <span className="hot-card__kicker">HOT · {pad(i + 1)}</span>
                      <span className="hot-card__title truncate">{t.title}</span>
                      <span className="hot-card__meta truncate">{t.artist} · {fmtDur(t.durationMs)}</span>
                    </span>
                    <span className="hot-card__play"><IconPlay size={14} /></span>
                  </button>
                ))}
              </div>
            </>
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

          {!canCharts ? (
            <p className="lib-note">
              {sourceName} 不提供榜单，切到网易云或 QQ 音乐看榜。
              {canLogin ? <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }} onClick={() => setLoginOpen(true)}>登录看网易云榜单</button> : null}
            </p>
          ) : null}
          {listNote ? <p className="lib-note" role="status">{listNote}</p> : null}

          {canCharts && lists.length > 0 ? (
            <div role="list" aria-label="榜单目录">
              {/* 前 3 榜给封面特写（有图用图，无图用首字），做视觉锚点 */}
              <div className="chart-feat-row">
                {lists.slice(0, 3).map((list, i) => (
                  <button
                    key={list.id}
                    role="listitem"
                    className="chart-feat"
                    onClick={() => openDetail({ id: list.id, name: list.name, coverUrl: list.coverUrl, kind: "chart" })}
                    onPointerEnter={() => prefetchDetail("chart", list.id)}
                    onFocus={() => prefetchDetail("chart", list.id)}
                    title={list.name}
                  >
                    <span className="chart-feat__art">
                      {list.coverUrl ? (
                        <img src={list.coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="chart-feat__initial" aria-hidden="true">{list.name.trim().slice(0, 1)}</span>
                      )}
                      <span className="chart-feat__no num">NO.{pad(i + 1)}</span>
                    </span>
                    <span className="chart-feat__body">
                      <span className="chart-feat__name truncate">{list.name}</span>
                      <span className="chart-feat__meta num">
                        {list.count > 0 ? `${list.count} 首` : "本周更新"}
                        <IconArrowRight size={13} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {/* 其余榜单：三列单据行，先给 12 行索引，想翻全量再展开（目录是索引不是主菜） */}
              <div className="chart-grid">
                {(allCharts ? lists.slice(3) : lists.slice(3, 15)).map((list, i) => (
                  <button
                    key={list.id}
                    role="listitem"
                    className="chart-row"
                    onClick={() => openDetail({ id: list.id, name: list.name, coverUrl: list.coverUrl, kind: "chart" })}
                    onPointerEnter={() => prefetchDetail("chart", list.id)}
                    onFocus={() => prefetchDetail("chart", list.id)}
                    title={list.name}
                  >
                    <span className="chart-row__no">{pad(i + 4)}</span>
                    <span className="chart-row__name truncate">{list.name}</span>
                    <span className="chart-row__count num">{list.count > 0 ? `${list.count} 首` : "—"}</span>
                    <IconArrowRight size={13} className="chart-row__go" />
                  </button>
                ))}
              </div>
              {lists.length > 15 ? (
                <div className="row gap10" style={{ marginTop: 12 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAllCharts((v) => !v)}>
                    {allCharts ? "收起目录" : `其余 ${lists.length - 15} 个榜单`}<IconArrowRight size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 今日一句挪到传单墙前：开场让位给内容，收尾留给情绪（安可词） */}
          <NoteLine palette={af.palette} />

          <div className="disc__sect">
            <h2 className="sect-title">传单墙<span>FLYERS</span></h2>
            <button className="btn btn-ghost btn-sm" onClick={() => af.setPage("archive")}>全部演出<IconArrowRight size={14} /></button>
          </div>
          {flyerDays.length > 0 ? (
            <div className="flyers flyers--compact">
              {flyerDays.map((f, i) => (
                <div key={f.key} style={{ position: "relative" }}>
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
