import { useEffect, useRef, useState } from "react";
import type { OnlinePlaylist, RemoteTrack } from "../../../../contracts/capability.js";
import { getNet, invalidatePrefix, loadNet } from "../../../domain/net-cache/index.js";
import type { SavedPlaylistView } from "../../services.js";
import { useActiveSource } from "../../use-active-source.js";
import type { Selection } from "./PlaylistIndex.js";

type TracksPage = { items: RemoteTrack[]; nextPage?: number };

/** 歌单页要的那几条服务：宿主传进来，hook 不知道它们背后是哪家音源 */
export interface PlaylistLibraryPorts {
  sources: { id: string; name: string }[];
  listPlaylists(sourceId: string): Promise<OnlinePlaylist[]>;
  playlistTracks(
    sourceId: string,
    playlistId: string,
    page?: number,
  ): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  onlinePlaylists(): Promise<SavedPlaylistView[]>;
  savePlaylist(
    sourceId: string,
    playlist: { id: string; name: string; count: number; coverUrl?: string },
  ): Promise<SavedPlaylistView[]>;
  importPlaylist(sourceId: string, ref: string): Promise<SavedPlaylistView[]>;
  removePlaylist(sourceId: string, id: string): Promise<SavedPlaylistView[]>;
}

/**
 * 歌单页的数据层：收藏（本机 KV）+ 账号歌单（音源实时）+ 当前选中的曲目。
 *
 * 两条容易写错的地方，都收在这里：
 *  1. 宿主传的回调是内联箭头函数，每次渲染都是新引用 —— 放进 useEffect 依赖
 *     会让页面无限重拉（旧版就在这每秒打十几次 user_playlist）。
 *  2. 快速连点两个歌单时，慢的那一批回来不许覆盖新的，所以每次取曲目带序号。
 */
