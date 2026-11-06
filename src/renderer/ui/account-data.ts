import { useEffect, useRef, useState } from "react";
import type { RemoteTrack } from "../../contracts/capability.js";
import { getNet, loadNet, refreshNet, updateNet } from "../domain/net-cache/index.js";
import { getActiveSource, subscribeActiveSource } from "./active-source.js";

/**
 * 账号数据的一次性加载（四个视图共用）。
 *
 * 为什么不像曲库那样做成 Ring 1 的全局 store：
 * 曲库是"一次导入、到处都要"的长活数据，账号数据是"进这个页面才要、一天换一份"的短活数据。
 * 做成全局 store 就要处理"切换账号后清空"「离线时保留旧的」这些没人要求的状态机。
 *
 * 但「切页就重拉」是另一回事：页面卸载重挂载不该等于一次网络往返。
 * 数据本身仍归页面所有，落点是 domain/net-cache 的会话级缓存：
 * 同一个 sourceId + kind 在本次运行内只请求一次，手动刷新才失效。
 */

export type AccountKind = "daily" | "liked" | "week" | "fm";

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
  /** 错误态的「重试」和页头的「刷新」都用 */
  reload(): void;
  /**
   * 本地摘掉一首（账号红心取消成功后调）。
   * 不重拉整份列表：43 首红心重拉就是一次 song_detail 往返，界面还会闪一下 LOADING。
   */
  removeSong(songId: string): void;
}

export const accountKey = (sourceId: string, kind: AccountKind): string => `account:${sourceId}:${kind}`;

type Internal = Omit<AccountState, "reload" | "removeSong"> & { key: string };

const bundleState = (key: string, bundle: AccountBundle | undefined): Internal =>
  bundle
    ? { key, sourceId: bundle.sourceId, songs: bundle.songs, hint: bundle.hint, error: null, loading: false }
    : { key, sourceId: "", songs: [], hint: null, error: null, loading: true };

export function useAccountBundle(load: () => Promise<AccountBundle>, kind: AccountKind): AccountState {
  const loadFn = useRef(load);
  loadFn.current = load;

  const key = accountKey(getActiveSource(), kind);
  const [state, setState] = useState<Internal>(() => bundleState(key, getNet<AccountBundle>(key)));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const hit = getNet<AccountBundle>(key);
    if (hit) {
      setState(bundleState(key, hit));
      return;
    }
    setState((s) => ({ ...s, key, loading: true, error: null }));
    void loadNet(key, loadFn.current)
      .then((bundle) => {
        if (alive) setState({ key, ...bundle, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState({
          key,
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
  }, [key, tick]);

  // 切音源 = 切账号：key 变了，页面上的账号数据必须跟着重拉
  useEffect(() => subscribeActiveSource(() => setTick((t) => t + 1)), []);

  // 首帧就按缓存渲染，避免「已经缓存过还闪一下正在取」
  const current = state.key === key ? state : bundleState(key, getNet<AccountBundle>(key));

  return {
    ...current,
    reload: () => {
      refreshNet(key);
      setTick((t) => t + 1);
    },
    removeSong: (songId) => {
      updateNet<AccountBundle>(key, (prev) =>
        prev ? { ...prev, songs: prev.songs.filter((t) => t.sourceId !== songId) } : prev,
      );
      setState((s) => (s.key === key ? { ...s, songs: s.songs.filter((t) => t.sourceId !== songId) } : s));
    },
  };
}
