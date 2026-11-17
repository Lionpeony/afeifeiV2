/* AFEIFEI 界面静态数据：17 彩蛋、色板、暗号、音源色。
   全部为原创虚构命名；不引用原作台词/曲名。 */

export const EGGS = [
  { id: "E01", name: "吉他滑过" },
  { id: "E02", name: "空白 setlist" },
  { id: "E03", name: "莓果播放键" },
  { id: "E04", name: "要来了" },
  { id: "E05", name: "拨片印记" },
  { id: "E06", name: "划掉一行" },
  { id: "E07", name: "绕路" },
  { id: "E08", name: "幕布" },
  { id: "E09", name: "河边夜灯" },
  { id: "E10", name: "写了又划" },
  { id: "E11", name: "秘密 live" },
  { id: "E12", name: "暗号" },
  { id: "E13", name: "先回去练琴" },
  { id: "E14", name: "在看吗" },
  { id: "E15", name: "安可集章" },
  { id: "E16", name: "分幕" },
  { id: "E17", name: "路过的人" },
];

export const DEMO_INFO: Record<string, string> = {
  E01: "启动时的吉他滑过",
  E02: "收藏为空时的便签",
  E03: "播放 / 暂停，按钮下沉 + 柔光呼吸",
  E04: "长按进度条标记副歌点，走到前 8 秒浮现「要来了♡」",
  E05: "喜欢按钮盖一枚拨片印记",
  E06: "切歌时 setlist 用马克笔划掉上一行",
  E07: "开随机，队列路径变弯曲绕路",
  E08: "展开播放页，粉紫幕布拉开",
  E09: "凌晨 2–4 点的河边夜灯（演示可手动触发）",
  E10: "同一首听 10 遍，歌词本自己写字",
  E11: "连点 Logo 5 次，舞台四件乐器亮灯",
  E12: "搜索框输入暗号解锁限定色板",
  E13: "连续跳 5 首，角落小背影",
  E14: "播放页 90 秒无操作，灯慢慢暗下来",
  E15: "设置页安可集章卡，每发现一枚盖个章",
  E16: "队列超过 12 首，自动按 4 首分幕",
  E17: "播放中偶尔有人抱着琴从页面底下路过",
};

export const PALETTES = [
  { id: "default", label: "默认 · 奶油粉白", dot: "#D63384", locked: false },
  { id: "mygo", label: "迷子 · 蓝紫", dot: "#5E49B8", locked: true },
  { id: "gbc", label: "暖橙 · 河边", dot: "#B7500F", locked: true },
  { id: "btr", label: "粉白 · 强化", dot: "#C2185B", locked: true },
];

export const SECRET_CODES: Record<string, { palette: string; label: string }> = {
  "迷子": { palette: "mygo", label: "MyGO 蓝紫" },
  "深夜の練習室": { palette: "gbc", label: "GBC 暖橙" },
  "アンコール": { palette: "btr", label: "BTR 粉白" },
};

/** 音源色：与 design.md 的 --src-* 一致。 */
export function sourceTone(id: string): string {
  if (id === "netease") return "#C20C0C";
  if (id === "qq") return "#31C27C";
  return "#7B5FC9";
}

export function sourceShort(id: string, fallback?: string): string {
  if (id === "netease") return "网易云";
  if (id === "qq") return "QQ";
  return fallback ?? id;
}
