/**
 * 账号红心（Ring 1）。**只在登录后有意义**，与本地红心（domain/likes）是两套 id 空间：
 * 这里是网易云的 songId，那边是本机曲目的 trackId，永远不混。
 *
 * 三条行为照 folia 的 `handleLike` / `applyLikedRead` / `likePresses`：
 *  1. 心和提示先答，请求后发（乐观）；
 *  2. 失败回到「账号确认过的状态」(`confirmed`)，并抛出去让调用方提示一次；
 *  3. 读取返回时要跟读取期间发生的点击**合流**，不能拿旧快照把用户刚点的盖掉。
 *
 * 单一事实源：播放条上的心、喜欢页的列表、快捷键都读这里，谁也不许自己存一份。
 */

export interface AccountLikesPort {
  likedIds(): Promise<string[]>;
  /** 平台自报的红心总数；用来区分「确实没有」和「读取失败」 */
  likedTotal(): Promise<number>;
  setLiked(songId: string, liked: boolean): Promise<void>;
}

type Status = "idle" | "reading" | "ready" | "error";

export interface AccountLikesState {
  /** 当前账号（providerId）；换账号要把整套状态清掉 */
  providerId: string;
  ids: ReadonlySet<string>;
  status: Status;
  error: string | null;
  /** 平台确认过「这个账号确实一首红心都没有」 */
  countedEmpty: boolean;
  /** 上次成功读取的时刻（窗口重新聚焦时判断要不要重读） */
  readAt: number;
}

let providerId = "";
let ids = new Set<string>();
/** 账号最后一次确认过的集合：失败回滚就回到它 */
let confirmed = new Set<string>();
let status: Status = "idle";
let error: string | null = null;
let countedEmpty = false;
let readAt = 0;

const listeners = new Set<() => void>();
/** 读取期间的点击：读回来后重放到结果上 */
let pressedDuringRead = new Map<string, boolean>();
/** 每首歌最后一次点击想要的最终状态（连点时收敛到它） */
const desired = new Map<string, boolean>();
/** 同一首歌的写请求串行化，避免响应乱序落地 */
const chains = new Map<string, Promise<void>>();

const notify = (): void => {
  for (const fn of listeners) fn();
};

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getAccountLikes(): AccountLikesState {
  return { providerId, ids, status, error, countedEmpty, readAt };
}

export const isAccountLiked = (songId: string): boolean => ids.has(songId);

/** 换账号（或首次登录）时调用：key 变了就整套清空，绝不把上一个账号的红心留在地上。 */
export function beginAccount(nextProviderId: string): boolean {
  if (providerId === nextProviderId) return false;
  providerId = nextProviderId;
  ids = new Set();
  confirmed = new Set();
  status = nextProviderId ? "idle" : "idle";
  error = null;
  countedEmpty = false;
  readAt = 0;
  pressedDuringRead = new Map();
  desired.clear();
  chains.clear();
  notify();
  return true;
}

/** 同一首歌的写串行：前一个失败也要继续下一个（失败由各自调用方处理） */
function enqueue(songId: string, run: () => Promise<void>): Promise<void> {
  const prev = chains.get(songId) ?? Promise.resolve();
  const next = prev.then(run, run);
  chains.set(
    songId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/**
 * 读整份红心。并发调用会被合并（读取中直接返回）。
 * 读完把读取期间发生的点击重放到结果上——这是 folia `applyLikedRead` 的核心那一行。
 */
export async function readLiked(port: AccountLikesPort): Promise<void> {
  if (status === "reading") return;
  const reading = new Map<string, boolean>();
  pressedDuringRead = reading;
  status = "reading";
  error = null;
  notify();

  try {
    const list = await port.likedIds();
    const next = new Set(list);
    for (const [id, wanted] of reading) {
      if (wanted) next.add(id);
      else next.delete(id);
    }
    ids = next;
    confirmed = new Set(list);
    countedEmpty = false;

    if (list.length === 0) {
      // 空列表要问清是「真空」还是「读失败」：平台说有几首就信它
      const total = await port.likedTotal().catch(() => -1);
      countedEmpty = total === 0;
      if (total > 0) {
        error = `账号里有 ${total} 首红心，但这次只读到 0 首，点重试`;
      }
    }
    status = "ready";
    readAt = Date.now();
  } catch (err) {
    status = "error";
    error = err instanceof Error ? err.message : "读取账号红心失败";
  } finally {
    pressedDuringRead = new Map();
    notify();
  }
}

/**
 * 收藏 / 取消。乐观更新 + 串行 + 失败回滚。
 * 失败时 reject，调用方负责给用户一句话（本层不碰 UI 文案）。
 */
export async function pressAccountLike(
  port: AccountLikesPort,
  songId: string,
  wanted: boolean,
): Promise<void> {
  const wasLiked = ids.has(songId);
  desired.set(songId, wanted);
  if (wanted) ids.add(songId);
  else ids.delete(songId);
  if (status === "reading") pressedDuringRead.set(songId, wanted);
  notify();

  try {
    await enqueue(songId, () => port.setLiked(songId, wanted));
    // 只有「这会儿还是我想要的」才写进 confirmed；被后来的点击改过就交给那一次
    if (desired.get(songId) === wanted) {
      if (wanted) confirmed.add(songId);
      else confirmed.delete(songId);
    }
  } catch (err) {
    // 回到账号确认过的状态
    if (confirmed.has(songId)) ids.add(songId);
    else ids.delete(songId);
    if (wasLiked === ids.has(songId)) desired.delete(songId);
    notify();
    throw err;
  }
}

/**
 * 窗口重新获得焦点时要不要重读（folia 的 readMoments 简化版）。
 * 60 秒内不重复：切来切去不该每次都打一次接口。
 */
export function shouldRefreshOnFocus(minGapMs = 60_000): boolean {
  if (!providerId || status !== "ready") return false;
  return Date.now() - readAt > minGapMs;
}

/** 只给测试用：把整套状态清回初始。 */
export function __resetAccountLikes(): void {
  providerId = "";
  ids = new Set();
  confirmed = new Set();
  status = "idle";
  error = null;
  countedEmpty = false;
  readAt = 0;
  pressedDuringRead = new Map();
  desired.clear();
  chains.clear();
  listeners.clear();
}
