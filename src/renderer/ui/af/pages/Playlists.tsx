/* 歌单页 · 原型 .page.pl（音源切换 / 歌单目录 / 曲目表） */
import { useEffect, useState } from "react";
import type { OnlinePlaylist, RemoteTrack } from "../../../../contracts/capability.js";
import type { SavedPlaylistView } from "../../services.js";
import { ImportBar } from "../../views/playlists/ImportBar.js";
import { usePlaylistLibrary } from "../../views/playlists/use-playlist-library.js";
import { remoteTrackId } from "../../../kernel/index.js";
import { useAf } from "../context.js";
import type { AfTrack } from "../context.js";
import { TrackArt } from "../art.js";
import { AfTrackTable } from "../TrackTable.js";
import { IconCheck, IconHeart, IconImport, IconPlay, IconPlus, IconRefresh } from "../icons.js";
import { PillWipe } from "../SourceSwap.js";
import { EmptySetlist, PageHead } from "../ui.js";

export interface PlaylistsPageProps {
  sources: { id: string; name: string }[];
  listPlaylists(sourceId: string): Promise<OnlinePlaylist[]>;
  playlistTracks(sourceId: string, playlistId: string, page?: number): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  onPlay(sourceId: string, track: RemoteTrack, list?: RemoteTrack[], origin?: string): Promise<void>;
  onlinePlaylists(): Promise<SavedPlaylistView[]>;
  savePlaylist(sourceId: string, playlist: { id: string; name: string; count: number; coverUrl?: string }): Promise<SavedPlaylistView[]>;
  importPlaylist(sourceId: string, ref: string): Promise<SavedPlaylistView[]>;
  removePlaylist(sourceId: string, id: string): Promise<SavedPlaylistView[]>;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const fmtDur = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

export function PlaylistsPage(props: PlaylistsPageProps) {
  const af = useAf();
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
  const [mineId, setMineId] = useState<string | null>(null);
  useEffect(() => {
    if (af.focusList) {
      setMineId(af.focusList);
      af.setFocusList(null);
    }
  }, [af.focusList]);
  const mine = mineId ? af.myLists.find((l) => l.id === mineId) ?? null : null;
  const toAf = (t: RemoteTrack, src: string): AfTrack => ({
    id: remoteTrackId(src, t.sourceId),
    title: t.title,
    artist: t.artist,
    album: t.album,
    cover: t.coverUrl ?? null,
    dur: t.durationMs / 1000,
    remote: { sourceId: src, songId: t.sourceId, coverUrl: t.coverUrl },
  });
  const nameOf = (id: string): string => props.sources.find((s) => s.id === id)?.name ?? "其它音源";
  const item = lib.selectedItem;
  const srcName = nameOf(lib.sourceId);

  if (props.sources.length === 0) {
    return <div className="page pl"><p className="lib-note">没有支持歌单的音源。网易云登录后可用。</p></div>;
  }

  const play = (track: RemoteTrack): void => {
    void props
      .onPlay(lib.selected?.sourceId ?? lib.sourceId, track, lib.tracks, item?.name)
      .then(() => af.openPlayer())
      .catch((err: unknown) => lib.say(err instanceof Error ? err.message : String(err)));
  };

  return (
    <div className="page pl" data-screen-label="歌单">
      <PageHead
        eyebrow={<>PLAYLISTS · {lib.saved.length + lib.playlists.length} LISTS</>}
        title="歌单"
        aside={
          <div className="row gap8">
            <button className="btn btn-ghost btn-sm" onClick={() => { lib.clearNote(); setImportOpen(true); }}>
              <IconImport size={14} />导入
            </button>
            <button className="btn btn-ghost btn-sm" onClick={lib.refresh}><IconRefresh size={14} />刷新</button>
          </div>
        }
      />

      <div className="pl__switch">
        <div className="src-pill">
          <PillWipe />
          {props.sources.map((s) => (
            <button key={s.id} className={"src-pill__btn" + (lib.sourceId === s.id ? " is-on" : "")} onClick={() => af.switchSource(s.id, { scope: "pill", quiet: true })}>
              {s.name}
            </button>
          ))}
        </div>
        <span className="meta">{lib.playlists.length} 个账号歌单 · {srcName}</span>
        <span className="meta hand" style={{ color: "var(--text-3)" }}>切换音源会重新拉一次列表</span>
      </div>

      {importOpen ? (
        <ImportBar
          busy={lib.importing}
          error={lib.note}
          onSubmit={(ref) => {
            void lib.doImport(ref).then((ok) => { if (ok) setImportOpen(false); });
          }}
          onClose={() => setImportOpen(false)}
        />
      ) : null}
      {lib.note ? <p className="lib-note" role="status">{lib.note}</p> : null}

      <div className="pl__grid">
        <aside className="pl__side">
          <div className="pl__side-label eyebrow">我的歌单 · {af.myLists.length}</div>
          <button className="pl-row pl-row--new" onClick={() => af.setListEditor({ mode: "new", tracks: [] })}>
            <span className="pl-row__art pl-row__art--new"><IconPlus size={15} /></span>
            <span className="pl-row__text"><span className="pl-row__name">新建歌单</span><span className="pl-row__note hand">自己排一版顺序</span></span>
          </button>
          {af.myLists.map((l) => (
            <button key={l.id} className={"pl-row" + (mineId === l.id ? " is-active" : "")} onClick={() => setMineId(l.id)}>
              <span className="pl-row__art"><TrackArt id={"cover-" + l.cover} size={38} radius={8} /></span>
              <span className="pl-row__text"><span className="pl-row__name truncate">{l.name}</span><span className="pl-row__note truncate hand">{l.note || "还没写说明"}</span></span>
              <span className="pl-row__count num">{l.tracks.length} 首</span>
            </button>
          ))}
          <div className="pl__side-label eyebrow" style={{ marginTop: 18 }}>账号歌单 · {srcName}</div>
          <button className="pl-row" onClick={() => { af.setMineTab("liked"); af.setPage("mine"); }}>
            <span className="pl-row__art"><IconHeart size={16} style={{ color: "var(--pink-600)" }} /></span>
            <span className="pl-row__name">我喜欢的音乐</span>
          </button>
          {lib.saved.map((p) => (
            <button key={p.sourceId + p.id} className={"pl-row" + (lib.selected?.sourceId === p.sourceId && lib.selected?.id === p.id ? " is-active" : "")} onClick={() => lib.open(p.sourceId, p.id)}>
              <span className="pl-row__art"><TrackArt id={p.sourceId + p.id} size={38} radius={8} /></span>
              <span className="pl-row__text">
                <span className="pl-row__name truncate">{p.name}</span>
                <span className="pl-row__note truncate hand">收藏 · {nameOf(p.sourceId)}</span>
              </span>
              <span className="pl-row__count num">{p.count > 0 ? `${p.count} 首` : "—"}</span>
            </button>
          ))}
          {lib.playlists.map((p) => (
            <button key={p.id} className={"pl-row" + (lib.selected?.sourceId === lib.sourceId && lib.selected?.id === p.id ? " is-active" : "")} onClick={() => lib.open(lib.sourceId, p.id)}>
              <span className="pl-row__art">{p.coverUrl ? <img src={p.coverUrl} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <TrackArt id={lib.sourceId + p.id} size={38} radius={8} />}</span>
              <span className="pl-row__text">
                <span className="pl-row__name truncate">{p.name}</span>
                <span className="pl-row__note truncate">{p.count > 0 ? `${p.count} 首` : "空歌单"}</span>
              </span>
            </button>
          ))}
        </aside>

        {mine ? (
          <section className="pl__detail paper">
            <div className="pl__detail-head">
              <div className="pl__cover">
                <TrackArt id={"cover-" + mine.cover} size={104} radius={14} />
                <span className="pl__cover-tag">我的</span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="eyebrow">本地歌单 · 自己排的</div>
                <h2 className="pl__name">{mine.name}</h2>
                <div className="meta">{mine.tracks.length} 首 · <span className="hand">{mine.note || "还没写说明"}</span></div>
                <div className="row gap8" style={{ marginTop: 14 }}>
                  <button className="btn btn-primary btn-sm" disabled={!mine.tracks[0]} onClick={() => af.playIds(mine.tracks)}><IconPlay size={13} />播放全部</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => af.setListEditor({ mode: "edit", list: mine, tracks: mine.tracks })}>编辑</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => af.setPage("online")}><IconPlus size={13} />去挑歌</button>
                </div>
              </div>
            </div>
            {mine.tracks.length === 0 ? (
              <EmptySetlist title="这张歌单还空着。" sub="在任意一首歌的「⋯」里选「收藏到歌单」，就能丢进来。" cta="去发现页挑歌" onGo={() => af.setPage("online")} />
            ) : (
              <AfTrackTable
                items={mine.tracks.map((id) => af.resolveTrack(id))}
                onPlay={(i) => af.playIds(mine.tracks, i)}
                onRemove={(id) => {
                  af.removeFromMyList(mine.id, id);
                  af.toast("拿掉了，歌还在库里", { hand: true });
                }}
              />
            )}
          </section>
        ) : (
        <section className="pl__detail paper">
          <div className="pl__detail-head">
            <div className="pl__cover">
              {item?.coverUrl ? <img src={item.coverUrl} alt="" referrerPolicy="no-referrer" style={{ width: 104, height: 104, borderRadius: 14, objectFit: "cover" }} /> : <TrackArt id={(item?.sourceId ?? lib.sourceId) + (item?.id ?? "empty")} size={104} radius={14} />}
              <span className="pl__cover-tag">{item ? nameOf(item.sourceId) : srcName}</span>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="eyebrow">{item ? nameOf(item.sourceId) : srcName} · 账号歌单</div>
              <h2 className="pl__name">{item?.name ?? "选一个歌单"}</h2>
              <div className="meta">{item ? `${item.count > 0 ? `${item.count} 首` : "空歌单"} · ${nameOf(item.sourceId)}` : "左边选一个歌单，曲目会出现在这里。"}</div>
              <div className="row gap8" style={{ marginTop: 14 }}>
                <button className="btn btn-primary btn-sm" disabled={!lib.tracks[0]} onClick={() => lib.tracks[0] && play(lib.tracks[0])}>
                  <IconPlay size={13} />播放全部
                </button>
                {item ? (
                  <button className={"btn btn-ghost btn-sm" + (lib.isSaved ? " is-saved" : "")} onClick={lib.toggleSave}>
                    {lib.isSaved ? <><IconCheck size={13} />已收藏到我的歌单</> : <><IconPlus size={13} />收藏到我的歌单</>}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <AfTrackTable
            items={lib.tracks.map((t) => toAf(t, lib.selected?.sourceId ?? lib.sourceId))}
            onPlay={(i) => { const t = lib.tracks[i]; if (t) play(t); }}
            sourceLabel={nameOf(lib.selected?.sourceId ?? lib.sourceId)}
          />
          {lib.busy ? <div className="search-busy"><span className="hand">取曲目中……</span></div> : null}
          {!lib.busy && lib.tracks.length === 0 ? <p className="lib-empty">{lib.loadError ? "曲目没取到。点页头「刷新」再试一次。" : item ? "这个歌单是空的。" : "左边选一个歌单，曲目会出现在这里。"}</p> : null}
          {lib.nextPage !== undefined ? (
            <button className="top-preview__more" disabled={lib.busy} onClick={lib.more}>{lib.busy ? "加载中…" : "加载更多"}</button>
          ) : null}
        </section>
        )}
      </div>

      <div className="row gap8" style={{ marginTop: 20 }}>
        <span className="hand" style={{ fontSize: 12, color: "var(--text-3)" }}>歌单来自你在 {srcName} 的账号；本地只缓存列表，不存音频文件。</span>
      </div>
    </div>
  );
}
