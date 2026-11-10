import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { RemoteTrack, Toplist } from "../../../../contracts/capability.js";
import { getNet, invalidatePrefix, loadNet, refreshNet } from "../../../domain/net-cache/index.js";
import { PageHead } from "../../PageHead.js";
import { RefreshButton } from "../../RefreshButton.js";
import { Segmented } from "../../Segmented.js";
import { useActiveSource } from "../../use-active-source.js";

export interface ChartsViewProps {
  /** 只传 canGetToplist 为 true 的源（过滤在宿主做，本组件不做能力判断） */
  sources: { id: string; name: string }[];
  listToplists(sourceId: string): Promise<Toplist[]>;
  /** 下钻：榜单 id 就是只读歌单 id，复用歌单取曲目（不在音源侧写第二套） */
  playlistTracks(
    sourceId: string,
    listId: string,
    page?: number,
  ): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  /** list = 当前榜单全部曲目：点哪首就从哪首开始，队列 = 整个榜。origin = 榜名（首页 ON AIR 标来源用）。 */
  onPlay(sourceId: string, track: RemoteTrack, list?: RemoteTrack[], origin?: string): Promise<void>;
  /** 页头右侧的模式切换（在线 / 榜单合并后由宿主提供） */
  tabs?: ReactNode;
}

const pad = (n: number): string => String(n).padStart(2, "0");

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/**
 * 榜单页（A-14）：榜单卡片 → 点开看曲目 → 点歌播放。
 *
 * 判据是"榜单可下钻"，所以两级必须在同一页完成（不能点一下跳到一个空壳页再等加载）：
 * 左列是榜，右列是曲目，和歌单页同一套 `.pl-*` 布局，换的只是数据来源。
 * 榜单不需要登录（网易云 toplist 匿名可读），未登录也能看——这是它和"我的歌单"的区别。
 */
