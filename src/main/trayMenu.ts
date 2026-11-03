/**
 * 托盘菜单的**内容**（纯函数，可测）。主进程只负责把这张表变成 Electron Menu，
 * 不做"在播什么/能不能点"的判断 —— 那是渲染层推上来的状态（A-25）。
 */

export interface TrayState {
  playing: boolean;
  /** 当前曲目标题；没有在播就是 null */
  title: string | null;
}

export type TrayItemId = "toggle" | "prev" | "next" | "show" | "quit";

export interface TrayItem {
  id: TrayItemId | "sep" | "head";
  label: string;
  enabled: boolean;
}

/** 菜单首行是状态播报，太长会被 Windows 菜单拉宽到难看，统一截断。 */
const HEAD_MAX = 28;

export function trayTitle(state: TrayState): string {
  if (!state.title) return "阿飞飞 · 未在播放";
  const t = state.title.length > HEAD_MAX ? `${state.title.slice(0, HEAD_MAX - 1)}…` : state.title;
  return `${state.playing ? "正在播放" : "已暂停"}：${t}`;
}

export function trayItems(state: TrayState): TrayItem[] {
  const hasTrack = state.title !== null;
  return [
    { id: "head", label: trayTitle(state), enabled: false },
    { id: "sep", label: "", enabled: false },
    // 没有曲目时播放/切歌都是空操作，置灰比点了没反应诚实
    { id: "toggle", label: state.playing ? "暂停" : "播放", enabled: hasTrack },
    { id: "prev", label: "上一首", enabled: hasTrack },
    { id: "next", label: "下一首", enabled: hasTrack },
    { id: "sep", label: "", enabled: false },
    { id: "show", label: "显示主窗口", enabled: true },
    { id: "sep", label: "", enabled: false },
    { id: "quit", label: "退出", enabled: true },
  ];
}
