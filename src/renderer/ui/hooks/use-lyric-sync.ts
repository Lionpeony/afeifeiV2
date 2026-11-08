import { useEffect, type RefObject } from "react";

import type { Services } from "../services.js";
import { clearLyric, loadLyric, setUserOffset } from "../lyric-source.js";
import { trackById } from "../../domain/library/state.js";
import type { PlayerRemote } from "./use-media-session.js";

/**
 * 歌词（A-02）：切歌时由外壳统一取，播放页只订阅。
 * 桌面歌词窗的判据是"与主窗同步"，不该以"用户点开过播放页"为前提——
 * 之前 doc 由 StageView 写入，没进播放页就一直是空的。
 *
 * `lyricOffset` 是本曲的校准偏移（App 从 store 里读出来传入）：
 * 放在取词 effect 之后同步推给 lyric-source，切歌时 loadLyric 先发起（异步），
 * 这里同步把偏移换掉，等词回来时用的就是新偏移；改同一首的校准则立刻重排。
 */
export function useLyricSync(input: {
  remote: PlayerRemote;
  trackId: string | null;
  lyricOffset: number;
  services: RefObject<Services | null>;
}): void {
  const { remote, trackId, lyricOffset, services } = input;
  const lyricKey = remote ? `${remote.sourceId}:${remote.songId}` : `local:${trackId ?? ""}`;

  useEffect(() => {
    if (remote) {
      void loadLyric(remote.sourceId, remote.songId, (sourceId, songId) => {
        const svc = services.current;
        return svc ? svc.lyric(sourceId, songId) : Promise.reject(new Error("还没准备好，请稍后再试"));
      });
      return;
    }
    if (!trackId) {
      clearLyric("");
      return;
    }
    // 本地曲目（P0-20）：同名 .lrc → 内嵌标签 → LRCLIB，都没有就是「纯音乐」。
    // 取词与缓存都在 bootstrap 的 services 里，这里只挑曲目。
    const track = trackById(trackId);
    void loadLyric("local", trackId, () => {
      const svc = services.current;
      return svc ? svc.localLyric(track) : Promise.reject(new Error("还没准备好，请稍后再试"));
    });
  }, [lyricKey]);

  useEffect(() => {
    setUserOffset(lyricOffset);
  }, [lyricOffset, lyricKey]);
}