export function ChartsView({ sources, listToplists, playlistTracks, onPlay, tabs }: ChartsViewProps) {
  const [sourceId, setSourceId] = useActiveSource(sources);
  const [lists, setLists] = useState<Toplist[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tracks, setTracks] = useState<RemoteTrack[]>([]);
  const [nextPage, setNextPage] = useState<number | undefined>(undefined);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    const key = `charts:toplists:${sourceId}`;
    // 命中缓存就先摆出来：切页/切源不该闪一下空列表
    setLists(getNet<Toplist[]>(key) ?? []);
    setSelected(null);
    setTracks([]);
    setNextPage(undefined);
    setNote("");
    loadNet(key, () => listToplists(sourceId))
      .then((list) => {
        if (!alive) return;
        setLists(list);
        if (list.length === 0) setNote("这个音源没有给出榜单。");
      })
      .catch((err: unknown) => {
        if (alive) setNote(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
    /* 只认 sourceId / tick：宿主传的是内联箭头函数，把它放进依赖会让本效果
       每次渲染都重跑 —— 刚点中的榜会被下一个 render 重置回 null，
       选中态永远不亮、曲目刚出来就被清掉。 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, tick]);

  const loadTracks = async (listId: string, page: number): Promise<void> => {
    const key = `charts:tracks:${sourceId}:${listId}:${page}`;
    // 命中缓存就同步摆出来，不置 busy —— 切榜再切回来不该闪一次骨架
    const cached = page === 0 ? getNet<{ items: RemoteTrack[]; nextPage?: number }>(key) : undefined;
    if (cached) {
      setTracks(cached.items);
      setNextPage(cached.nextPage);
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const result = await loadNet(key, () => playlistTracks(sourceId, listId, page));
      setTracks((prev) => (page === 0 ? result.items : [...prev, ...result.items]));
      setNextPage(result.nextPage);
      if (page === 0 && result.items.length === 0) setNote("这个榜单暂时取不到曲目。");
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const open = async (list: Toplist): Promise<void> => {
    setSelected(list.id);
    await loadTracks(list.id, 0);
  };

  /* 一进页就把第一个榜摆出来：右半屏空着 700px 只会被读成「页面坏了」。
     榜单页的内容本来就是「某个榜从第 1 名开始」，不该先逼用户选一次。 */
  useEffect(() => {
    if (selected !== null || lists.length === 0) return;
    const first = lists[0];
    setSelected(first.id);
    void loadTracks(first.id, 0);
    // 只认 lists：loadTracks 是这轮渲染的闭包，进依赖会让本效果每帧重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists]);

  const play = async (track: RemoteTrack): Promise<void> => {
    try {
      await onPlay(sourceId, track, tracks, selectedList?.name ?? undefined);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  /** 右栏头部要显示「哪个榜 · 多少首」，从目录里反查，不另存一份名字 */
  const selectedList = lists.find((l) => l.id === selected) ?? null;

  if (sources.length === 0) {
    return (
      <section className="library">
        <p className="lib-empty">没有支持榜单的音源。当前只有网易云。</p>
      </section>
    );
  }

  return (
    <section className="library charts-page">
      <PageHead
        title="榜单"
        meta={`CHARTS · ${lists.length} LISTS`}
        extra={
          <div className="head-tools">
            {tabs}
            <RefreshButton
              onClick={() => {
                if (!sourceId) return;
                // 清单和曲目一起失效：只刷清单会让下钻还是旧曲目
                refreshNet(`charts:toplists:${sourceId}`);
                invalidatePrefix(`charts:tracks:${sourceId}:`);
                setTick((t) => t + 1);
              }}
            />
          </div>
        }
      />
      <div className="lib-head">
        <Segmented
          label="音源"
          items={sources.map((s) => ({ id: s.id, name: s.name }))}
          value={sourceId}
          onChange={setSourceId}
        />
        {lists.length > 0 ? <span className="badge">{lists.length} 个榜</span> : null}
      </div>

      {note ? (
        <p className="lib-note" role="status">
          {note}
        </p>
      ) : null}

      {/* 「正在放榜」跑马灯：电台公告带的位子。内容是真数据（当前榜前 10 的曲名），
          悬停暂停，只有拿到曲目才出现——空态不闪灯。 */}
      {selectedList && tracks.length > 0 ? (
        <div className="chart-ticker" role="presentation">
          <span className="tk-live">ON CHART</span>
          <span className="tk-viewport">
            <span className="tk-track">
              {[0, 1].map((copy) => (
                <span className="tk-run" key={copy} aria-hidden={copy === 1}>
                  {tracks.slice(0, 10).map((track, i) => (
                    <b key={`${copy}-${track.sourceId}`}>
                      <i>{pad(i + 1)}</i>
                      {track.title}
                    </b>
                  ))}
                </span>
              ))}
            </span>
          </span>
          <span className="tk-src mono">{selectedList.name}</span>
        </div>
      ) : null}

      <div className="pl-wrap">
        {/* 左：榜单索引。65 个榜要一屏扫得动，靠三件事：mono 序号给列、18px 封套当锚点、
            行高压到 26px。行样式仍与歌单页共用 .pl-item，只在这里收紧密度。 */}
        <div className="pl-list" aria-label="榜单目录">
          <p className="pl-sect">全部榜单 · {lists.length}</p>
          {lists.map((list, i) => (
            <button
              type="button"
              key={list.id}
              className={`pl-item chart-item${selected === list.id ? " on" : ""}`}
              onClick={() => void open(list)}
              title={list.name}
              aria-current={selected === list.id ? "true" : undefined}
            >
              <span className="chart-index" aria-hidden="true">
                {pad(i + 1)}
              </span>
              <i
                className="chart-thumb"
                aria-hidden="true"
                style={list.coverUrl ? { backgroundImage: `url("${list.coverUrl}")` } : undefined}
              />
              <span className="pl-name">{list.name}</span>
              <span className="pl-count">{list.count > 0 ? `${list.count} 首` : "—"}</span>
            </button>
          ))}
          {lists.length === 0 && !note ? <p className="pl-empty">这个音源没有给出榜单。</p> : null}
        </div>

        {/* 右：名次结构。放榜现场的层级碾压——第 1 名独占冠军位（面积 = 亚军卡 3 倍），
            2/3 名双卡，第 4 名起才落回密集列表。名次是榜单的全部信息量，
            第 1 名和第 50 名不能长得一样。 */}
        <div className="lib-list">
          {selectedList ? (
            <p className="list-now">
              <b>{selectedList.name}</b>
              <span>{tracks.length > 0 ? `${tracks.length} 首` : "取曲目中…"}</span>
            </p>
          ) : null}

          {tracks.length > 0 && tracks[0] ? (
            <button
              type="button"
              className="chart-champ"
              onClick={() => void play(tracks[0]!)}
              title={`第 1 名 · ${tracks[0].title} — ${tracks[0].artist}`}
            >
              <span className="champ-rank" aria-hidden="true">
                01
              </span>
              <span className="champ-cover">
                {tracks[0].coverUrl ? (
                  <img src={tracks[0].coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
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
                  onClick={() => void play(track)}
                  title={`第 ${i + 2} 名 · ${track.title} — ${track.artist}`}
                >
                  <span className="chart-hero-rank">{pad(i + 2)}</span>
                  <span className="chart-hero-cover">
                    {track.coverUrl ? (
                      <img src={track.coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
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

          {/* 取曲目期间摆骨架行：只留一句「取曲目中…」会被读成卡死（上游实测可达数十秒） */}
          {busy && tracks.length === 0 ? (
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
              onClick={() => void play(track)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                void play(track);
              }}
              title={`${track.title} — ${track.artist}`}
            >
              <span className="lib-no">{pad(i + 4)}</span>
              <span className="row-cover">
                {track.coverUrl ? (
                  <img src={track.coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
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
              disabled={busy}
              onClick={() => selected !== null && void loadTracks(selected, nextPage)}
            >
              {busy ? "加载中…" : "加载更多"}
            </button>
          ) : null}
          {tracks.length === 0 && !busy && !note ? (
            <p className="lib-empty lib-empty--inline">左栏点一个榜，曲目会出现在这里。</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
