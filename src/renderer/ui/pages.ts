/* 页面注册表：一级入口 = PageId。
   并页（2026-11-13）：发现 = 在线 + 榜单（页内切），本地 = 曲库 + 下载 + 电台，
   我的 = 喜欢 + 最近 + 统计（页内切）。加页只改这里 + 宿主 switch。 */

export type PageId = "online" | "roam" | "local" | "playlists" | "mine" | "settings" | "stage";

/** 播放页不在导航里：它是 console 正在播放区点开的演出场，按 Esc / 返回键退回上一页。 */
export const PAGE_LABEL: Record<PageId, string> = {
  online: "发现",
  roam: "漫游",
  local: "本地",
  playlists: "歌单",
  mine: "我的",
  settings: "设置",
  stage: "播放页",
};
