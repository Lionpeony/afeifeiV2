import { useEffect, useState } from "react";
import type { RemoteTrack, Toplist } from "../../../../contracts/capability.js";
import { PageHead } from "../../PageHead.js";
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
  onPlay(sourceId: string, track: RemoteTrack): Promise<void>;
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
export function ChartsView({ sources, listToplists, playlistTracks, onPlay }: ChartsViewProps) {
  const [sourceId, setSourceId] = useActiveSource(sources);
  const [lists, setLists] = useState<Toplist[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tracks, setTracks] = useState<RemoteTrack[]>([]);
  const [nextPage, setNextPage] = useState<number | undefined>(undefined);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);


  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    setLists([]);
    setSelected(null);
    setTracks([]);
    setNextPage(undefined);
    setNote("");
    listToplists(sourceId)
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
  }, [sourceId, listToplists]);

  const loadTracks = async (listId: string, page: number): Promise<void> => {
    setBusy(true);
    setNote("");
    try {
      const result = await playlistTracks(sourceId, listId, page);
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

  const play = async (track: RemoteTrack): Promise<void> => {
    try {
      await onPlay(sourceId, track);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  if (sources.length === 0) {
    return (
      <section className="library">
        <p className="lib-empty">没有支持榜单的音源。当前只有网易云。</p>
      </section>
    );
  }

  return (
    <section className="library charts-page">
      <PageHead title="榜单" meta={`CHARTS · ${lists.length} LISTS`} />
      <div className="lib-head">
        <Segmented
          label="音源"
          items={sources.map((s) => ({ id: s.id, name: s.name }))}
          value={sourceId}
          onChange={setSourceId}
        />
        {lists.length > 0 ? <span className="badge">{lists.length} 个榜</span> : null}
      </div>

      {note ? <p className="lib-note">{note}</p> : null}

      {/* 榜单带：先横着挑榜，再在下面看曲目；不把"选榜"藏进左侧窄列表 */}
      {lists.length > 0 ? (
        <div className="chart-rail" aria-label="榜单列表">
          {lists.map((list) => (
            <button
              type="button"
              key={list.id}
              className={`chart-cell${selected === list.id ? " on" : ""}`}
              onClick={() => void loadTracks(list.id, 1)}
              title={list.name}
            >
              {list.coverUrl ? (
                <i className="chart-dot" style={{ backgroundImage: `url("${list.coverUrl}")` }} aria-hidden="true" />
              ) : null}
              <b>{list.name}</b>
              <span>{list.count > 0 ? `${list.count} 首` : "—"}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="pl-wrap">
        <div className="lib-list">
          <div className="lib-thead online-thead">
            <span className="th-title">TITLE</span>
            <span className="th-a">ARTIST</span>
            <span className="th-b">ALBUM</span>
            <span className="th-dur">TIME</span>
          </div>
          {tracks.map((track) => (
            <div
              key={track.sourceId}
              className="lib-row online-row"
              onClick={() => void play(track)}
              title={`${track.title} — ${track.artist}`}
            >
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
          {tracks.length === 0 && !note && selected === null ? (
            <p className="lib-empty">选一个榜。</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
