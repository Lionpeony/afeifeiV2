import { useEffect, useMemo, useRef, useState } from "react";
import type { QueueState } from "../../contracts/index.js";
import type { Track } from "../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary } from "../domain/library/state.js";
import { dispatch, dropTargetIndex, orderOf, positionOf } from "../kernel/index.js";
import { onFrame } from "./compositor.js";

/**
 * 完整队列面板（P0-10/11/12/16，抄 SPlayer 的 `SongPlayList.vue` + `useDragSort.ts`）。
 *
 * 三条语义决定（别随手改）：
 * 1. **行顺序按播放序**（`orderOf`），不按 `items` 原顺序 —— 随机模式下用户要看到"真的下一首"。
 *    操作（移/删）仍然用 `items` 下标，两套下标不许混（与播放页右栏同一口径）。
 * 2. **随机模式下关拖拽**：拖的是 `items`，改不动播放序，拖完看着没反应比不让拖更糟。
 *    上移/下移按钮同理只在非随机时给；删除与点播任何时候都给。
 * 3. 失败曲目标 `queue.failed`（P0-16）：点它就是重试，成功了装配层自动摘标。
 *
 * ponytail: 未做虚拟滚动。几百首没问题，几千首会卡（一次渲染全部行）。
 * 升级路径：抄 SPlayer 的 `VirtualScroll` 或换 react-window；队列长度超过 1000 再动。
 */

const ROW_H = 46; // 与 player.css 的 .qp-row 高度一致；拖拽靠它换算落点
const EDGE = 36; // 拖到列表上下 36px 内自动滚动
const SCROLL_STEP = 12;

export interface QueuePanelProps {
  queue: QueueState;
  onClose(): void;
}

const pad2 = (n: number): string => String(Math.max(0, n)).padStart(2, "0");

