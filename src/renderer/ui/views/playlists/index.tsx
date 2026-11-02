import { useEffect, useState } from "react";
import type { OnlinePlaylist, RemoteTrack } from "../../../../contracts/capability.js";
import { PageHead } from "../../PageHead.js";

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
}

const pad = (n: number): string => String(n).padStart(2, "0");

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/**
 * 歌单页（M9-5）：**只读投影**——歌单列表 + 曲目列表 + 点歌播放，不做任何写操作。
 * 音源来自声明 canListPlaylists 的注册项，**不写死任何一家**：
 * 加第三家源时这里自动多一个下拉选项（判据：能力契约复验）。
 * 未登录由 listPlaylists 抛 auth-required 的人话，直接显示。
 */
export function PlaylistsView({ sources, listPlaylists, playlistTracks, onPlay }: PlaylistViewProps) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [playlists, setPlaylists] = useState<OnlinePlaylist[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tracks, setTracks] = useState<RemoteTrack[]>([]);
  const [nextPage, setNextPage] = useState<number | undefined>(undefined);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sourceId && sources[0]) setSourceId(sources[0].id);
  }, [sources, sourceId]);

  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    setPlaylists([]);
    setSelected(null);
    setTracks([]);
    setNote("");
    listPlaylists(sourceId)
      .then((list) => {
        if (!alive) return;
        setPlaylists(list);
        if (list.length === 0) setNote("这个账号还没有歌单。");
      })
      .catch((err: unknown) => {
        if (alive) setNote(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [sourceId, listPlaylists]);

  const loadTracks = async (playlistId: string, page: number): Promise<void> => {
    setBusy(true);
    setNote("");
    try {
      const result = await playlistTracks(sourceId, playlistId, page);
      setTracks((prev) => (page === 0 ? result.items : [...prev, ...result.items]));
      setNextPage(result.nextPage);
      if (page === 0 && result.items.length === 0) setNote("这个歌单是空的。");
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const open = async (playlist: OnlinePlaylist): Promise<void> => {
    setSelected(playlist.id);
    await loadTracks(playlist.id, 0);
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
        <p className="lib-empty">没有支持歌单的音源。网易云登录后可用。</p>
      </section>
    );
  }

  return (
    <section className="library">
      <PageHead title="歌单" meta="PLAYLISTS · READ ONLY" />
      <div className="lib-head">
        <select className="source-pick" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="lib-count">{playlists.length > 0 ? `${playlists.length} 个歌单` : ""}</span>
      </div>

      {note ? <p className="lib-note">{note}</p> : null}

      <div className="pl-wrap">
        <div className="pl-list">
          {playlists.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`pl-item ${p.id === selected ? "on" : ""}`}
              onClick={() => void open(p)}
            >
              <span className="pl-name">{p.name}</span>
              <span className="pl-count">{p.count} 首</span>
            </button>
          ))}
        </div>

        <div className="lib-list">
          <div className="lib-thead online-thead">
            <span className="th-title">曲目 / TITLE</span>
            <span className="th-a">歌手 / ARTIST</span>
            <span className="th-b">专辑 / ALBUM</span>
            <span className="th-dur">时长 / TIME</span>
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
            <p className="lib-empty">选一个歌单。</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