export function usePlaylistLibrary(ports: PlaylistLibraryPorts) {
  const { sources, listPlaylists, playlistTracks, onlinePlaylists, savePlaylist, importPlaylist, removePlaylist } =
    ports;
  const [sourceId, setSourceId] = useActiveSource(sources);
  const [saved, setSaved] = useState<SavedPlaylistView[]>([]);
  const [playlists, setPlaylists] = useState<OnlinePlaylist[]>([]);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [tracks, setTracks] = useState<RemoteTrack[]>([]);
  const [nextPage, setNextPage] = useState<number | undefined>(undefined);
  const [note, setNote] = useState("");
  /** 取曲目失败单独记一份：note 也用于收藏/导入，右栏要分清「没有」和「没取到」 */
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  /* 收藏：只读一次本机 KV。 */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 账号歌单：走会话级缓存，切源 / 切页回来不再等一次往返；点刷新才失效。 */
  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    const key = `playlists:list:${sourceId}`;
    // 命中缓存先摆出来：先清空再等回包会闪一下空白列表
    setPlaylists(getNet<OnlinePlaylist[]>(key) ?? []);
    setNote("");
    loadNet(key, () => listPlaylists(sourceId))
      .then((list) => {
        if (alive) setPlaylists(list);
      })
      .catch((err: unknown) => {
        if (alive) setNote(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, tick]);

  const loadTracks = async (src: string, playlistId: string, page: number): Promise<void> => {
    const my = ++seq.current;
    const key = `playlists:tracks:${src}:${playlistId}:${page}`;
    // 命中缓存就同步摆出来，不置 busy —— 在两个歌单之间来回点不该每次都等骨架
    const cached = page === 0 ? getNet<TracksPage>(key) : undefined;
    if (cached) {
      setTracks(cached.items);
      setNextPage(cached.nextPage);
      setLoadError("");
      return;
    }
    setBusy(true);
    setNote("");
    setLoadError("");
    try {
      const result = await loadNet(key, () => playlistTracks(src, playlistId, page));
      if (my !== seq.current) return;
      setTracks((prev) => (page === 0 ? result.items : [...prev, ...result.items]));
      setNextPage(result.nextPage);
    } catch (err) {
      if (my !== seq.current) return;
      const text = err instanceof Error ? err.message : String(err);
      setLoadError(text);
      setNote(text);
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };

  const open = (src: string, id: string): void => {
    setSelected({ sourceId: src, id });
    // 先铺缓存再请求：有缓存时这一帧就已经是完整曲目，不再先清空再填一次
    const cached = getNet<TracksPage>(`playlists:tracks:${src}:${id}:0`);
    setTracks(cached?.items ?? []);
    setNextPage(cached?.nextPage);
    setLoadError("");
    void loadTracks(src, id, 0);
  };

  /* 抬头从两份列表反查，不另存一份名字；收藏的优先（它跨源存在） */
  const selectedItem =
    selected === null
      ? null
      : (() => {
          const hit = saved.find((p) => p.sourceId === selected.sourceId && p.id === selected.id);
          if (hit) return hit;
          if (selected.sourceId !== sourceId) return null;
          const online = playlists.find((p) => p.id === selected.id);
          return online ? { ...online, sourceId } : null;
        })();

  /* 选中的歌单被删 / 刷新后从列表里消失：右栏不许继续挂着别人的曲目 */
  useEffect(() => {
    if (!selected || selectedItem) return;
    setSelected(null);
    setTracks([]);
    setNextPage(undefined);
    setLoadError("");
    // selectedItem 每次渲染都是新的反查结果，只认「有没有」这一件事
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, saved, playlists, sourceId]);

  /* 进页 / 切源 / 删掉当前选中的之后，右栏不许空着：
     有收藏先落收藏（KV 即刻可得），否则落当前源的第一个账号歌单。 */
  useEffect(() => {
    if (selected || sources.length === 0) return;
    const first: Selection | null = saved[0]
      ? { sourceId: saved[0].sourceId, id: saved[0].id }
      : playlists[0] && sourceId
        ? { sourceId, id: playlists[0].id }
        : null;
    if (!first) return;
    setSelected(first);
    void loadTracks(first.sourceId, first.id, 0);
    // loadTracks 是本轮渲染的闭包，进依赖会让本效果每帧重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, playlists, sourceId, selected, sources.length]);

  /** 切源：旧源的账号歌单不再成立；收藏的选中可以留着（收藏跨源）。 */
  const changeSource = (id: string): void => {
    setSourceId(id);
    // 不清空列表：下一个 effect 会先铺缓存再补请求，清空反而闪一下白
    setSelected((cur) => (cur && saved.some((p) => p.sourceId === cur.sourceId && p.id === cur.id) ? cur : null));
    setTracks([]);
    setNextPage(undefined);
    setLoadError("");
  };

  const keep = async (playlist: OnlinePlaylist): Promise<void> => {
    try {
      setSaved(await savePlaylist(sourceId, playlist));
      setNote(`已收藏「${playlist.name}」`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const drop = async (src: string, id: string, name: string): Promise<void> => {
    try {
      setSaved(await removePlaylist(src, id));
      setNote(`已取消收藏「${name}」`);
      if (selected?.sourceId === src && selected.id === id) {
        setSelected(null);
        setTracks([]);
        setNextPage(undefined);
        setLoadError("");
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  /** 当前这张是否已经在本机收藏里（跨源比对：收藏项可能来自别的音源） */
  const isSaved = selected !== null && saved.some((p) => p.sourceId === selected.sourceId && p.id === selected.id);

  /**
   * 抬头那颗按钮的两条路：已收藏 → 取消；未收藏 → 收藏。
   * 跨源的收藏项不给「收藏」（它已经收藏过了，再收藏等于复制一条）。
   */
  const toggleSave = (): void => {
    if (!selected || !selectedItem) return;
    if (isSaved) {
      void drop(selected.sourceId, selected.id, selectedItem.name);
      return;
    }
    if (selected.sourceId !== sourceId) return;
    void keep({ id: selected.id, name: selectedItem.name, count: selectedItem.count, coverUrl: selectedItem.coverUrl });
  };

  const doImport = async (text: string): Promise<boolean> => {
    setImporting(true);
    setNote("");
    try {
      const list = await importPlaylist(sourceId, text);
      setSaved(list);
      // 刚写入的 savedAt 最大；同 id 复导入时它不一定排在第一位
      const newest = list.reduce((a, b) => (b.savedAt > a.savedAt ? b : a), list[0]);
      if (newest) {
        setSelected({ sourceId: newest.sourceId, id: newest.id });
        setTracks([]);
        setNextPage(undefined);
        void loadTracks(newest.sourceId, newest.id, 0);
      }
      setNote(`已收藏「${newest?.name ?? "歌单"}」`);
      return true;
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setImporting(false);
    }
  };

  return {
    sourceId,
    saved,
    playlists,
    selected,
    selectedItem,
    tracks,
    nextPage,
    note,
    loadError,
    busy,
    importing,
    isSaved,
    changeSource,
    open,
    toggleSave,
    doImport,
    more: () => {
      if (selected && nextPage !== undefined) void loadTracks(selected.sourceId, selected.id, nextPage);
    },
    refresh: () => {
      // 清单和曲目一起失效，否则刷新后点开的还是旧曲目
      invalidatePrefix(`playlists:list:${sourceId}`);
      invalidatePrefix(`playlists:tracks:${sourceId}:`);
      setTick((t) => t + 1);
    },
    clearNote: () => setNote(""),
    say: (text: string) => setNote(text),
  };
}
