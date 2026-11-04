import { useEffect, useRef, useState } from "react";
import type { CarouselItem } from "./visuals.js";

const SIDE = 64;
const SCALE_ACTIVE = 1.08;
const SCALE_STEP = 0.15;
const OPACITY_BASE = 0.6;
const OPACITY_STEP = 0.15;

export function StageArtwork({
  items,
  coverUrl,
  title,
  artist,
  album,
  duration,
  queueCursor,
}: {
  items: CarouselItem[];
  coverUrl: string | null;
  title: string;
  artist: string;
  album: string;
  duration: number;
  queueCursor: number;
}) {
  const [focus, setFocus] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastWheel = useRef<number | null>(null);
  const lastKey = useRef(0);
  const touchX = useRef(0);
  const idKey = items.map((item) => item.id).join("|");
  const focusIndex = Math.min(focus, Math.max(0, items.length - 1));

  useEffect(() => setFocus(0), [idKey]);
  useEffect(() => {
    const element = rootRef.current;
    if (!element || items.length < 2) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 20) return;
      if (lastWheel.current) clearTimeout(lastWheel.current);
      lastWheel.current = window.setTimeout(() => {
        lastWheel.current = null;
        setFocus((value) => Math.min(items.length - 1, Math.max(0, value + (delta > 0 ? 1 : -1))));
      }, 150);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
      if (lastWheel.current) clearTimeout(lastWheel.current);
      lastWheel.current = null;
    };
  }, [items.length]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const now = Date.now();
    if (now - lastKey.current < 100) return;
    lastKey.current = now;
    setFocus((value) => Math.min(items.length - 1, Math.max(0, value + (event.key === "ArrowRight" ? 1 : -1))));
  };
  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>): void => {
    touchX.current = event.targetTouches[0]?.clientX ?? 0;
  };
  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>): void => {
    const delta = touchX.current - (event.changedTouches[0]?.clientX ?? 0);
    if (Math.abs(delta) <= 50) return;
    setFocus((value) => Math.min(items.length - 1, Math.max(0, value + (delta > 0 ? 1 : -1))));
  };

  return (
    <div className="st-photo">
      <div className={coverUrl ? "art" : "art no-cover"} data-side={`SIDE A · ${String(queueCursor + 1).padStart(2, "0")}`}>
        {items.length >= 2 ? (
          <div ref={rootRef} className="st-caro" role="group" aria-label="封面轮播：点击两侧、滚轮或左右方向键切换" tabIndex={0} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {items.map((item, index) => {
              const distance = index - focusIndex;
              if (Math.abs(distance) > 2) return null;
              const active = distance === 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`st-caro-face${active ? " on" : ""}`}
                  style={{
                    transform: `translateX(calc(-50% + ${(distance * SIDE).toFixed(1)}px)) rotateY(${distance > 0 ? -15 : distance < 0 ? 15 : 0}deg) scale(${active ? SCALE_ACTIVE : 1 - Math.abs(distance) * SCALE_STEP})`,
                    opacity: active ? 1 : Math.max(0, OPACITY_BASE - Math.abs(distance) * OPACITY_STEP),
                    zIndex: 10 - Math.abs(distance),
                  }}
                  aria-current={active ? "true" : undefined}
                  aria-label={active ? "正在对焦的封面" : `聚焦到第 ${index + 1} 张封面`}
                  onClick={() => { if (!active) setFocus(index); }}
                >
                  {item.url ? <img src={item.url} alt="" draggable={false} /> : <i className="ph" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ) : coverUrl ? <img className="st-cover-img" src={coverUrl} alt="" /> : null}
        <div className="cap"><b>{title}</b><span>{duration > 0 ? `${Math.floor(duration / 60000)}:${String(Math.floor((duration % 60000) / 1000)).padStart(2, "0")}` : "--:--"}</span></div>
        <div className="cap2">{[artist, album].filter(Boolean).join(" · ") || "尚未播放"}</div>
      </div>
    </div>
  );
}
