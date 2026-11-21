/* 程序化封面插画 · 从 offline_single/js/anime.jsx 移植
   hash 取模必须用无符号右移（>>>），有符号右移在负 hash 上会产生负索引。 */
import { memo, type ReactNode } from "react";

export function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* 占位封面的三色底只读主题包 token（--art-a/b/c），换包即换材质；
   先站哪一色按 track 轮换，保留「每首歌都不一样」的手感，不再留死粉紫。 */
const ART_COLORS = ["var(--art-a)", "var(--art-b)", "var(--art-c)"] as const;
const ART_ORDERS: [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2][] = [
  [0, 1, 2],
  [1, 2, 0],
  [2, 0, 1],
  [0, 2, 1],
  [2, 1, 0],
];
function artTriple(h: number): [string, string, string] {
  const o = ART_ORDERS[h % ART_ORDERS.length];
  return [ART_COLORS[o[0]], ART_COLORS[o[1]], ART_COLORS[o[2]]];
}

const ART_MOTIF: Record<string, ReactNode> = {
  guitar: (
    <g>
      <path d="M11.6 21.4c0-3.1 2.2-5.4 5.1-5.4 1.7 0 3.2.8 4.1 2.1l8.4-8.4 1.9 1.9-8.4 8.4c.3.9.5 1.8.5 2.8 0 3.1-2.3 5.4-5.2 5.4s-6.4-3.7-6.4-6.8z" />
      <rect x="27.4" y="6.2" width="4.6" height="3" rx="1.2" transform="rotate(45 29.7 7.7)" />
    </g>
  ),
  pick: (
    <path d="M20 8.5c5 0 9 4.2 9 9.2 0 5.5-5.1 10-8 12.2-.6.4-1.4.4-2 0-2.9-2.2-8-6.7-8-12.2 0-5 4-9.2 9-9.2z" />
  ),
  star: (
    <path d="M20 7l3.6 7.6 8.4 1-6.2 5.8 1.6 8.3L20 25.8l-7.4 3.9 1.6-8.3L8 15.6l8.4-1z" />
  ),
  note: (
    <g>
      <rect x="21.5" y="7" width="2.4" height="18" rx="1.2" />
      <path d="M23.9 7.4l8.2-2.6v4.4l-8.2 2.6z" />
      <ellipse cx="17.6" cy="25.4" rx="4.6" ry="3.5" transform="rotate(-18 17.6 25.4)" />
    </g>
  ),
  tape: (
    <g>
      <rect x="6" y="14" width="28" height="10" rx="2" />
      <rect x="6" y="16.4" width="28" height="1.4" opacity=".45" />
      <rect x="6" y="20.4" width="28" height="1.4" opacity=".45" />
    </g>
  ),
};

const ART_KEYS = ["guitar", "pick", "star", "note", "tape"];

/* ---------- 立绘场景（大尺寸兜底）：小尺寸的「图案贴纸」撑不起播放页舞台，
   ≥100px 时给一幅完整的氛围场景——bloom + 散落音符（角色的位置留给真封面）。
   音符漂浮只动 transform/opacity；角色已按 2026-11-20 的决定整体退场。 */
const SCENE_INK = "#3D2B39";

/** 大尺寸兜底场景。无角色、无钩子，表格里的小贴纸与这里互不影响。 */
const TrackArtScene = memo(function TrackArtScene({
  id,
  size,
  radius,
  className,
}: {
  id: string;
  size: number;
  radius: number;
  className: string;
}) {
  const h = hashStr(id || "x");
  const bg = artTriple(h);
  const nid = "as" + (h % 9973);
  const fx = [22 + (h % 14), 78 + ((h >>> 4) % 16), 48 + ((h >>> 8) % 22)];
  const fy = [30 + ((h >>> 2) % 10), 20 + ((h >>> 6) % 12), 38 + ((h >>> 9) % 10)];
  return (
    <svg
      className={"trk-art art-scene " + className}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={{ borderRadius: radius }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={nid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bg[0]} />
          <stop offset="58%" stopColor={bg[1]} />
          <stop offset="100%" stopColor={bg[2]} />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill={"url(#" + nid + ")"} />
      <circle cx="60" cy="52" r="40" fill="#fff" opacity=".16" />
      <circle cx="60" cy="50" r="26" fill="#fff" opacity=".32" />
      {fx.map((x, i) => (
        <g
          key={i}
          className={"art-scene__float--" + "abc"[i]}
          transform={"translate(" + x + " " + fy[i] + ") scale(" + (0.3 + (i % 2) * 0.08) + ")"}
          fill={SCENE_INK}
          opacity=".38"
        >
          {ART_MOTIF[i % 2 ? "note" : "star"]}
        </g>
      ))}
      <circle cx="106" cy="16" r="3.2" fill="#fff" opacity=".55" />
      <circle cx="14" cy="98" r="2.2" fill="#fff" opacity=".45" />
    </svg>
  );
});

/** 曲目专属色板（立绘场景的底色三连）：舞台的柔光、队列指示这类「这条歌自己的颜色」都从这里取 */
export function artPaletteOf(id: string): [string, string, string] {
  return artTriple(hashStr(id || "x"));
}

export const TrackArt = memo(function TrackArt({
  id,
  size = 40,
  radius = 6,
  className = "",
}: {
  id: string;
  size?: number;
  radius?: number;
  className?: string;
}) {
  const h = hashStr(id || "x");
  const bg = artTriple(h);
  const gid = "ag" + (h % 9973);
  if (size >= 100) {
    return <TrackArtScene id={id} size={size} radius={radius} className={className} />;
  }
  const a = ART_KEYS[(h >>> 3) % 5];
  const b = ART_KEYS[(h >>> 7) % 5];
  const rot = ((h >> 5) % 40) - 20;
  return (
    <svg
      className={"trk-art " + className}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      style={{ borderRadius: radius }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bg[0]} />
          <stop offset="58%" stopColor={bg[1]} />
          <stop offset="100%" stopColor={bg[2]} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" fill={"url(#" + gid + ")"} />
      <g transform={"translate(20 20) rotate(" + rot + ") scale(.92) translate(-20 -20)"} fill="#3D2B39" opacity=".58">
        {ART_MOTIF[a]}
      </g>
      <g transform="translate(9 26) scale(.34)" fill="#3D2B39" opacity=".34">
        {ART_MOTIF[b]}
      </g>
      <circle cx="33" cy="9" r="3.4" fill="#fff" opacity=".5" />
    </svg>
  );
});
