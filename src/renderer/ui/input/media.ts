/**
 * 系统媒体键 / 托盘命令 → 命令注册表 id（A-24 A-25）。
 *
 * 只做**名字映射**：播放语义在 `index.tsx` 的 `registerCommand` 里只有一份，
 * 媒体键、托盘、命令面板、Space 因此走同一条路径 —— 不会出现
 * "面板里能暂停、媒体键暂停不了"这种两套语义。
 */
const MEDIA_COMMAND_IDS: Record<string, string> = {
  toggle: "play-toggle",
  // 关窗收托盘时的"停一下"：不是 toggle（已暂停时再 toggle 反而会播）
  pause: "play-stop",
  next: "queue-next",
  prev: "queue-prev",
  // 全局快捷键的动作名（A-24 可配置那半）：也走这张表，播放语义不多一份
  "play-pause": "play-toggle",
  "volume-up": "volume-up",
  "volume-down": "volume-down",
};

/** 未知命令名一律返回 null（主进程发什么由我们自己定，但白名单比 if-else 链好查）。 */
export function commandIdFor(cmd: string): string | null {
  return Object.prototype.hasOwnProperty.call(MEDIA_COMMAND_IDS, cmd) ? MEDIA_COMMAND_IDS[cmd] : null;
}
