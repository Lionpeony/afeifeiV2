import { useState } from "react";
import type { OnlinePlaylist, RemoteTrack } from "../../../../contracts/capability.js";
import type { SavedPlaylistView } from "../../services.js";
import { PageHead } from "../../PageHead.js";
import { RefreshButton } from "../../RefreshButton.js";
import { Segmented } from "../../Segmented.js";
import { ImportBar } from "./ImportBar.js";
import { PlaylistIndex } from "./PlaylistIndex.js";
import { TrackList } from "./TrackList.js";
import { usePlaylistLibrary } from "./use-playlist-library.js";

export interface PlaylistViewProps {
  /** 只传 canPlaylists 为 true 的源（过滤在宿主做，本组件不做能力判断） */
  sources: { id: string; name: string }[];
  listPlaylists(sourceId: string): Promise<OnlinePlaylist[]>;
  playlistTracks(
    sourceId: string,
    playlistId: string,
    page?: number,
  ): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  /** 与在线页同一条播放链路。list = 整张歌单，点哪首就从哪首开始。origin = 歌单名（首页 ON AIR 标来源用）。 */
  onPlay(sourceId: string, track: RemoteTrack, list?: RemoteTrack[], origin?: string): Promise<void>;
  /* ---- 收藏的在线歌单（M11） ---- */
  onlinePlaylists(): Promise<SavedPlaylistView[]>;
  savePlaylist(
    sourceId: string,
    playlist: { id: string; name: string; count: number; coverUrl?: string },
  ): Promise<SavedPlaylistView[]>;
  importPlaylist(sourceId: string, ref: string): Promise<SavedPlaylistView[]>;
  removePlaylist(sourceId: string, id: string): Promise<SavedPlaylistView[]>;
}

/**
 * 歌单页（M9-5 只读 → M11 可收藏 → 2026-11-06 两栏重构）。
 *
 * 两块内容刻意分开：
 *  - **我收藏的**：本机 KV，粘链接/点收藏得来，跨重启都在；
 *  - **账号歌单**：每次进页面从音源拉最新，作者改了你也就跟着变。
 * 合成一份会出现「昨天收藏的歌单今天自己改名了」的困惑。
 *
 * 音源来自声明 canListPlaylists 的注册项，不写死任何一家。
 * 数据与副作用在 `use-playlist-library`，这里只做装配。
 */
export function PlaylistsView(props: PlaylistViewProps) {
  const lib = usePlaylistLibrary({
    sources: props.sources,
    listPlaylists: props.listPlaylists,
    playlistTracks: props.playlistTracks,
    onlinePlaylists: props.onlinePlaylists,
    savePlaylist: props.savePlaylist,
    importPlaylist: props.importPlaylist,
    removePlaylist: props.removePlaylist,
  });
  const [importOpen, setImportOpen] = useState(false);

  if (props.sources.length === 0) {
    return (
      <section className="library">
        <p className="lib-empty">没有支持歌单的音源。网易云登录后可用。</p>
      </section>
    );
  }

  const nameOf = (id: string): string => props.sources.find((s) => s.id === id)?.name ?? "其它音源";
  const item = lib.selectedItem;
  const meta = item ? `${item.count > 0 ? `${item.count} 首` : "空歌单"} · ${nameOf(item.sourceId)}` : "";
  const total = lib.saved.length + lib.playlists.length;

  const play = async (track: RemoteTrack, list: RemoteTrack[]): Promise<void> => {
    try {
      await props.onPlay(lib.selected?.sourceId ?? lib.sourceId, track, list, item?.name);
    } catch (err) {
      lib.say(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="library playlists-page">
      <PageHead
        title="歌单"
        meta={`PLAYLISTS · ${total} LISTS`}
        extra={
          <div className="head-tools">
            <button
              type="button"
              className="refresh-btn pl-import-open"
              onClick={() => {
                lib.clearNote();
                setImportOpen(true);
              }}
            >
              导入
            </button>
            <RefreshButton onClick={lib.refresh} />
          </div>
        }
      />

      <div className="lib-head">
        <Segmented
          label="音源"
          items={props.sources.map((s) => ({ id: s.id, name: s.name }))}
          value={lib.sourceId}
          onChange={lib.changeSource}
        />
        {total > 0 ? <span className="badge">{total} 个歌单</span> : null}
      </div>

      {importOpen ? (
        <ImportBar
          busy={lib.importing}
          error={lib.note}
          onSubmit={(ref) => {
            void lib.doImport(ref).then((ok) => {
              if (ok) setImportOpen(false);
            });
          }}
          onClose={() => setImportOpen(false)}
        />
      ) : null}

      {/* 异步结果（导入失败 / 取曲目报错）要能读屏播报 */}
      {lib.note ? (
        <p className="lib-note" role="status">
          {lib.note}
        </p>
      ) : null}

      <div className="pl-wrap">
        <PlaylistIndex
          saved={lib.saved}
          playlists={lib.playlists}
          sourceId={lib.sourceId}
          sourceName={nameOf(lib.sourceId)}
          nameOf={nameOf}
          selected={lib.selected}
          onOpen={lib.open}
        />

        <TrackList
          name={item?.name ?? ""}
          meta={meta}
          cover={item?.coverUrl}
          save={item ? { on: lib.isSaved, run: lib.toggleSave } : undefined}
          tracks={lib.tracks}
          busy={lib.busy}
          nextPage={lib.nextPage}
          empty={
            item
              ? lib.loadError
                ? "曲目没取到。点页头「刷新」再试一次。"
                : "这个歌单是空的。"
              : "左边选一个歌单，曲目会出现在这里。"
          }
          onPlay={(t, list) => void play(t, list)}
          onMore={lib.more}
        />
      </div>
    </section>
  );
}
