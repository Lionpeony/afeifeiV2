/* 页面注册表：一级入口 = PageId（v5.6 原型）。
   发现 = 每日推荐 + 榜单 + 搜索；本地 = 曲库；下载独立；喜欢/历史/歌单/档案各一页。 */

export type PageId =
  | "online"
  | "roam"
  | "local"
  | "downloads"
  | "playlists"
  | "mine"
  | "history"
  | "archive"
  | "settings"
  | "stage";

/** 播放页不在导航里：它是 console 正在播放区点开的演出场，按 Esc / 返回键退回上一页。 */
export const PAGE_LABEL: Record<PageId, string> = {
  online: "发现",
  roam: "漫游",
  local: "本地音乐",
  downloads: "下载管理",
  playlists: "歌单",
  mine: "我喜欢的音乐",
  history: "播放历史",
  archive: "演出档案",
  settings: "设置",
  stage: "播放页",
};
