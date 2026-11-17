/* 发现页 · 原型 .page.disc（每日推荐 / 榜单 / 热门 / 传单墙 + 搜索态）
   数据逻辑沿用现有 DiscoverView：账号每日推荐、榜单、搜索、下载。 */
import { useEffect, useState } from "react";
import type { RemoteTrack, Toplist } from "../../../../contracts/capability.js";
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
import { IconArrowRight, IconPlay, IconRefresh, IconSparkle, IconDownload } from "../icons.js";
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
  playlistTracks(sourceId: string, listId: string, page?: number): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
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
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const HOT_GRADS = 4;

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
  const [pick, setPick] = useState<string | null>(null);
  const [tracks, setTracks] = useState<RemoteTrack[]>([]);
  const [nextPage, setNextPage] = useState<number | undefined>(undefined);
  const [chartNote, setChartNote] = useState("");
  const [chartBusy, setChartBusy] = useState(false);
  const [chartTick, setChartTick] = useState(0);
  const canCharts = currentSource?.canToplists === true;

  useEffect(() => {
    if (!sourceId || !canCharts) {
      setLists([]);
      setPick(null);
      setTracks([]);
      setNextPage(undefined);
      setChartNote("");
      return;
    }
    let alive = true;
    const key = `charts:toplists:${sourceId}`;
    setLists(getNet<Toplist[]>(key) ?? []);
    setPick(null);
    setTracks([]);
    setNextPage(undefined);
    setChartNote("");
    loadNet(key, () => props.listToplists(sourceId))
      .then((list) => {
        if (!alive) return;
        setLists(list);
        if (list.length === 0) setChartNote("这个音源没有给出榜单。");
      })
      .catch((err: unknown) => {
        if (alive) setChartNote(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, chartTick, canCharts]);

  const loadTracks = async (listId: string, page: number): Promise<void> => {
    const key = `charts:tracks:${sourceId}:${listId}:${page}`;
    const cached = page === 0 ? getNet<{ items: RemoteTrack[]; nextPage?: number }>(key) : undefined;
    if (cached) {
      setTracks(cached.items);
      setNextPage(cached.nextPage);
      return;
    }
    setChartBusy(true);
    setChartNote("");
    try {
      const result = await loadNet(key, () => props.playlistTracks(sourceId, listId, page));
      setTracks((prev) => (page === 0 ? result.items : [...prev, ...result.items]));
      setNextPage(result.nextPage);
      if (page === 0 && result.items.length === 0) setChartNote("这个榜单暂时取不到曲目。");
    } catch (err) {
      setChartNote(err instanceof Error ? err.message : String(err));
    } finally {
      setChartBusy(false);
    }
  };

  useEffect(() => {
    if (pick !== null || lists.length === 0) return;
    setPick(lists[0]!.id);
    void loadTracks(lists[0]!.id, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists]);

  const selectedList = lists.find((l) => l.id === pick) ?? null;

  const playChart = async (track: RemoteTrack): Promise<void> => {
    try {
      await props.onPlay(sourceId, track, tracks, selectedList?.name);
      af.openPlayer();
    } catch (err) {
      setChartNote(err instanceof Error ? err.message : String(err));
    }
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
  const hot = (acct.songs.length > 0 ? acct.songs : tracks).slice(0, 8);
  const hotOrigin = acct.songs.length > 0 ? "今日推荐" : selectedList?.name ?? "当前榜单";

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

          <div className="disc__sect">
            <h2 className="sect-title">榜单<span>TOPLISTS</span></h2>
            <div className="row gap10">
              {canCharts && lists.length > 0 ? <span className="meta">{lists.length} 个榜单</span> : null}
              {canCharts ? (
                <button className="icon-btn" title="刷新榜单" onClick={() => {
                  if (!sourceId) return;
                  refreshNet(`charts:toplists:${sourceId}`);
                  invalidatePrefix(`charts:tracks:${sourceId}:`);
                  setChartTick((t) => t + 1);
                }}><IconRefresh size={15} /></button>
              ) : null}
            </div>
          </div>

          {!canCharts ? <p className="lib-note">{sourceName} 不提供榜单，切到网易云或 QQ 音乐看榜。</p> : null}
          {chartNote ? <p className="lib-note" role="status">{chartNote}</p> : null}

          {canCharts && lists.length > 0 ? (
            <>
              <div className="toplists scroll-x disc-strip" role="list" aria-label="榜单目录">
                {lists.map((list, i) => (
                  <button key={list.id} role="listitem" className={"top-card" + (pick === list.id ? " is-active" : "")} onClick={() => { setPick(list.id); void loadTracks(list.id, 0); }} title={list.name}>
                    <span className={"top-card__art g" + (i % HOT_GRADS)}>
                      <IconPlay size={15} style={{ opacity: 0.5, color: "var(--on-accent)", position: "relative", zIndex: 1 }} />
                      <b>{list.name}</b>
                      <span className="top-card__no">{pad(i + 1)}</span>
                    </span>
                    <span className="top-card__name">{list.name}</span>
                    <span className="top-card__count num">{list.count > 0 ? `${list.count} 首` : "—"}</span>
                  </button>
                ))}
              </div>

              {selectedList ? (
                <div className="top-preview paper">
                  <Tape w={64} rot={-2} style={{ top: -9, left: 26 }} />
                  <div className="top-preview__head">
                    <div>
                      <div className="h2">{selectedList.name}</div>
                      <div className="meta">{tracks.length > 0 ? `${tracks.length} 首` : "取曲目中…"}</div>
                    </div>
                    <button className="btn btn-soft btn-sm" disabled={!tracks[0]} onClick={() => tracks[0] && void playChart(tracks[0])}>
                      <IconPlay size={13} />播放这个榜
                    </button>
                  </div>
                  <AfTrackTable
                    items={tracks.slice(0, 6).map(toAf)}
                    onPlay={(i) => { const t = tracks[i]; if (t) void playChart(t); }}
                    dense
                    sourceLabel={sourceName}
                  />
                  {chartBusy && tracks.length === 0 ? <div className="search-busy"><span className="hand">取曲目中……</span></div> : null}
                  {tracks.length > 6 ? (
                    <button className="top-preview__more" onClick={() => { if (pick) void loadTracks(pick, 0); }}>
                      展开全部 {tracks.length} 首<IconArrowRight size={13} />
                    </button>
                  ) : null}
                  {nextPage !== undefined ? (
                    <button className="top-preview__more" disabled={chartBusy} onClick={() => pick && void loadTracks(pick, nextPage)}>
                      {chartBusy ? "加载中…" : "加载更多"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {hot.length > 0 ? (
            <>
              <div className="disc__sect">
                <h2 className="sect-title">今日再听<span>HOT TRACKS</span></h2>
                <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>从{hotOrigin}里挑的几首</span>
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
            <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>推荐与榜单都由账号那边的数据算，这里只负责摆得好看。</span>
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
