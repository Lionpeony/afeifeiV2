import { useEffect, useState } from "react";
import type { OnlinePlaylist, RemoteTrack } from "../../../../contracts/capability.js";
import type { SavedPlaylistView } from "../../services.js";
import { PageHead } from "../../PageHead.js";
import { Segmented } from "../../Segmented.js";
import { useActiveSource } from "../../use-active-source.js";

export interface PlaylistViewProps {
  /** 只传 canPlaylists 为 true 的源（过滤在宿主做，本组件不做能力判断） */
  sources: { id: string; name: string }[];
  listPlaylists(sourceId: string): Promise<OnlinePlaylist[]>;
  playlistTracks(
    sourceId: string,
    playlistId: string,
    page?: number,
  ): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  /** 与在线页同一条播放链路（resolveOnlineUrl → player/play）。 */
  onPlay(sourceId: string, track: RemoteTrack): Promise<void>;
  /* ---- 收藏的在线歌单（M11） ---- */
  onlinePlaylists(): Promise<SavedPlaylistView[]>;
  savePlaylist(
    sourceId: string,
    playlist: { id: string; name: string; count: number; coverUrl?: string },
  ): Promise<SavedPlaylistView[]>;
  importPlaylist(sourceId: string, ref: string): Promise<SavedPlaylistView[]>;
  removePlaylist(sourceId: string, id: string): Promise<SavedPlaylistView[]>;
}

