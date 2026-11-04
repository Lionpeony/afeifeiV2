---
version: 1
slug: "src-renderer-ui-views-stage-index-tsx"
primary_target: "src/renderer/ui/views/stage/index.tsx"
related_targets: []
---

## Direction contract

**THESIS.** 播放页不是「封面 + 控件」，而是歌词本身成为播放进度：正在唱的真实字/词是这首歌此刻的指针。拒绝把当前歌词缩成普通字幕，或用不对应真实时间的打字动画装成同步。

**OWN-WORLD.** 冷调纸白与墨黑承托大字；电子蓝标正在唱的词，酸橙色只标歌词时钟的当前位置。无装饰图案；节奏来自大字与小号正文、当前/已唱/未唱的字重差、以及真实 analyser 的低位细谱线。播放页控件仍由全局 console 提供。

**STORY.** 用户先认出歌名与艺人，再在大字中直接读到当前歌词位置：已唱内容保持墨色可读，当前词成为大字号视觉焦点，后续词降为轻字重而不消失。队列按真实播放序呈现并可操作。跳句继续走同一 seek 路径。

**FIRST VIEWPORT.** 顶端用一行状态标识曲名/艺人/来源和队列位置；主区以当前歌词为主角，前后歌词保留上下文，右侧为可滚动实际队列；低位细谱线只由 analyser 供数；播放、暂停、seek、EQ 和音量沿用全局 console，不重复摆放。

**FORM.** 用户选择 Type Is Time · 歌词即时间（首轮更大胆方向中的 `variable-font-specimen`，结合真实 karaoke clock）；`seed:2b0c9e715725b0c4`。

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