function fileOf(id: string): string {
  if (/^https?:\/\//i.test(id)) return "在线音源";
  // 队列里的在线项是 `remote:<音源>:<歌 id>`，别把逻辑 id 当歌名摆出来
  if (id.startsWith("remote:")) return "在线曲目";
  const parts = id.split(/[\\/]/);
  return parts[parts.length - 1] ?? id;
}

function fmt(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "--:--";
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

export function QueuePanel(props: QueuePanelProps) {
  const { queue, onClose } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef(-1);
  const dirRef = useRef(0); // 拖到边缘时的滚动方向（-1 / 0 / 1）
  const [gap, setGap] = useState(-1); // 插入线所在缝（0..n）
  const [confirmClear, setConfirmClear] = useState(false);
  const [rev, setRev] = useState(0);

  // 曲库元数据：队列行要标题/歌手/时长。在线曲目不在曲库里 → 走兜底，不编数据。
  useEffect(() => subscribeLibrary(() => setRev((r) => r + 1)), []);
  const tracks = useMemo(() => {
    const m = new Map<string, Track>();
    // 队列里存的是原始大小写的 path（onPlay 用 r.path 建队列），id 是小写规范化路径：
    // 两个键都建，否则队列行只能显示文件名
    for (const t of getTracks()) {
      m.set(t.id, t);
      m.set(t.path, t);
    }
    return m;
  }, [rev]);

  /** 播放序 → items 下标（操作要用后者） */
  const order = useMemo(
    () => orderOf(queue.items, queue.mode, queue.shuffleSeed),
    [queue.items, queue.mode, queue.shuffleSeed],
  );
  const canReorder = queue.mode !== "shuffle";

  const jump = (id: string, title: string | null): void => {
    dispatch({ type: "player/play", trackId: id, trackTitle: title });
  };

  /** 按行高把指针位置换成插入缝；列表是固定行高，所以不用逐行量 rect */
  const gapOf = (clientY: number): number => {
    const el = listRef.current;
    if (!el) return -1;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top + el.scrollTop;
    const g = Math.round(y / ROW_H);
    return Math.min(Math.max(g, 0), queue.items.length);
  };

  /* ---- 拖拽：指针事件 + 插入线，不引库（抄 SPlayer 的算法，去掉虚拟列表那段） ---- */
  useEffect(() => {
    if (gap < 0) return;

    const onMove = (e: PointerEvent): void => {
      const el = listRef.current;
      if (!el) return;
      const g = gapOf(e.clientY);
      if (g >= 0) setGap(g);
      // 边缘自动滚动：长队列拖到底也能继续。滚动本身交给 compositor 的唯一帧循环
      // （lint 规则 4：rAF 只准出现在 compositor.ts）
      const rect = el.getBoundingClientRect();
      dirRef.current = e.clientY < rect.top + EDGE ? -1 : e.clientY > rect.bottom - EDGE ? 1 : 0;
    };

    const onUp = (): void => {
      dirRef.current = 0;
      const from = dragFrom.current;
      const g = gap;
      dragFrom.current = -1;
      setGap(-1);
      if (from < 0 || g < 0) return;
      // 换算在 kernel/queue.ts 的 dropTargetIndex（纯函数，有断言钉住"往下拖 -1"）
      const to = dropTargetIndex(from, g, queue.items.length);
      if (to >= 0 && to !== from) dispatch({ type: "queue/move", from, to });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      dirRef.current = 0;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // gap 变化要重挂监听（onUp 读的是当前 gap）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gap >= 0, queue.items.length]);

  /* 拖拽时的边缘自动滚动：挂在唯一帧循环上（不自建 rAF） */
  useEffect(() => {
    if (gap < 0) return;
    return onFrame(() => {
      const el = listRef.current;
      if (!el || dirRef.current === 0) return;
      el.scrollTop += dirRef.current * SCROLL_STEP;
    });
  }, [gap >= 0]);

  // 打开就滚到当前曲（抄 SPlayer 的 scrollToItem(playIndex)）
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const pos = positionOf(order, queue.cursor);
    if (pos < 0) return;
    el.scrollTop = Math.max(0, (pos - 3) * ROW_H);
    // 只在打开时定位一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 面板开着时队列被裁（FM 续批）：列表变短后只保证当前曲还在视口里，
  // 用户自己滚到别处时不抢他的位置
  const lastLen = useRef(queue.items.length);
  useEffect(() => {
    const prevLen = lastLen.current;
    lastLen.current = queue.items.length;
    if (queue.items.length >= prevLen) return; // 追加/正常切歌不动滚动
    const el = listRef.current;
    if (!el) return;
    const pos = positionOf(order, queue.cursor);
    if (pos < 0) return;
    const top = pos * ROW_H;
    if (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, (pos - 3) * ROW_H);
    }
  }, [queue.items.length, order, queue.cursor]);

  const total = queue.items.length;

  return (
    <div className="qp-mask" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="qp" role="dialog" aria-label="播放队列">
        <header className="qp-head">
          <b>播放队列</b>
          <span>{total} 首</span>
          {!canReorder ? <small>随机模式 · 按播放序显示，拖拽已关</small> : null}
          <span className="sp" />
          <button type="button" className="qp-x" onClick={onClose} title="关闭（Esc）">
            ✕
          </button>
        </header>

        {total === 0 ? (
          <p className="qp-empty">队列是空的 · 从曲库选一首开始</p>
        ) : (
          <div className="qp-list" ref={listRef}>
            {order.map((at, pos) => {
              const id = queue.items[at];
              const t = tracks.get(id);
              // 在线曲目：标题/歌手/时长都在队列表里（点每日推荐/榜单时整份写入）
              const meta = queue.remote[id];
              const title = meta?.title ?? t?.title ?? fileOf(id);
              const on = at === queue.cursor;
              // 标记按大小写不敏感比：队列存的是原始路径（`C:/x.mp3`），
              // 播放态里的 trackId 是规范化小写（`c:/x.mp3`）—— 直接 === 永远对不上（截图发现的坑）
              const low = id.toLowerCase();
              const bad = queue.failed.some((f) => f.toLowerCase() === low);
              return (
                <div
                  key={`${id}-${at}`}
                  className={`qp-row${on ? " on" : ""}${bad ? " bad" : ""}${gap === pos ? " gap" : ""}`}
                >
                  {canReorder ? (
                    <span
                      className="qp-grip"
                      title="拖动排序"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        dragFrom.current = at;
                        setGap(pos);
                      }}
                    >
                      ⋮⋮
                    </span>
                  ) : (
                    <span className="qp-grip off" />
                  )}
                  <i className="qp-no">{on ? "♪" : pad2(pos + 1)}</i>
                  <button
                    type="button"
                    className="qp-main"
                    onClick={() =>
                      jump(id, meta ? `${meta.title} — ${meta.artist}` : (t?.title ?? null))
                    }
                  >
                    <span className="qp-tx">
                      {title}
                      <small>
                        {bad ? "播不了 · 点一下重试" : (meta?.artist ?? t?.artist ?? (t ? "未知歌手" : "在线音源"))}
                      </small>
                    </span>
                  </button>
                  <time>{fmt(meta?.durationMs ?? t?.durationMs)}</time>
                  <span className="qp-ops">
                    {canReorder ? (
                      <>
                        <button
                          type="button"
                          aria-label="上移一位"
                          disabled={at === 0}
                          onClick={() => dispatch({ type: "queue/move", from: at, to: at - 1 })}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label="下移一位"
                          disabled={at === total - 1}
                          onClick={() => dispatch({ type: "queue/move", from: at, to: at + 1 })}
                        >
                          ↓
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      aria-label="从队列移除"
                      onClick={() => dispatch({ type: "queue/remove", index: at })}
                    >
                      ×
                    </button>
                  </span>
                </div>
              );
            })}
            {gap === total ? <span className="qp-drop" /> : null}
          </div>
        )}

        <footer className="qp-foot">
          <button
            type="button"
            onClick={() => {
              const el = listRef.current;
              const pos = positionOf(order, queue.cursor);
              if (el && pos >= 0) el.scrollTop = Math.max(0, (pos - 3) * ROW_H);
            }}
          >
            定位当前
          </button>
          <span className="sp" />
          {confirmClear ? (
            <>
              <button type="button" className="qp-danger" onClick={() => dispatch({ type: "queue/clear" })}>
                确认清空 {total} 首
              </button>
              <button type="button" onClick={() => setConfirmClear(false)}>
                取消
              </button>
            </>
          ) : (
            <button type="button" disabled={total === 0} onClick={() => setConfirmClear(true)}>
              清空
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}
