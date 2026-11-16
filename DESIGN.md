---
name: Afeifei 阿飞飞
description: 把听歌当成一场有节目单的演出的 Windows 桌面播放器
colors:
  bg: "#0b0c0d"
  surface: "#151819"
  surface-2: "#1a1e1f"
  text: "#f4f1ea"
  muted: "#a2a5a2"
  muted-2: "#8a8f8b"
  accent: "#ff5a36"
  accent-ink: "#170b07"
typography:
  display:
    fontFamily: "Instrument Serif, Noto Serif SC, Songti SC, Georgia, serif"
  body:
    fontFamily: "Manrope, Microsoft YaHei UI, Segoe UI, sans-serif"
    fontSize: "14px"
  mono:
    fontFamily: "Cascadia Mono, Consolas, ui-monospace, monospace"
    fontSize: "10px"
    letterSpacing: "0.14em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  gutter: "24px"
  sidebar: "232px"
  topbar: "68px"
  console: "104px"
---

<!-- 2026-11-16 整站换装：设计源 = `这是我的音乐播放器在线页的样子/index.html`。
     色值唯一来源是 renderer/ui/tokens.css；本文件是同一套体系的说明稿。 -->

# Design System: Afeifei 阿飞飞

## Overview

**Creative North Star: "TYPE IS TIME / 歌词即时间"**

播放页的核心不变：正在唱的那一句就是指针。但整站的视觉语言在 2026-11-16 换代——
从「冷调纸面」换成**OLED 深底上的一处橙红**：深色承载内容，衬线承担情绪，
等宽承担数字与标签，圆角与胶囊让它像一件消费级产品而不是印刷品。

**Key Characteristics:**
- 全站只有一套深色配色；不再有明暗/旧档切换（配色包仍可导入覆盖结构层）。
- 每屏只有一个强调色 `#ff5a36`：主操作、正在播放、选中态。
- 三层字体：Instrument Serif / Noto Serif SC 做标题与日期；Manrope 做正文；
  等宽只用于数字、编号、英文小标。
- 圆角是默认：卡片 6–14px，按钮与分段是胶囊。
- 诚实状态：无数据就写无数据；未登录就说未登录；不编榜单元信息。

## Colors

深色是底，橙红是唯一声音。

### Primary
- **橙红** (`#ff5a36`): 主操作、正在播放、选中、进度头。
- **橙红上的字** (`#170b07`): 填充按钮与高亮块上的文字（对比 6.3:1）。
- **hover 档** (`#ff7050`): 主按钮悬停。

### Neutral
- **OLED 底** (`#0b0c0d`): 窗口与页面底。
- **面板** (`#151819`) / **次级面板** (`#1a1e1f`): 卡片、弹层、选中行。
- **暖白** (`#f4f1ea`): 标题与正文主色（不是纯白，避免刺眼）。
- **次级灰** (`#a2a5a2`) / **小标灰** (`#8a8f8b`): 说明文字、等宽小标。

### Named Rules
**The One Voice Rule.** 强调色只标「正在发生 / 可点的主操作」。答不出它在发生什么，改回暖白与灰。

**The Surface Ladder Rule.** 底 < 面板 < 次级面板，三层以内；层次靠亮度和 1px 发丝线，不靠投影堆叠。

## Typography

**Display:** Instrument Serif（拉丁）+ Noto Serif SC（中文），本地打包；**Body:** Manrope；
**Mono:** Cascadia Mono / Consolas。

### Hierarchy
- **页标题** (`clamp(36px–56px)`, weight 500, 衬线): 每页一个，配合上方 mono 小标。
- **区块标题** (30px 衬线 / 21px): 榜单、最近播放等段落。
- **正文/列表** (13.5px, 500): 曲名；艺人 11.5px、次级灰。
- **小标 / 数字** (10px mono, 0.14–0.2em): eyebrow、计数、时长、编号。

### Named Rules
**The Mono-For-Numbers Rule.** 等宽只用于数字、编号、英文小标；中文正文不用等宽。

## Layout

```
┌────────────────────────────── topbar 68px ─────────────────────────────┐
│ 品牌           顶栏搜索（全站唯一入口）                        账号      │
├─ sidebar 232px ─┬──────────────────────────── content ─────────────────┤
│ Browse          │  page-head：eyebrow + 衬线大标题 + 右侧计数          │
│ Library         │  内容区（页面自行滚动）                              │
│ System          │                                                      │
│ 账号摘要        │                                                      │
├─────────────────┴──────────────── console 104px ───────────────────────┤
│ 正在播放 · 心 │ 上一首 / 播放 / 下一首 + 进度 │ 模式 / 音量 / 队列 / 更多 │
└────────────────────────────────────────────────────────────────────────┘
```

- 窄窗（<1180px）：侧栏收成 76px 图标条，品牌文字与分组标签隐藏。
- 页面切换动画 300ms，`prefers-reduced-motion` 下关闭。

## Playback Stage

播放页恒暗且与结构层解耦（A-10）：4 套预设（深墨剧场 / 深靛唱机 / 极简暗夜 / 演后余光）
只改 20 个 `--stage-*` 场景 token；4 套版式皮肤（Sleeve / Turntable / Proof / Prism）只改结构。
默认深色档，橙红只标正在唱。
