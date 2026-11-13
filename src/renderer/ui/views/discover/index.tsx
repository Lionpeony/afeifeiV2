import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { RemoteTrack, Toplist } from "../../../../contracts/capability.js";
import { getNet, invalidatePrefix, loadNet, refreshNet } from "../../../domain/net-cache/index.js";
import { useAccountBundle, type AccountBundle } from "../../account-data.js";
import { PageHead } from "../../PageHead.js";
import { RefreshButton } from "../../RefreshButton.js";
import { Segmented } from "../../Segmented.js";
import { toast } from "../../toast.js";
import { useActiveSource } from "../../use-active-source.js";
import { LoginDialog } from "../online/LoginDialog.js";

export interface SourceOption {
  id: string;
  name: string;
  canAuth: boolean;
  /** 能力驱动（00 §7.2）：canGetUrl 才有下载按钮，UI 不做特判 */
  canDownload: boolean;
  /** 能力驱动（M9-5）：canListPlaylists 才进歌单页 */
  canPlaylists: boolean;
  /** 能力驱动（A-14）：canGetToplist 才进榜单区 */
  canToplists: boolean;
}

export interface DiscoverViewProps {
  sources: SourceOption[];
  /** 每日推荐（账号数据族的一员，宿主已接 accountBundle("daily")） */
  daily(): Promise<AccountBundle>;
  listToplists(sourceId: string): Promise<Toplist[]>;
  /** 下钻：榜单 id 就是只读歌单 id，复用歌单取曲目（不在音源侧写第二套） */
  playlistTracks(
    sourceId: string,
    listId: string,
    page?: number,
  ): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  onPlay(sourceId: string, track: RemoteTrack, list?: RemoteTrack[], origin?: string): Promise<void>;
  onSearch(sourceId: string, keyword: string): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  onDownload(sourceId: string, track: RemoteTrack): Promise<string>;
  onDownloadMany(sourceId: string, tracks: RemoteTrack[]): Promise<string>;
  loginStatus(sourceId: string): Promise<{ loggedIn: boolean; nick: string | null }>;
  startLogin(sourceId: string, channel?: string): Promise<{ key?: string; qrImage?: string; loggedIn?: boolean }>;
  pollLogin(key: string): Promise<{ code: number; loggedIn: boolean; message: string }>;
  sendCaptcha(phone: string): Promise<{ ok: boolean; message: string }>;
  loginByCaptcha(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>;
  logout(sourceId: string): Promise<void>;
  /** 顶栏搜索提交：at 变化即用 text 发起一次搜索 */
  seekQuery?: { text: string; at: number } | null;
  tabs?: ReactNode;
}

const pad = (n: number): string => String(n).padStart(2, "0");

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * 发现页（2026-11-13 重设计）：一页三件事，没有页内 tab。
 *
 * 1. 每日推荐 → 页面主视觉（账号数据，登录才有；未登录就明说，不编假歌单）
 * 2. 榜单 → 封面卡带 + 同页下钻（复用 .chart-champ / .online-row 的放榜语言）
 * 3. 搜索 → 顶栏是唯一入口，提交后整页切成结果态，清空即回发现态
 *
 * 为什么不再分「结果 / 榜单」两个 tab：它们是同一件事的三个段落，不是三种模式。
 * 顶栏搜索是任务态，任务结束清空关键词，页面自然回到推荐与榜单。
 */
export function DiscoverView({
  sources,
  daily,
  listToplists,
  playlistTracks,
  onPlay,
  onSearch,
  onDownload,
  onDownloadMany,
  loginStatus,
  startLogin,
  pollLogin,
  sendCaptcha,
  loginByCaptcha,
  logout,
  seekQuery,
  tabs,
}: DiscoverViewProps) {
  const [sourceId, setSourceId] = useActiveSource(sources);
  const currentSource = sources.find((s) => s.id === sourceId);
  const sourceName = currentSource?.name ?? sourceId;
  const canLogin = currentSource?.canAuth === true;

  const acct = useAccountBundle(daily, "daily");

  /* ---- 登录：随源切换重查，账号状态是每日推荐的前置条件 ---- */
  const [nick, setNick] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [note, setNote] = useState("");

  const refreshLogin = (): void => {
    if (!sourceId) return;
    void loginStatus(sourceId)
      .then((s) => {
        setLoggedIn(s.loggedIn);
        setNick(s.loggedIn ? (s.nick ?? "") : null);
      })
      .catch(() => {
        setLoggedIn(false);
        setNick(null);
      });
  };
  useEffect(() => {
    refreshLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const openLogin = async (): Promise<void> => {
    if (loggedIn) return;
    try {
      const status = await loginStatus(sourceId);
      if (status.loggedIn) {
        setLoggedIn(true);
        setNick(status.nick ?? "");
        return;
      }
    } catch {
      /* 查不到状态就当未登录，继续弹二维码 */
    }
    setLoginOpen(true);
  };

  const doLogout = async (): Promise<void> => {
    setNote("");
    try {
      await logout(sourceId);
      setLoggedIn(false);
      setNick(null);
      acct.reload();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  /* ---- 榜单：卡带 + 下钻 ---- */
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
    // 命中缓存就先摆出来：切页/切源不该闪一下空列表
    setLists(getNet<Toplist[]>(key) ?? []);
    setPick(null);
    setTracks([]);
    setNextPage(undefined);
    setChartNote("");
    loadNet(key, () => listToplists(sourceId))
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
    // 命中缓存就同步摆出来，不置 busy —— 切榜再切回来不该闪一次骨架
    const cached = page === 0 ? getNet<{ items: RemoteTrack[]; nextPage?: number }>(key) : undefined;
    if (cached) {
      setTracks(cached.items);
      setNextPage(cached.nextPage);
      return;
    }
    setChartBusy(true);
    setChartNote("");
    try {
      const result = await loadNet(key, () => playlistTracks(sourceId, listId, page));
      setTracks((prev) => (page === 0 ? result.items : [...prev, ...result.items]));
      setNextPage(result.nextPage);
      if (page === 0 && result.items.length === 0) setChartNote("这个榜单暂时取不到曲目。");
    } catch (err) {
      setChartNote(err instanceof Error ? err.message : String(err));
    } finally {
      setChartBusy(false);
    }
  };

  /* 一进页就把第一个榜摆出来：下钻区空着只会被读成「页面坏了」 */
  useEffect(() => {
    if (pick !== null || lists.length === 0) return;
    setPick(lists[0]!.id);
    void loadTracks(lists[0]!.id, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists]);

  const selectedList = lists.find((l) => l.id === pick) ?? null;

  const playChart = async (track: RemoteTrack): Promise<void> => {
    try {
      await onPlay(sourceId, track, tracks, selectedList?.name);
    } catch (err) {
      setChartNote(err instanceof Error ? err.message : String(err));
    }
  };

  /* ---- 搜索：任务态。有关键词时整页只显示结果 ---- */
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<RemoteTrack[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /* QQ 搜索实测要 20–45s：5s 后把「还在搜」说出来，别让人对着空白区猜死活 */
  const [slow, setSlow] = useState(false);

  const run = async (query: string): Promise<void> => {
    if (!sourceId || !query) return;
    setBusy(true);
    setSlow(false);
    setNote("");
    const slowTimer = setTimeout(() => setSlow(true), 5000);
    try {
      const result = await onSearch(sourceId, query);
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
    if (!seekQuery?.text) return;
    setKeyword(seekQuery.text);
    void run(seekQuery.text);
    // 只认 at：同一关键词再次提交也要重新搜
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekQuery?.at]);

  /* 换音源：带着同一个词在新源上重搜，免得表头写着 QQ、行却是网易云的结果 */
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
      // 来源标签截到 16 字：播放页「来自 …」那句话吃的是它，太长会把文案顶破
      const short = keyword.length > 16 ? `${keyword.slice(0, 16)}…` : keyword;
      await onPlay(sourceId, track, rows, keyword ? `搜索 · ${short}` : undefined);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const download = async (track: RemoteTrack): Promise<void> => {
    setNote("");
    try {
      toast(await onDownload(sourceId, track)); // 成功是瞬态通知，走小票不占 note
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
      toast(await onDownloadMany(sourceId, picked));
      setSelected(new Set());
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  /* 今日：日期是页面唯一的时间感，用真实本地时间，不做假倒计时 */
  const today = new Date();
  const dailyCover = acct.songs[0]?.coverUrl ?? null;
  const dailySub = acct.hint
    ? acct.hint
    : acct.loading
      ? "正在取今天的推荐…"
      : `来自${sourceName}账号 · ${acct.songs.length} 首 · 每天 06:00 换新`;

  return (
    <section className="library discover">
      <PageHead title="发现" meta={`DISCOVER · ${sources.length} SOURCES`} extra={tabs} />

      <div className="lib-head">
        {sources.length > 0 ? (
          <Segmented
            label="音源"
            items={sources.map((s) => ({ id: s.id, name: s.name }))}
            value={sourceId}
            onChange={setSourceId}
          />
        ) : null}
        {currentSource && !canLogin ? <span className="badge">免登录</span> : null}
        {canLogin && !loggedIn ? (
          <button type="button" onClick={() => void openLogin()}>
            登录{sourceName}
          </button>
        ) : null}
        {canLogin && loggedIn ? (
          <>
            <span className="badge badge--on" title={nick ? `已登录：${nick}` : "已登录"}>
              {nick ? nick : "已登录"}
            </span>
            <button type="button" onClick={() => void doLogout()}>
              退出
            </button>
          </>
        ) : null}
        {/* 右端只放「这一批结果的批量操作」：跟音源/账号不是一类东西，靠右顶开 */}
        <div className="lib-head-end">
          {currentSource?.canDownload && rows.length > 0 ? (
            <>
              <button type="button" onClick={() => setSelected(new Set(rows.map((t) => t.sourceId)))}>
                全选
              </button>
              <button
                type="button"
                className="primary"
                disabled={selected.size === 0}
                onClick={() => void downloadMany()}
              >
                下载选中{selected.size > 0 ? `（${selected.size}）` : ""}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {loginOpen ? (
        <LoginDialog
          start={async (ch) => {
            // 两个源的 startLogin 返回同形状 { key, qrImage }；pollLogin 按 key 前缀分流
            const r = await startLogin(sourceId, ch);
            if (typeof r.key !== "string" || typeof r.qrImage !== "string") {
              throw new Error("获取二维码失败");
            }
            return { key: r.key, qrImage: r.qrImage };
          }}
          poll={pollLogin}
          // Folia 同款：一张码三种 App 都能扫（qqmusic 通道换凭证按 App 实报类型适配，见 qqClient）
          scanHint={sourceId === "qq" ? "使用 QQ、微信、QQ 音乐任一 App 扫一扫" : "请打开网易云音乐 App → 扫一扫"}
          sourceName={sourceName}
          sendCaptcha={sourceId === "netease" ? sendCaptcha : undefined}
          loginByCaptcha={sourceId === "netease" ? loginByCaptcha : undefined}
          onSuccess={() => {
            setLoginOpen(false);
            refreshLogin();
            acct.reload();
          }}
          onClose={() => setLoginOpen(false)}
        />
      ) : null}

      {/* 异步结果要能读屏播报，不然只有看得见的人知道出了事 */}
      {note ? (
        <p className="lib-note" role="status">
          {note}
        </p>
      ) : null}
      {slow ? (
        <p className="lib-note dim" role="status">
          还在搜——这个音源的上游响应比较慢，再等几秒。
        </p>
      ) : null}

      <div className="disc-scroll">
        {keyword ? (
          /* ================= 搜索态：任务优先，只留结果 ================= */
          <section className="disc-found" aria-label="搜索结果">
            <p className="list-now">
              <b>{keyword}</b>
              <span>{busy ? "搜索中…" : rows.length > 0 ? `${rows.length} 条` : "没有结果"}</span>
              <button type="button" className="list-now-x" onClick={clearQuery}>
                清空
              </button>
            </p>
            {/* 表头只在有结果（或正在搜）时出现：空着的时候一列表头压在空态上，像页面坏了 */}
            {rows.length > 0 || busy ? (
              <div className={`lib-thead online-thead${currentSource?.canDownload ? " with-btn" : ""}`}>
                <span className="th-cover" aria-hidden="true" />
                <span className="th-title">TITLE</span>
                <span className="th-a">ARTIST</span>
                <span className="th-b">ALBUM</span>
                <span className="th-dur">TIME</span>
              </div>
            ) : null}
            {busy ? (
              /* 骨架行：搜索期间结果区不再是空白一片（QQ 上游实测要几十秒） */
              <div className="online-skel" aria-hidden="true">
                {Array.from({ length: 8 }, (_, i) => (
                  <div className="sk-row" key={i} style={{ "--i": i } as CSSProperties}>
                    <span className="sk-bar t" />
                    <span className="sk-bar a" />
                    <span className="sk-bar d" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {rows.map((track) => (
                  <div
                    key={track.sourceId}
                    className="lib-row online-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => void playFound(track)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      void playFound(track);
                    }}
                    title={`${track.title} — ${track.artist}`}
                  >
                    <span className="row-cover">
                      {track.coverUrl ? (
                        <img
                          src={track.coverUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <i aria-hidden="true" />
                      )}
                    </span>
                    <span className="lib-title">
                      {currentSource?.canDownload ? (
                        <input
                          type="checkbox"
                          className="online-pick"
                          checked={selected.has(track.sourceId)}
                          aria-label={`选择 ${track.title}`}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => togglePick(track.sourceId)}
                        />
                      ) : null}
                      {track.title}
                    </span>
                    <span className="lib-artist">{track.artist}</span>
                    <span className="lib-artist">{track.album}</span>
                    <span className="lib-dur">{fmtDuration(track.durationMs)}</span>
                    {currentSource?.canDownload ? (
                      <button
                        type="button"
                        className="dl-btn"
                        title="下载到本地"
                        onClick={(e) => {
                          e.stopPropagation();
                          void download(track);
                        }}
                      >
                        下载
                      </button>
                    ) : null}
                  </div>
                ))}
                {rows.length === 0 && !note ? (
                  <p className="lib-empty lib-empty--inline">没搜到。换个词试试。</p>
                ) : null}
              </>
            )}
          </section>
        ) : (
          <>
            {/* ================= 每日推荐：整页主视觉 ================= */}
            <section className={`disc-daily${acct.hint ? " locked" : ""}`} aria-label="每日推荐">
              <div className="disc-hero">
                <span className="disc-hero-cover">
                  {dailyCover ? (
                    <img src={dailyCover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                  ) : (
                    <i aria-hidden="true" />
                  )}
                </span>
                <div className="disc-hero-tx">
                  <span className="disc-kicker">DAILY MIX · 今日发行</span>
                  <div className="disc-stamp" aria-hidden="true">
                    <b>{pad(today.getDate())}</b>
                    <span>
                      {MONTHS[today.getMonth()]}
                      <br />
                      {WEEKDAYS[today.getDay()]}
                    </span>
                  </div>
                  <h2>每日推荐</h2>
                  <p className="disc-sub">{dailySub}</p>
                  {acct.error ? (
                    <p className="disc-sub err">
                      {acct.error}
                      <button type="button" className="link" onClick={acct.reload}>
                        重试
                      </button>
                    </p>
                  ) : null}
                  <div className="disc-acts">
                    {acct.songs.length > 0 ? (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void onPlay(acct.sourceId, acct.songs[0]!, acct.songs, "每日推荐")}
                      >
                        今日开播
                      </button>
                    ) : null}
                    {acct.hint && canLogin ? (
                      <button type="button" onClick={() => void openLogin()}>
                        登录{sourceName}
                      </button>
                    ) : null}
                    <button type="button" className="disc-ghost" onClick={acct.reload} disabled={acct.loading}>
                      换一批
                    </button>
                  </div>
                  {acct.songs.length > 0 ? (
                    <ol className="disc-preview">
                      {acct.songs.slice(0, 5).map((track, i) => (
                        <li key={`${track.sourceId}-${i}`}>
                          <button
                            type="button"
                            onClick={() => void onPlay(acct.sourceId, track, acct.songs, "每日推荐")}
                            title={`${track.title} — ${track.artist}`}
                          >
                            <span className="no">{pad(i + 1)}</span>
                            <b>{track.title}</b>
                            <span className="ar">{track.artist}</span>
                            <span className="du mono">{fmtDuration(track.durationMs)}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              </div>
            </section>

            {/* ================= 榜单：卡带 + 同页下钻 ================= */}
            <section className="disc-charts" aria-label="榜单">
              <header className="disc-sect">
                <b>榜单</b>
                <span className="mono">TOPLISTS</span>
                <i aria-hidden="true" />
                {canCharts && lists.length > 0 ? <span className="mono">{lists.length} 个</span> : null}
                {canCharts ? (
                  <RefreshButton
                    onClick={() => {
                      if (!sourceId) return;
                      // 清单和曲目一起失效：只刷清单会让下钻还是旧曲目
                      refreshNet(`charts:toplists:${sourceId}`);
                      invalidatePrefix(`charts:tracks:${sourceId}:`);
                      setChartTick((t) => t + 1);
                    }}
                  />
                ) : null}
              </header>

              {!canCharts ? (
                <p className="lib-empty lib-empty--inline">{sourceName} 不提供榜单，切到网易云或 QQ 音乐看榜。</p>
              ) : null}

              {canCharts && lists.length > 0 ? (
                <div className="disc-strip" role="list" aria-label="榜单目录">
                  {lists.map((list) => (
                    <button
                      type="button"
                      key={list.id}
                      role="listitem"
                      className={`disc-card${pick === list.id ? " on" : ""}`}
                      onClick={() => {
                        setPick(list.id);
                        void loadTracks(list.id, 0);
                      }}
                      title={list.name}
                      aria-current={pick === list.id ? "true" : undefined}
                    >
                      <span
                        className="disc-card-cover"
                        aria-hidden="true"
                        style={list.coverUrl ? { backgroundImage: `url("${list.coverUrl}")` } : undefined}
                      />
                      <span className="disc-card-name">{list.name}</span>
                      <span className="disc-card-count mono">{list.count > 0 ? `${list.count} 首` : "—"}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {chartNote ? (
                <p className="lib-note" role="status">
                  {chartNote}
                </p>
              ) : null}

              {canCharts && selectedList ? (
                <div className="disc-board charts-page">
                  <p className="list-now">
                    <b>{selectedList.name}</b>
                    <span>{tracks.length > 0 ? `${tracks.length} 首` : "取曲目中…"}</span>
                  </p>

                  {tracks[0] ? (
                    <button
                      type="button"
                      className="chart-champ"
                      onClick={() => void playChart(tracks[0]!)}
                      title={`第 1 名 · ${tracks[0].title} — ${tracks[0].artist}`}
                    >
                      <span className="champ-rank" aria-hidden="true">
                        01
                      </span>
                      <span className="champ-cover">
                        {tracks[0].coverUrl ? (
                          <img
                            src={tracks[0].coverUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <i aria-hidden="true" />
                        )}
                      </span>
                      <span className="champ-tx">
                        <span className="champ-tag">CHAMPION · 本榜第 1</span>
                        <b>{tracks[0].title}</b>
                        <span className="champ-artist">{tracks[0].artist}</span>
                        <span className="champ-meta mono">{fmtDuration(tracks[0].durationMs)}</span>
                      </span>
                    </button>
                  ) : null}

                  {tracks.length > 1 ? (
                    <div className="chart-podium">
                      {tracks.slice(1, 3).map((track, i) => (
                        <button
                          key={track.sourceId}
                          type="button"
                          className={`chart-hero-cell p${i + 2}`}
                          onClick={() => void playChart(track)}
                          title={`第 ${i + 2} 名 · ${track.title} — ${track.artist}`}
                        >
                          <span className="chart-hero-rank">{pad(i + 2)}</span>
                          <span className="chart-hero-cover">
                            {track.coverUrl ? (
                              <img
                                src={track.coverUrl}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <i aria-hidden="true" />
                            )}
                          </span>
                          <b>{track.title}</b>
                          <span className="chart-hero-artist">{track.artist}</span>
                          <span className="chart-hero-dur">{fmtDuration(track.durationMs)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {/* 取曲目期间摆骨架行：只留一句「取曲目中…」会被读成卡死 */}
                  {chartBusy && tracks.length === 0 ? (
                    <div className="online-skel" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, i) => (
                        <div className="sk-row" key={i} style={{ "--i": i } as CSSProperties}>
                          <span className="sk-bar t" />
                          <span className="sk-bar a" />
                          <span className="sk-bar d" />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {tracks.length > 3 ? (
                    <div className="lib-thead online-thead charts-thead">
                      <span className="th-no">#</span>
                      <span className="th-cover" aria-hidden="true" />
                      <span className="th-title">TITLE</span>
                      <span className="th-a">ARTIST</span>
                      <span className="th-b">ALBUM</span>
                      <span className="th-dur">TIME</span>
                    </div>
                  ) : null}
                  {tracks.slice(3).map((track, i) => (
                    <div
                      key={track.sourceId}
                      className={`lib-row online-row${i + 4 <= 10 ? " top10" : ""}`}
                      role="button"
                      tabIndex={0}
                      style={{ "--r": String(i + 4) } as CSSProperties}
                      onClick={() => void playChart(track)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        void playChart(track);
                      }}
                      title={`${track.title} — ${track.artist}`}
                    >
                      <span className="lib-no">{pad(i + 4)}</span>
                      <span className="row-cover">
                        {track.coverUrl ? (
                          <img
                            src={track.coverUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <i aria-hidden="true" />
                        )}
                      </span>
                      <span className="lib-title">{track.title}</span>
                      <span className="lib-artist">{track.artist}</span>
                      <span className="lib-artist">{track.album}</span>
                      <span className="lib-dur">{fmtDuration(track.durationMs)}</span>
                    </div>
                  ))}
                  {nextPage !== undefined ? (
                    <button
                      type="button"
                      className="pl-more"
                      disabled={chartBusy}
                      onClick={() => pick !== null && void loadTracks(pick, nextPage)}
                    >
                      {chartBusy ? "加载中…" : "加载更多"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>
    </section>
  );
}
