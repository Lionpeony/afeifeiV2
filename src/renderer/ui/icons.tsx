/* 导航图标（ref pages-v11/shell.css）：16×16 描边路径，1.2 描边、圆头圆角。
   图标只活在这里，页面拿名字引用——免得每个页面各抄一遍 path。 */
import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "online"
  | "charts"
  | "radio"
  | "roam"
  | "local"
  | "downloads"
  | "liked"
  | "recent"
  | "playlists"
  | "stats"
  | "settings"
  | "refresh"
  | "search"
  | "order"
  | "repeat"
  | "repeat-one"
  | "shuffle"
  | "volume"
  | "mute"
  | "sleep"
  | "rate"
  | "queue"
  | "eq"
  | "lyrics"
  | "mini";

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M2.6 7.6 8 2.8l5.4 4.8" />
      <path d="M4.2 7.2V13h7.6V7.2" />
    </>
  ),
  online: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <ellipse cx="8" cy="8" rx="2.4" ry="5.4" />
      <path d="M2.8 8h10.4" />
    </>
  ),
  charts: (
    <>
      <path d="M3 13V8.5M8 13V3.2M13 13V6.4" />
      <path d="M1.6 13h12.8" />
    </>
  ),
  radio: (
    <>
      <path d="M4.5 5 11 2.6" />
      <rect x="2" y="5" width="12" height="8" rx="1" />
      <circle cx="6" cy="9" r="1.8" />
      <path d="M10.5 7.5h2M10.5 10.5h2" />
    </>
  ),
  roam: (
    <>
      <path d="M2.5 4.5h2.4c3.1 0 3.6 7 6.7 7h1.9" />
      <path d="M2.5 11.5h2.4c1.3 0 2.2-1.1 3-2.4" />
      <path d="M10.4 6.8c.8-1.3 1.6-2.3 2.9-2.3" />
      <path d="M11.4 2.4l2.2 2.1-2.2 2.1M11.4 9.4l2.2 2.1-2.2 2.1" />
    </>
  ),
  local: <path d="M2 12.5V4h4.2l1.3 1.6H14v6.9z" />,
  downloads: (
    <>
      <path d="M8 2.5v6.8" />
      <path d="M5.2 6.8 8 9.6l2.8-2.8" />
      <path d="M2.5 11v2.5h11V11" />
    </>
  ),
  liked: (
    <path d="M8 13C4.8 10.8 2.9 8.9 2.9 6.7c0-1.6 1.2-2.8 2.7-2.8 1 0 1.9.5 2.4 1.4.5-.9 1.4-1.4 2.4-1.4 1.5 0 2.7 1.2 2.7 2.8 0 2.2-1.9 4.1-5.1 6.3z" />
  ),
  recent: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <path d="M8 5.2v3l2.1 1.2" />
    </>
  ),
  playlists: (
    <>
      <path d="M2.5 3.8h8M2.5 7.2h8M2.5 10.6h5" />
      <path d="M11 8.4 14 10.3 11 12.2Z" />
    </>
  ),
  stats: (
    <>
      <path d="M2.5 13.5h11" />
      <path d="M4 13.5V9M7 13.5V5M10 13.5V7.5M13 13.5V3.5" />
    </>
  ),
  settings: (
    <>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
      <circle cx="6" cy="4.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  refresh: (
    <>
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M13.2 2.6v3.2H10" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.4 10.4 14 14" />
    </>
  ),
  /* —— 控制台工具排（Console.tsx）：同一支描边笔 —— */
  order: (
    <>
      <path d="M2.5 4h8M2.5 7.4h6M2.5 10.8h4" />
      <path d="M11.4 7v6M11.4 13l2-2M11.4 13l-2-2" />
    </>
  ),
  repeat: (
    <>
      <path d="M4.6 3.4H11a2.6 2.6 0 0 1 2.6 2.6v1.6" />
      <path d="M13.6 5.6 11.9 3.5M13.6 5.6l-2.2 1.6" transform="translate(0.3 0.2)" />
      <path d="M11.4 12.6H5a2.6 2.6 0 0 1-2.6-2.6V8.4" />
      <path d="M2.4 10.4l1.7 2.1M2.4 10.4l2.2-1.6" transform="translate(-0.3 -0.2)" />
    </>
  ),
  "repeat-one": (
    <>
      <path d="M4.6 3.4H11a2.6 2.6 0 0 1 2.6 2.6v1.6" />
      <path d="M11.4 12.6H5a2.6 2.6 0 0 1-2.6-2.6V8.4" />
      <path d="M13.7 5.4l-2 1.6M13.7 5.4l-2.2-1.4" />
      <path d="M2.3 10.6l2 1.6M2.3 10.6l2.2 1.4" transform="translate(0 -0.6)" />
      <path d="M8 6.6v2.8M7 7.3l1-0.7" strokeWidth="1" />
    </>
  ),
  shuffle: (
    <>
      <path d="M2.6 4h2.6c3.4 0 3.8 8 7.2 8h1.4" />
      <path d="M2.6 12h2.6c1.4 0 2.4-1.2 3.2-2.6" />
      <path d="M10.6 5.4c.8-1.4 1.6-2.4 3.2-2.4" transform="translate(0 1)" />
      <path d="M11.6 1.6l2.3 2.4-2.3 2.2" transform="translate(0 1)" />
      <path d="M11.6 9.6l2.3 2.4-2.3 2.2" transform="translate(0 -1)" />
    </>
  ),
  volume: (
    <>
      <path d="M2.6 6.2v3.6h2.4L8.6 12V4L5 6.2z" />
      <path d="M10.8 5.8a3.1 3.1 0 0 1 0 4.4" />
      <path d="M12.6 4.2a5.4 5.4 0 0 1 0 7.6" />
    </>
  ),
  mute: (
    <>
      <path d="M2.6 6.2v3.6h2.4L8.6 12V4L5 6.2z" />
      <path d="M10.8 6.4l3.6 3.2M14.4 6.4l-3.6 3.2" />
    </>
  ),
  sleep: (
    <>
      <path d="M13.2 9.8A5.4 5.4 0 1 1 6.6 3a4.4 4.4 0 0 0 6.6 6.8z" />
      <path d="M10.4 2h2.8l-2.8 2.6h2.8" strokeWidth="1" />
    </>
  ),
  rate: (
    <>
      <path d="M8 13.4a5.4 5.4 0 1 1 5.4-5.4" />
      <path d="M8 8l3.4-2.6" />
      <path d="M11 11.4h3.4M12.7 9.7v3.4" strokeWidth="1" />
    </>
  ),
  queue: (
    <>
      <path d="M2.5 4h11M2.5 7.4h11M2.5 10.8h6.5" />
      <path d="M11.2 9.2 14.2 11 11.2 12.8Z" />
    </>
  ),
  eq: (
    <>
      <path d="M4 2.5v11M8 2.5v11M12 2.5v11" />
      <path d="M2.8 6.2h2.4M6.8 10h2.4M10.8 4.6h2.4" strokeWidth="1.8" />
    </>
  ),
  lyrics: (
    <>
      <path d="M2.6 3.6h10.8v7.2H6.4L3.4 13.4V3.6z" />
      <path d="M5.4 6.2h5.2M5.4 8.4h3.4" strokeWidth="1" />
    </>
  ),
  mini: (
    <>
      <path d="M11.2 3h1.2A1.2 1.2 0 0 1 13.6 4.2v2.6" />
      <path d="M2.2 4.2A1.2 1.2 0 0 1 3.4 3H8" />
      <path d="M2.2 4.2v6.4a1.2 1.2 0 0 0 1.2 1.2H7" />
      <rect x="8.6" y="8.4" width="5.2" height="4.2" rx="0.9" />
    </>
  ),
};

export function NavIcon({ name }: { name: IconName }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
