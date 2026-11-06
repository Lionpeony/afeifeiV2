/**
 * 漫游页此刻该拿哪张牌当"当前"（纯决策，不碰 React / store）。
 *
 * 三种来源，优先级不能换：
 * 1. `pending` —— 刚抽到、还没收下。用户点「换一首」后必须立刻看到新牌，
 *    否则播放中抽牌看起来像没反应。
 * 2. `playing` —— 收下之后队列就是这批 FM，牌面跟着正在播的那首走。
 *    不跟的话，播到第 3 首了卡片还停在第 1 抽。
 * 3. `drawn` —— 收下过但当前不在播（去了别处），显示最后抽到的那张。
 */
export type RoamCardSource = "pending" | "playing" | "drawn";

export function cardSource(drawn: { kept: boolean } | undefined, playing: unknown | null): RoamCardSource {
  if (drawn && !drawn.kept) return "pending";
  if (playing) return "playing";
  return "drawn";
}
