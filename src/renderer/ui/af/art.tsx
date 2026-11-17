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

const ART_BG = [
  ["#FFE3EC", "#FFC2D6", "#D9CDF6"],
  ["#E6F0FF", "#C9DDF7", "#BFE8E0"],
  ["#FFF3D6", "#FFD9A8", "#F7C7D8"],
  ["#EBE3FF", "#CDBFF2", "#FFD3E2"],
  ["#E2F6EF", "#BFE9DB", "#CFE0FA"],
];

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
  const bg = ART_BG[h % ART_BG.length];
  const gid = "ag" + (h % 9973);
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
