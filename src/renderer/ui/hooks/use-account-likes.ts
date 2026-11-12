import { useEffect, useRef, useState, type RefObject } from "react";

import type { Services } from "../services.js";
import { getState } from "../../kernel/index.js";
import {
  beginAccount,
  isAccountLiked,
  pressAccountLike,
  readLiked,
  shouldRefreshOnFocus,
  subscribe as subscribeAccountLikes,
  type AccountLikesPort,
} from "../../domain/account-likes/index.js";
import { subscribe as subscribeLikes, toggleLike } from "../../domain/likes/index.js";
import { invalidatePrefix } from "../../domain/net-cache/index.js";
import { accountKey } from "../account-data.js";
import { getActiveSource, subscribeActiveSource } from "../active-source.js";

/** 四个账号数据入口的提示口径：账号是「当前音源」那一个，不再写死网易云。 */
export type AccountKind = "daily" | "liked" | "week" | "fm";

/**
 * 账号红心（底栏那颗心 + 「喜欢的音乐」页的取消红心 + 账号绑定生命周期）。
 *
 * - 在线曲目走账号红心（songId），本地曲目走本机红心（trackId）——两套 id 空间，不合并。
 * - 「任意红心变化都触发重渲染」：底栏读的是 isAccountLiked()/isLiked()，都不是本地
 *   state —— 不订阅就等于点了不亮（smoke 的「底栏红心」这条抓到过）。
 * - 绑定生命周期：音源切换 / 登录成功时 `ensureAccount` 重绑并读一次；当前源没有账号
 *   能力就先清绑，绝不把上一个账号的红心挂在新音源的界面上。
 */
export function useAccountLikes(input: {
  services: RefObject<Services | null>;
  /**
   * 瞬态反馈（成功 / 失败 / 需要登录）。2026-11-12 起走底部胶囊 toast：
   * 原来这些文案塞进顶部常驻 notice，"已加入喜欢"会一直挂在页面上不消失。
   */
  notify: (text: string, kind?: "ok" | "info" | "bad") => void;
  /** App 侧的账号解析（含「未登录」的提示文案），红心点下去时现场解析一次。 */
  resolveAccountSource: () => Promise<{
    id: string | null;
    hint: (kind: AccountKind) => string | null;
  }>;
}): {
  accountSource: RefObject<string>;
  ensureAccount: (id: string) => void;
  unlikeAccount: (sourceId: string, songId: string) => Promise<void>;
  toggleCurrentLike: () => void;
  /** 快捷键注册在依赖 [page] 的 effect 里，闭包会吃到旧值；用 ref 拿最新的这一份 */
  likeActionRef: RefObject<() => void>;
} {
  const { services, notify, resolveAccountSource } = input;
  const accountSource = useRef("");
  const [, setLikeRev] = useState(0);
  useEffect(() => subscribeAccountLikes(() => setLikeRev((r) => r + 1)), []);
  useEffect(() => subscribeLikes(() => setLikeRev((r) => r + 1)), []);

  /** 域不持有 port：每次现取。账号换了也不会把请求发到旧账号上。 */
  const portOf = (sourceId: string): AccountLikesPort => {
    const svc = services.current;
    if (!svc) throw new Error("服务还没准备好");
    return {
      likedIds: () => svc.accountLikedIds(sourceId),
      likedTotal: () => svc.accountLikedTotal(sourceId),
      setLiked: (songId, liked) => svc.accountSetLiked(sourceId, songId, liked),
    };
  };

  const ensureAccount = (id: string): void => {
    if (accountSource.current === id) return;
    accountSource.current = id;
    beginAccount(id);
    void readLiked(portOf(id)).catch(() => undefined);
  };

  /**
   * 取消账号红心。照 folia `handleLike` 的三条：提示先答、失败说一次、失败要把状态放回去。
   * 这里是 `throw` 给 AccountBlock 的：它负责让行回到可用状态（reject = 没成功）。
   */
  const unlikeAccount = async (sourceId: string, songId: string): Promise<void> => {
    try {
      await pressAccountLike(portOf(sourceId), songId, false);
      invalidatePrefix(accountKey(sourceId, "liked"));
      notify("已从账号红心移除", "ok");
    } catch (err) {
      notify(err instanceof Error ? err.message : "取消红心失败，已恢复", "bad");
      throw err;
    }
  };

  /** 底栏那颗心：在线曲目走账号红心，本地曲目走本机红心——两套 id，A 方案的延伸。 */
  const toggleCurrentLike = (): void => {
    const p = getState().player;
    if (!p.trackId) return;
    if (!p.remote) {
      toggleLike(p.trackId);
      return;
    }
    const songId = p.remote.songId;
    void (async () => {
      let id = accountSource.current;
      if (!id) {
        // 启动那一刻 services 可能还没就绪、或者用户没进过账号页：点的时候再找一次
        const found = await resolveAccountSource();
        if (found.id) {
          ensureAccount(found.id);
          id = found.id;
        }
      }
      if (!id) {
        const resolved = await resolveAccountSource();
        notify(resolved.hint("liked") ?? "登录后才能红心在线曲目", "info");
        return;
      }
      const wanted = !isAccountLiked(songId);
      try {
        await pressAccountLike(portOf(id), songId, wanted);
        invalidatePrefix(accountKey(id, "liked"));
        notify(wanted ? "已加入账号红心" : "已从账号红心移除", "ok");
      } catch (err) {
        notify(err instanceof Error ? err.message : "红心没改成", "bad");
      }
    })();
  };
  const likeActionRef = useRef(toggleCurrentLike);
  likeActionRef.current = toggleCurrentLike;

  /* 切音源 = 切账号（详见顶部注释），事件驱动，不挂在渲染上 */
  useEffect(
    () =>
      subscribeActiveSource(() => {
        void (async () => {
          const svc = services.current;
          if (!svc) return;
          const src = svc.sources().find((s) => s.id === getActiveSource());
          const clear = (): void => {
            if (!accountSource.current) return;
            accountSource.current = "";
            beginAccount("");
          };
          if (!src?.canAccount) return clear();
          const st = await svc.loginStatus(src.id).catch(() => ({ loggedIn: false, nick: null }));
          if (st.loggedIn) ensureAccount(src.id);
          else clear();
        })();
      }),
    [],
  );

  /*
   * 窗口重新获得焦点：在网易云 App 里改过红心，切回来要跟上。
   * folia 的 readMoments.ts 做的是同一件事（它更细：按时间窗+歌单计数决定要不要读）。
   */
  useEffect(() => {
    const onFocus = (): void => {
      const id = accountSource.current;
      if (!id || !shouldRefreshOnFocus()) return;
      void readLiked(portOf(id)).catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return { accountSource, ensureAccount, unlikeAccount, toggleCurrentLike, likeActionRef };
}
