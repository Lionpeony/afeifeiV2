---
name: Afeifei 阿飞飞
description: 把听歌当成一场有节目单的演出的 Windows 桌面播放器
colors:
  primary: "#233ff2"
  neutral-bg: "#f2f3ef"
  ink: "#16181f"
  ink-dim: "#5d6470"
  raised: "#e9eae4"
  accent-night: "#e8b64c"
  accent-violet: "#ff654f"
typography:
  display:
    fontFamily: "Bahnschrift SemiCondensed, Bahnschrift, Arial Narrow, Segoe UI, sans-serif"
  body:
    fontFamily: "Microsoft YaHei UI, Segoe UI, sans-serif"
    fontSize: "14px"
  mono:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, Courier New, monospace"
    fontSize: "10.5px"
    letterSpacing: "0.16em"
rounded:
  ui: "0px"
  cover: "6px"
spacing:
  gutter: "52px"
  sidebar: "316px"
---

<!-- 从已实现 token 落录（2026-11-05 换装）。实现源：renderer/ui/tokens.css + views/stage/stage*.css + presets.ts；权威设计仍以 docs/00 §9.2 为准。 -->

# Design System: Afeifei 阿飞飞

## Overview

**Creative North Star: "TYPE IS TIME / 歌词即时间"**

播放页不是「封面 + 进度条」，是正在唱的那一句歌词本身：当前真实歌词是这首歌此刻的指针，已唱的墨色可读、正在唱的词成为全屏最大字号与唯一强调色、未唱的退成浅墨但完整保留。所有词与时间全部来自真实的 `LyricDoc.words` 与唯一合成器时钟——没有假打字动画，没有预写死的光效。

系统的性格是「纸面 + 字级」：冷调纸白承托墨黑大字，字号的突变（离散，不做过渡）就是节拍；深度由字重与亮度差承担，颜色里唯一的强调色只标「正在发生」。

**Key Characteristics:**
- 当前词 = 播放指针：`font-size 1.72em / weight 800 / --stage-accent`，其余词墨色与浅墨分级。
- 全站每屏只有一个强调色（预设各异：纸蓝 / 夜金 / 雾青 / 余光珊瑚红），只标正在唱、正在播、主操作。
- 等宽只用于数字、编号、英文小标（LINE 02 / 86 · WORD 04 / 11）；印刷感靠字距不靠字号。
- 诚实状态：无逐字数据 → 行级一次落墨；无歌词 → 「纯音乐 · 这首歌没有歌词」；无 analyser 信号 → 频谱留空。

## Colors

冷调纸白上的一处蓝。夜间/彩纸等四套预设只换场景层 token，语法不变。

### Primary
- **纸蓝 / 电子蓝** (`#233ff2`): 正在唱的词、主操作、当前句注锚、封面取色前的 tint 兜底之外的唯一彩色。
- **夜金** (`#e8b64c`) / **雾青** (`#147a6f`) / **余光珊瑚红** (`#ff654f`): 分别属于深靛唱机 / 极简留白 / 演后余光三套预设，同一时刻在屏上只存在一套。

### Neutral
- **纸白** (`#f2f3ef`): 页面底、正文之外的读者视线归位点。
- **墨黑** (`#16181f`): 标题与已唱正字。
- **浅墨** (`#5d6470` / 34% 墨): 次级信息与未唱词。

### Named Rules
**The One Voice Rule.** 强调色只标「正在发生」。答不出「它在发生什么」的位置，改回墨与纸。

**The Tint Rule.** 封面取色产物 `--stage-tint` 只进 Wallpaper/频谱层，未取到色时回落 `transparent`，不许回落成强调色。

## Typography

**Display:** Bahnschrift SemiCondensed（窄体大写做票根感） / **Body:** Microsoft YaHei UI / **Mono:** Cascadia Mono。

