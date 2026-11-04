/* 页面注册表（ref pages-v11）：把导航项和视图的对应关系集中到一处。
   之前 tab 是 index.tsx 里的联合类型 + 三元链，每加一页要改三处；
   现在加页只往 NAV 里加一行，缺视图会落到"施工中"占位而不是白屏。 */
import type { IconName } from "./icons.js";

export type PageId =
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
  | "stage";

export interface NavItem {
  id: PageId;
  label: string;
  icon: IconName;
  /** 「我的」分组里的小项：42px 高、图标缩到 11px */
  small?: boolean;
}

/** 主导航：顺序即设计稿顺序，图标在上文字在下。 */
export const NAV_MAIN: NavItem[] = [
  { id: "home", label: "首页", icon: "home" },
  { id: "online", label: "在线", icon: "online" },
  { id: "charts", label: "榜单", icon: "charts" },
  { id: "radio", label: "电台", icon: "radio" },
  { id: "roam", label: "漫游", icon: "roam" },
  { id: "local", label: "本地", icon: "local" },
  { id: "downloads", label: "下载", icon: "downloads" },
];

/** 我的：登录账号数据，两侧装饰线隔开。 */
export const NAV_MINE: NavItem[] = [
  { id: "playlists", label: "歌单", icon: "playlists", small: true },
  { id: "liked", label: "喜欢的音乐", icon: "liked", small: true },
  { id: "recent", label: "最近播放", icon: "recent", small: true },
  { id: "stats", label: "听歌报告", icon: "stats", small: true },
];

export const NAV_FOOT: NavItem[] = [{ id: "settings", label: "设置", icon: "settings", small: true }];

/** 播放页不在导航里：它是 console 正在播放区点开的演出场，按 Esc / 返回键退回上一页。 */
export const PAGE_LABEL: Record<PageId, string> = {
  home: "首页",
  online: "在线",
  charts: "榜单",
  radio: "电台",
  roam: "漫游",
  local: "本地",
  downloads: "下载",
  liked: "喜欢的音乐",
  recent: "最近播放",
  playlists: "歌单",
  stats: "听歌报告",
  settings: "设置",
  stage: "播放页",
};
