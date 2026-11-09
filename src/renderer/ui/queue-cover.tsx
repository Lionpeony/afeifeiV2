import { useEffect, useRef, useState } from "react";

type CoverFn = (id: string, path: string) => Promise<string | null>;

/**
 * 队列行封面（队列 v2 重设计）：本地曲目走 services.cover（自带缓存与请求去重，
 * 几百行同时挂载也不会打爆 IPC）；在线曲目直接用 queue.remote[id].coverUrl。
 *
 * 拉不到 / 图片加载失败就画一张「空封套」占位（细线斜纹 + 序号），不留白块。
 * cover 引用每次 render 都会变（调用方传的是内联箭头函数），所以用 ref 持有，
 * effect 只依赖曲目 id —— 否则每次父组件渲染全部行重新拉一遍。
 */
export function QueueCover(props: {
  id: string;
  /** 播放序号（占位封套上印 №） */
  index: number;
  /** 在线曲目的封面（queue.remote[id].coverUrl，可为空） */
  coverUrl?: string;
  cover?: CoverFn;
}) {
  const { id, index, coverUrl, cover } = props;
  const remote = coverUrl && /^https?:/i.test(coverUrl) ? coverUrl : null;
  const coverRef = useRef(cover);
  coverRef.current = cover;
  const [local, setLocal] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  const isOnline = /^https?:\/\//i.test(id) || id.startsWith("remote:");
  useEffect(() => {
    setLocal(null);
    setBroken(false);
    if (remote || isOnline || !coverRef.current) return;
    let alive = true;
    coverRef
      .current(id, id)
      .then((url) => {
        if (alive) setLocal(url);
      })
      .catch(() => {
        if (alive) setLocal(null);
      });
    return () => {
      alive = false;
    };
  }, [id, remote, isOnline]);

  useEffect(() => {
    setBroken(false);
  }, [remote, local]);

  const url = remote ?? local;
  const cls = `qp-art${url && !broken ? "" : " ph"}`;
  return (
    <span className={cls} aria-hidden="true">
      {url && !broken ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <i>{String(Math.max(0, index)).padStart(2, "0")}</i>
      )}
    </span>
  );
}
