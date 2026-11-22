/* AFEIFEI 界面静态数据：26 彩蛋、色板、暗号、音源色。
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
  { id: "E18", name: "音量破音" },
  { id: "E19", name: "按住的火" },
  { id: "E20", name: "又迷路了" },
  { id: "E21", name: "不在了" },
  { id: "E22", name: "先不下楼" },
  { id: "E23", name: "副歌现场" },
  { id: "E24", name: "深夜档" },
  { id: "E25", name: "又一遍" },
  { id: "E26", name: "合拍" },
  { id: "E27", name: "回来了" },
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
  E18: "音量拉到 95% 以上，播放条破音抖一下",
  E19: "播放页长按红心 1 秒，火焰燃起并顺手记下",
  E20: "60 秒内连跳 3 首，被温柔地问一句",
  E21: "在线曲目播放失败，「这首歌…已经不在了」",
  E22: "断网瞬间，社恐式撤退提示",
  E23: "副歌进场瞬间，全场应援光 + 各包自己的拟声",
  E24: "22 点到凌晨 2 点启动播放，深夜档问候",
  E25: "同一首歌累计放到第 3 遍，被点破",
  E26: "连着听同一位艺人 5 首",
  E27: "断网恢复的瞬间，从墙角探个头",
};

export const PALETTES = [
  /* swatch 直接取各包 tokens 实值：bg=纸底、sub=纸底次层、band=该包 --gradient-tri（舞台幕布）。
     色卡必须和实际 UI 同色，否则用户选的是色卡、看到的是另一套。 */
  { id: "default", label: "默认 · 奶油粉白", swatch: { bg: "#FFF8F5", sub: "#FFE8EF", band: "linear-gradient(90deg,#FF9EBB,#B8A9E8,#7EC8E3)" }, locked: false, origin: "" },
  { id: "mygo", label: "迷子 · 雨夜", swatch: { bg: "#E9EFF8", sub: "#DDE6F3", band: "linear-gradient(90deg,#6F8FB5,#8E88A8,#B5A8B8)" }, locked: true, origin: "《BanG Dream! It's MyGO!!!!!》（迷途之子！！！！！）" },
  { id: "gbc", label: "无滤镜 · 冷灰", swatch: { bg: "#EDEFF1", sub: "#E0E3E7", band: "linear-gradient(90deg,#FF2D9B,#0E7C92)" }, locked: true, origin: "《GIRLS BAND CRY》（少女乐队的呐喊）" },
  { id: "btr", label: "墙角 · 暖米", swatch: { bg: "#F1EEEA", sub: "#E6E0D7", band: "linear-gradient(90deg,#FFC53D,#E75C8D,#4EA8C9)" }, locked: true, origin: "《ぼっち・ざ・ろっく！》（孤独摇滚！）" },
];

export const SECRET_CODES: Record<string, { palette: string; label: string }> = {
  "迷子": { palette: "mygo", label: "MyGO 雨夜" },
  "迷途之子": { palette: "mygo", label: "MyGO 雨夜" },
  "深夜の練習室": { palette: "gbc", label: "GBC 无滤镜" },
  "哭泣少女乐队": { palette: "gbc", label: "GBC 无滤镜" },
  "アンコール": { palette: "btr", label: "BTR 墙角" },
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
