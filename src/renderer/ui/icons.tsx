/* 导航图标（ref pages-v11/shell.css）：16×16 描边路径，1.2 描边、圆头圆角。
   图标只活在这里，页面拿名字引用——免得每个页面各抄一遍 path。 */
import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "online"
  | "radio"
  | "roam"
  | "local"
  | "downloads"
  | "liked"
  | "recent"
  | "settings";

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
  settings: (
    <>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
      <circle cx="6" cy="4.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
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
