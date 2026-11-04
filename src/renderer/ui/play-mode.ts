/**
 * 播放模式（顺序 / 列表循环 / 单曲循环 / 随机）——A-18。
 *
 * 语义与切换档位抄 lx-music-desktop：
 *   `src\common\types\app_setting.d.ts:94` 的 `'player.togglePlayMethod'`
 *   （listLoop / random / list / singleLoop / none）与
 *   `src\lang\zh-cn.json:234-238` 的文案（顺序播放 / 列表循环播放 / 列表随机播放 / 单曲循环播放）。
 * 差异：lx 还有一档「禁用歌曲切换」，本项目不做（停播不是播放器的必需档，order 到队尾即停）。
 *
 * **kernel 的语义本来就有**（`kernel/queue.ts`：shuffle 是投影、repeat-one 整曲重播、
 * 3s 规则），这里只补 UI 需要的档位顺序与文案 —— 不在 UI 里重算一遍语义。
 */
import type { PlayMode } from "../../contracts/index.js";

/** 切换顺序：顺序播放 → 列表循环 → 单曲循环 → 随机播放 → 回顺序播放。 */
export const PLAY_MODES: PlayMode[] = ["order", "repeat-all", "repeat-one", "shuffle"];

/** 档位文案（抄 lx 的 zh-cn 文案，缩到按钮能放下的长度）。 */
export const PLAY_MODE_LABEL: Record<PlayMode, string> = {
  order: "顺序播放",
  "repeat-all": "列表循环",
  "repeat-one": "单曲循环",
  shuffle: "随机播放",
};

/** 页脚工具按钮上的短文案（两个字，跟「音量/睡眠/词/迷你/音效」同一排的密度）。 */
export const PLAY_MODE_SHORT: Record<PlayMode, string> = {
  order: "顺序",
  "repeat-all": "循环",
  "repeat-one": "单曲",
  shuffle: "随机",
};

export function nextPlayMode(mode: PlayMode): PlayMode {
  const i = PLAY_MODES.indexOf(mode);
  return PLAY_MODES[(i + 1 + PLAY_MODES.length) % PLAY_MODES.length];
}