/** 选中的是「哪个源的哪个歌单」：收藏的歌单可能不属于当前下拉里那个源。 */
interface Selection {
  sourceId: string;
  id: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/**
 * 歌单页（M9-5 只读 → M11 可收藏）。
 *
 * 两块内容刻意分开：
 *  - **我收藏的**：本机 KV，粘链接/点收藏得来，跨重启都在；
 *  - **账号歌单**：每次进页面从音源拉最新，作者改了你也就跟着变。
 * 合成一份会出现「昨天收藏的歌单今天自己改名了」的困惑。
 *
 * 音源来自声明 canListPlaylists 的注册项，不写死任何一家。
 */
export function PlaylistsView({
  sources,
  listPlaylists,
  playlistTracks,
  onPlay,
  onlinePlaylists,
  savePlaylist,
  importPlaylist,
  removePlaylist,
}: PlaylistViewProps) {
  const [sourceId, setSourceId] = useActiveSource(sources);
  const [saved, setSaved] = useState<SavedPlaylistView[]>([]);
  const [playlists, setPlaylists] = useState<OnlinePlaylist[]>([]);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [tracks, setTracks] = useState<RemoteTrack[]>([]);
  const [nextPage, setNextPage] = useState<number | undefined>(undefined);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState("");


  useEffect(() => {
    let alive = true;
    void onlinePlaylists()
      .then((list) => {
        if (alive) setSaved(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [onlinePlaylists]);

  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    setPlaylists([]);
    setNote("");
    listPlaylists(sourceId)
      .then((list) => {
        if (alive) setPlaylists(list);
      })
      .catch((err: unknown) => {
        if (alive) setNote(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [sourceId, listPlaylists]);

  const loadTracks = async (src: string, playlistId: string, page: number): Promise<void> => {
    setBusy(true);
    setNote("");
    try {
      const result = await playlistTracks(src, playlistId, page);
      setTracks((prev) => (page === 0 ? result.items : [...prev, ...result.items]));
      setNextPage(result.nextPage);
      if (page === 0 && result.items.length === 0) setNote("这个歌单是空的。");
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const open = (src: string, id: string): void => {
    setSelected({ sourceId: src, id });
    void loadTracks(src, id, 0);
  };

  const play = async (track: RemoteTrack): Promise<void> => {
    const src = selected?.sourceId ?? sourceId;
    try {
      await onPlay(src, track);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const doImport = async (): Promise<void> => {
    const text = ref.trim();
    if (!text || busy) return;
    setBusy(true);
    setNote("");
    try {
      setSaved(await importPlaylist(sourceId, text));
      setRef("");
      setNote("已收藏。点它取曲目。");
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const keep = async (playlist: OnlinePlaylist): Promise<void> => {
    try {
      setSaved(await savePlaylist(sourceId, playlist));
      setNote(`已收藏「${playlist.name}」`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const drop = async (item: SavedPlaylistView): Promise<void> => {
    try {
      setSaved(await removePlaylist(item.sourceId, item.id));
      if (selected?.sourceId === item.sourceId && selected.id === item.id) {
        setSelected(null);
        setTracks([]);
        setNextPage(undefined);
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  if (sources.length === 0) {
    return (
      <section className="library">
        <p className="lib-empty">没有支持歌单的音源。网易云登录后可用。</p>
      </section>
    );
  }

  const isOn = (src: string, id: string): boolean => selected?.sourceId === src && selected.id === id;

  return (
    <section className="library playlists-page">
      <PageHead title="歌单" meta="PLAYLISTS" />
      <div className="lib-head">
        <Segmented
          label="音源"
          items={sources.map((s) => ({ id: s.id, name: s.name }))}
          value={sourceId}
          onChange={setSourceId}
        />
        <input
          className="search pl-ref"
          value={ref}
          placeholder="粘贴歌单分享链接或 id，然后点导入"
          onChange={(e) => setRef(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void doImport();
          }}
        />
        <button type="button" className="primary" onClick={() => void doImport()} disabled={busy || !ref.trim()}>
          导入
        </button>
      </div>

      {note ? <p className="lib-note">{note}</p> : null}

      {/* 收藏歌单一进页面就是封面墙：这是"我的收藏"的主视觉，列表只留给账号歌单 */}
      {saved.length > 0 ? (
        <div className="pl-shelf" aria-label="我收藏的歌单">
          {saved.map((p) => (
            <div className="pl-card-wrap" key={`${p.sourceId}:${p.id}`}>
              <button
                type="button"
                className={`pl-card${isOn(p.sourceId, p.id) ? " on" : ""}`}
                onClick={() => open(p.sourceId, p.id)}
                title={`${p.name}（${p.sourceId}）`}
              >
                {p.coverUrl ? <img src={p.coverUrl} alt="" loading="lazy" /> : <span className="pl-card-empty" />}
                <b>{p.name}</b>
                <span>{p.count > 0 ? `${p.count} 首` : "—"}</span>
              </button>
              <button
                type="button"
                className="pl-card-x"
                aria-label={`取消收藏 ${p.name}`}
                title="取消收藏（只是从本机列表移除，不删远端歌单）"
                onClick={() => void drop(p)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="pl-wrap">
        <div className="pl-list">
          <p className="pl-sect">账号歌单 · {sources.find((s) => s.id === sourceId)?.name ?? sourceId}</p>
          {playlists.map((p) => (
            <div className="pl-line" key={p.id}>
              <button
                type="button"
                className={`pl-item ${isOn(sourceId, p.id) ? "on" : ""}`}
                onClick={() => open(sourceId, p.id)}
              >
                <span className="pl-name">{p.name}</span>
                <span className="pl-count">{p.count} 首</span>
              </button>
              <button type="button" className="pl-save" onClick={() => void keep(p)} title="收藏到本机列表">
                收藏
              </button>
            </div>
          ))}
          {playlists.length === 0 && !note ? <p className="pl-empty">这个账号还没有歌单。</p> : null}
        </div>

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
              onClick={() => selected && void loadTracks(selected.sourceId, selected.id, nextPage)}
            >
              {busy ? "加载中…" : "加载更多"}
            </button>
          ) : null}
          {tracks.length === 0 && selected === null ? <p className="lib-empty">选一个歌单。</p> : null}
        </div>
      </div>
    </section>
  );
}
