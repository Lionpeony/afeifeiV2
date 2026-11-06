import { useEffect, useMemo, useState } from "react";
import type { AppState } from "../../../../contracts/index.js";
import type { Track } from "../../../domain/library/schema.js";
import { getProvider } from "../../../capability/registry.js";
import { getTracks, subscribe as subscribeLibrary } from "../../../domain/library/state.js";
import { orderOf, positionOf } from "../../../kernel/index.js";
import { carouselItems } from "./visuals.js";
import { fileOf } from "./types.js";

const UP_NEXT = 3;

export function useStageData(state: AppState, cover: (trackId: string) => Promise<string | null>) {
  const { player, queue, stage } = state;
  const [revision, setRevision] = useState(0);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [queueCovers, setQueueCovers] = useState<Record<string, string>>({});

  useEffect(() => subscribeLibrary(() => setRevision((value) => value + 1)), []);
  const tracksMap = useMemo(() => {
    const tracks = new Map<string, Track>();
    for (const track of getTracks()) {
      tracks.set(track.id, track);
      tracks.set(track.path, track);
    }
    return tracks;
  }, [revision]);

  const remote = player.remote;
  const nowTrack = player.trackId ? tracksMap.get(player.trackId) : undefined;
  const nowTitle = player.trackTitle ?? nowTrack?.title ?? (player.trackId ? fileOf(player.trackId) : "未在播放");
  const nowArtist = nowTrack?.artist ?? (remote ? "在线音源" : "");
  const nowAlbum = nowTrack?.album ?? "";
  const nowDuration = nowTrack?.durationMs ?? 0;
  const sourceName = remote ? (getProvider(remote.sourceId)?.name ?? remote.sourceId) : "本地曲库";
  const lyricOffset = state.lyrics.offsets[player.trackId ?? ""] ?? 0;
  const playOrder = useMemo(() => orderOf(queue.items, queue.mode, queue.shuffleSeed), [queue.items, queue.mode, queue.shuffleSeed]);
  const cursorPosition = positionOf(playOrder, queue.cursor);
  const nextIndices = useMemo(() => {
    if (cursorPosition < 0) return playOrder.slice(0, UP_NEXT);
    const rest = playOrder.slice(cursorPosition + 1);
    return queue.mode === "repeat-all" ? rest.concat(playOrder.slice(0, cursorPosition + 1)).slice(0, UP_NEXT) : rest.slice(0, UP_NEXT);
  }, [playOrder, cursorPosition, queue.mode]);
  const upNext = nextIndices.map((index) => queue.items[index]);
  const upNextKey = upNext.join("|");

  useEffect(() => {
    let alive = true;
    setCoverUrl(null);
    if (remote?.coverUrl) setCoverUrl(remote.coverUrl);
    else if (player.trackId && !/^https?:\/\//i.test(player.trackId)) {
      cover(player.trackId).then((url) => { if (alive) setCoverUrl(url); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [player.trackId, remote?.coverUrl, cover]);

  useEffect(() => {
    let alive = true;
    // 只要本地路径：`remote:` 是在线曲目（封面在 queue.remote 里），别拿去查曲库
    const localIds = upNext.filter((id) => !/^https?:\/\//i.test(id) && !id.startsWith("remote:"));
    Promise.all(localIds.map((id) => cover(id).catch(() => null))).then((urls) => {
      if (!alive) return;
      const next: Record<string, string> = {};
      localIds.forEach((id, index) => { if (urls[index]) next[id] = urls[index]!; });
      setQueueCovers(next);
    });
    return () => { alive = false; };
  }, [upNextKey, cover]);

  const carouselItemsForStage = useMemo(() => stage.coverCarousel ? carouselItems([
    player.trackId ? { id: player.trackId, url: coverUrl } : null,
    ...upNext.map((id) => ({ id, url: queueCovers[id] ?? null })),
  ]) : [], [stage.coverCarousel, player.trackId, coverUrl, upNextKey, queueCovers]);

  return {
    remote, tracksMap, nowTrack, nowTitle, nowArtist, nowAlbum, nowDuration, sourceName,
    lyricOffset, playOrder, cursorPosition, nextIndices, upNext, upNextKey,
    coverUrl, queueCovers,
    /** 在线曲目的标题/歌手：右栏「接下来」不能显示 `remote:xxx` 这种逻辑 id */
    queueRemote: queue.remote,
    carouselItems: carouselItemsForStage,
  };
}