### Hierarchy
- **当前词** (1.72em × 英雄字号 `clamp(30px–44px)`，weight 800): L-d 主视觉，也是唯一的字号突跳点。
- **整句（行级 press）** (`clamp(34px–56px)`, weight 600): 无词时间时的 hero 层级。
- **极简单行** (`46px`, weight 700): minimal 渲染器当前句。
- **剧场三行** (27/19/20px): theatrical 渲染器 当前句 + 前后句字幕。
- **行内注锚** (14px): `.st-trans` 翻译行，2px × 12px accent 短竖锚。
- **标签 / 编号** (10.5px mono 0.14–0.18em): 时间码、词号 LINE/WORD、队列位次。

### Named Rules
**The Mono-For-Numbers Rule.** 等宽只用于数字、编号、英文小标；中文正文用等宽即违规。

**The Jump Rule.** 词号切换是离散事件，字号/字重切变不经过 CSS transition（§9.4 只允许 transform/opacity/clip-path/filter 动效）；只有颜色允许 0.18s 缓动。

## Layout

- 版心三段：页头（曲目与源身份 + QUEUE 位次 + 视图/沉浸入口）→ 中文本地歌词区 + 右栏真实队列（滚动、真实播放序、可播可移、无封面占位盘）→ 底部台词本 3×4（点行跳句）。播放/进度/EQ 由底部全局 console 承担，播放页不复制控制。
- 词法行横向流动排布（不锁格）；中文均分单字英文逐词；标点收小一档不裁字。
- 窄窗 (≤1180px)：侧栏收到 250px，台词本降 2 列，字号同步收。
- immersive（Esc 进入）：不动路由与 store，z=60；三栏 封套相纸 / 大盘 / 词+队列；≥900px 才给正文，窄窗只留提示行。

## Elevation & Depth

**日常无阴影。** 深度由字号阶梯与字重差承担；只有浮层（视图设置 .st-menu）与 immersive 封面允许双层投影。浮层底色为场景 97% 排墨（不从全局 glass token 读），夜间不串味。

## Shapes

UI 零圆角（按钮、面板、标签都是直角）；圆仅属于封面/轮播盘（cover radius 6px，histogram worst-case 仍直角）。分隔统一 1px；量级`=0` 处不加多余装饰线。

## Components

### Buttons (st-kb)
- **Shape:** 文字流排；`.dot` 标点 0.72em；词宽随内容不裁字。
- **Current (`.now`):** accent 色 + 1.72em + weight 800。
- **Sung (`.lit`):** 墨色 100%。
- **Future:** 34% 墨；hover 提到 58%。

### Queue Rows (st-nx)
- 高 42px，靠底部 mono 位次 + 相纸小图 + 标题省略 + 操作浮起（hover/focus-within 才显形）。

### 点行跳句 (st-srow)
- 3×4 网格；当前句 accent 加粗；点击 seek 到该行 startMs。

### 台词本 / 相纸封面 (st-script / st-photo)
- 相纸带 `SIDE A · NN` 黑章 + 说明行（标题 / 时长）；无封面回退"刻纹占位 + 虚线框"，不编图。

## Do's and Don'ts

### Do:
- **Do** 让当前真实词占据全屏最大字号、全部识别信息与「正在发生」的强调色一起出现在 hero 层。
- **Do** 让 station/immersive 的权限边界清晰：沉浸态是覆盖层，Esc 退出；normal 全部走全局 console 控制。
- **Do** 在中性底上保持 ≥4.5:1 正文对比（34% 浅墨只用于非关键信息）。

### Don't:
- **Don't** 画预计算或伪造的逐字高亮；没有 `LyricDoc.words` 和逐字时间就回落行级，不假装。
- **Don't** 用第二个强调色，或让强调色出现在「没有在发生任何事」的位置。
- **Don't** 给正文加过渡字号动画——词号切换是离散状态，不是动效。
- **Don't** 用粒子、shader 歌词、彩色热力图盖住 hero 层。
