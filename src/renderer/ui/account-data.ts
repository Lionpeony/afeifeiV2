import { useEffect, useRef, useState } from "react";
import type { RemoteTrack } from "../../contracts/capability.js";

/**
 * 账号数据的一次性加载（三个视图共用）。
 *
 * 为什么不像曲库那样做成 Ring 1 的全局 store：
 * 曲库是"一次导入、到处都要"的长活数据，账号数据是"进这个页面才要、一天换一份"的短活数据。
 * 做成全局 store 就要处理"切换账号后清空"「离线时保留旧的」这些没人要求的状态机。
 */

export interface AccountBundle {
  /** 提供数据的源；空字符串 = 没有可用账号（songs 也为空） */
  sourceId: string;
  songs: RemoteTrack[];
  /** 有账号能力但没登录时的一句话；没有就 null */
  hint: string | null;
}

export interface AccountState {
  sourceId: string;
  songs: RemoteTrack[];
  hint: string | null;
  error: string | null;
  loading: boolean;
  /** 错误态的「重试」用 */
  reload(): void;
  /**
   * 本地摘掉一首（账号红心取消成功后调）。
   * 不重拉整份列表：43 首红心重拉就是一次 song_detail 往返，界面还会闪一下 LOADING。
   */
  removeSong(songId: string): void;
}

export function useAccountBundle(load: () => Promise<AccountBundle>): AccountState {
  const loadFn = useRef(load);
  loadFn.current = load;

  const [state, setState] = useState<Omit<AccountState, "reload" | "removeSong">>({
    sourceId: "",
    songs: [],
    hint: null,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    void loadFn
      .current()
      .then((bundle) => {
        if (!alive) return;
        setState({
          sourceId: bundle.sourceId,
          songs: bundle.songs,
          hint: bundle.hint,
          error: null,
          loading: false,
        });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState({
          sourceId: "",
          songs: [],
          hint: null,
          error: err instanceof Error ? err.message : "取账号数据失败",
          loading: false,
        });
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  return {
    ...state,
    reload: () => setTick((t) => t + 1),
    removeSong: (songId) =>
      setState((s) => ({ ...s, songs: s.songs.filter((t) => t.sourceId !== songId) })),
  };
}
