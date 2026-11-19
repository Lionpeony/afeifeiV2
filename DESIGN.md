---
name: Afeifei 阿飞飞
description: 把听歌当成一场有节目单的演出的 Windows 桌面播放器
colors:
  bg: "#FFF8F5"
  surface: "#FFE8EF"
  card: "#FFFFFF"
  text: "#3D2B39"
  muted: "#6B5A68"
  brand: "#FF6B9D"
  accent: "#D63384"
  accent-press: "#B7286C"
  dark-bg: "#2A2438"
  dark-surface: "#352E48"
  dark-card: "#3D3554"
typography:
  display:
    fontFamily: "ZCOOL XiaoWei, Yozai, PingFang SC, Microsoft YaHei, sans-serif"
  body:
    fontFamily: "PingFang SC, Source Han Sans SC, Microsoft YaHei, Noto Sans SC, sans-serif"
    fontSize: "14px"
  hand:
    fontFamily: "ZCOOL KuaiLe, Long Cang, cursive"
  mono:
    fontFamily: "JetBrains Mono, Cascadia Mono, Consolas, monospace"
rounded:
  card: "16px"
  button: "999px"
  cover: "4px"
spacing:
  base: "8px"
  gap: "16px"
  block: "24px"
  section: "32px"
  sidebar: "200px"
  topbar: "60px"
  console: "72px"
---

<!-- 2026-11-16 v4.2：设计源 = `AFEIFEI 设计系统规范 design.md`。
     色值唯一来源是 renderer/ui/tokens.css；本文件是同一套体系的说明稿。
     与旧稿（OLED 深底 + 橙红）冲突处，以本文件与 tokens.css 为准。 -->

# Design System: Afeifei 阿飞飞

## Overview

**Creative North Star: 「排练室」——把听歌当成一场有节目单的演出。**

默认是奶油粉白的排练室：纸、胶带、拨片、手写便签；熄灯后是深紫的演出后场。
播放页仍然是「歌词即时间」（TYPE IS TIME）：正在唱的那一句就是指针。

**Key Characteristics:**
- 亮色「排练室」为默认，暗色「熄灯」为第二档，第三档跟随系统；背景分 base / sub / card 三层。
- **品牌色与交互色分离**：`#FF6B9D` 只做装饰（胶带 / 贴纸 / 柔光 / 渐变），
  任何文字与图标交互面用 `#D63384`（白字 4.50:1），按下用 `#B7286C`。
- 三套字体：ZCOOL XiaoWei 做标题与日期，正文走系统中文黑体，ZCOOL KuaiLe 只做手写批注；
  数字、编号、时长统一 JetBrains Mono 与 tabular-nums。
- 六层字阶是唯一字号来源；间距 8/16/24/32；圆角卡片 16、按钮胶囊、封面 4。
- 动效只用 transform / opacity / filter；同屏最多一个吸睛动画，循环动画不可见时暂停。
- 诚实状态：无数据就写无数据；未登录就说未登录；不编榜单元信息。

## Colors

奶油是纸，莓粉是印。

### Brand vs Interactive（硬规则）
- **品牌粉** (`#FF6B9D`): 胶带、贴纸、柔光、渐变、装饰图形。**禁止**承载文字或交互面。
  它对白字只有 2.68:1。
- **交互粉** (`#D63384`): 主按钮、链接、选中、焦点。白字 4.50:1。
- **按下** (`#B7286C`): active / 按下，白字 5.94:1；**hover** (`#C72D78`) 加深不提亮。
- **暗色按钮**：`#E06A9E` 实心 + 白字不达标，所以熄灯下用「卡片底 + 1px pink-400 描边 + 主文字」的描边按钮；
  `--on-accent` 在暗色下不是白色。

### Neutrals
- **排练室底** (`#FFF8F5`) / **洗底** (`#FFE8EF`) / **卡片** (`#FFFFFF`)。
- **正文** (`#3D2B39`) / **次级** (`#6B5A68`)：白底对比约 12.5:1 / 6.4:1。
- **熄灯底** (`#2A2438`) / **次级面板** (`#352E48`) / **卡片** (`#3D3554`)；
  正文 `#F4EAF2`、次级 `#B8ABC7`（对底 ≥ 4.5:1）。

### Named Rules
**The One Mark Rule.** 一屏只有一处莓粉在「盖章」：主操作、正在播放、选中态。答不出它在标记什么，就退回墨色。

**The 400 Never Speaks Rule.** `--brand-pink-400` 永远不写字、不做按钮底。lint / 评审看到就退回 `--brand-pink-600`。

## Typography

**Display:** ZCOOL XiaoWei（拉丁回落到 Yozai / PingFang SC）；**Body:** PingFang SC / Source Han Sans SC / 微软雅黑；
**Hand:** ZCOOL KuaiLe（仅拟声词、便签、批注、印章，≤16px）；**Mono:** JetBrains Mono。

### 字体角色（2026-11-19 收口）
一屏最多四套字，且各有唯一职责；装饰性英文标签不再用等宽。

- **display**：页面标题、品牌、大日期、播放页歌名。只有 400 字重，禁止合成加粗。
- **body**：一切可读文字——导航、正文、歌词、按钮、空态、分组名。眉标也用正文 + 字距，不用等宽。
- **hand**：每屏至多一处批注——侧栏便签、印章、彩蛋、Toast。
- **mono**：只给数字、时间、编号、kbd、代码、诊断台。
- **侧栏**：品牌 display 15/400，导航 body 13.5/500，计数 body tabular-nums，便签 hand；一列只有三套字。
- `fonts.css`（Instrument Serif / Manrope / Noto Serif SC）已不参与构建，构建只拼 `fonts-v42.css`。

### Hierarchy（六层，唯一字号来源）
- **Display** (28/36, 400): 页面标题、播放页歌名。
- **Title** (20/28, 600): 区块标题、弹层标题。
- **Heading** (16/24, 600): 卡片标题、列表组头。
- **Body** (14/22, 400): 正文、曲名、按钮。
- **Caption** (12/18, 400): 艺人、说明、次级信息。
- **Micro** (11/16, 500): 计数、标签、eyebrow。

**光学档（2026-11-19）**：密集界面允许 10 / 13 / 15 / 18 / 22 / 26 这几档做视觉微调，
展示层允许 30 / 36 / 44 / 128；除此之外不再新增字号。小数（8.5 / 9.5 / 10.5 / 11.5 / 12.5 / 13.5）
与 17 / 19 / 21 / 23 / 25 / 27 / 32 / 34 / 38 已归并，af 层 163 处字号收敛到 15 档。

### Named Rules
**The Mono-For-Numbers Rule.** 时长、索引、计数一律 tabular-nums；中文正文不用等宽。
**The One Hand Rule.** 手写体是批注，不是第二套正文：每个视图最多一处。

## Layout

```
┌────────────────────────────── topbar 60px ─────────────────────────────┐
│ 品牌           顶栏搜索（全站唯一入口）                        账号      │
├─ sidebar 200px ─┬──────────────────── content ────────────────────────┤
│ 发现 / 歌单      │  page-head + 内容区（页面自行滚动）                  │
│ 我的 / 本地      │                                                      │
│ 设置            │                                                      │
├─────────────────┴──────────────── console 72px ────────────────────────┤
│ 正在播放 · 心 │ 上一首 / 播放 / 下一首 + 双层进度 │ 模式 / 音量 / 队列 / 更多 │
└────────────────────────────────────────────────────────────────────────┘
```

- 桌面优先 ≥1280；768–1280 收窄列；≤768 只保证不横向溢出（移动不是目标）。
- 窄窗侧栏收成图标条，品牌文字与分组标签隐藏。
- 页面切换与浮层动效见下节；`prefers-reduced-motion` 全局降到 ≤150ms 纯 opacity。

## Motion

三条曲线、五级时长：

- `--ease-out-soft` 进入/退出、`--ease-spring` 按压回弹、`--ease-curtain` 幕布。
- `--dur-tap` 120ms / `--dur-fast` 220ms / `--dur-base` 380ms / `--dur-curtain` 500ms / `--dur-ambient` 2000ms。
- 只动 transform / opacity / filter；列表入场只前 6 项 stagger；单屏吸睛动画 ≤1，循环动画 ≤2 且不可见时暂停。
- 动效档位：完整 / 轻动效（去掉循环）/ 关闭 / 跟随系统；关闭与系统减少动效都是 ≤150ms、只保留 opacity。

## Components

五态：默认 / hover / active / focus-visible / disabled。

- **按钮**：胶囊；主按钮实心交互粉，次按钮发丝描边；focus-visible 统一 3px 莓粉环。
- **播放键**：按下回弹（spring），不拖长进度条时钟。
- **双层进度条**：粉进度 + 12% 暖黄缓冲；时间 tabular-nums。
- **卡片**：16px 圆角、1px 发丝线；封面 4px 圆角。
- **行**：桌面行高 48，紧凑 40；hover 用洗底，不改变字色。
- **Toast / Dialog / Panel / 菜单**：同一套表面、发丝线与两档阴影，不用第三档。

## Accessibility

- 正文 ≥4.5:1，大字与图形 ≥3:1；焦点环不靠颜色单独表意。
- `/` 聚焦搜索，Esc 关浮层；所有行菜单可键盘到达。
- 动画只走合成属性；减少动效下不丢状态，只丢运动。

## Playback Stage

播放页与结构层解耦（A-10）：四套场景预设只改 `--stage-*`，四套版式皮肤只改结构。
迁移顺序上，场景层在阶段 6 才接入 v4.2；在那之前保持既有深色默认值，避免全局换主题把播放页一起翻白。

## Implementation Status（2026-11-17）

- **已落地**：视觉层切到原型同一套 `af/*` CSS（shell/pages/player/eggs/account/studio/lyrics/splash/v4/polish，与原型逐字节一致；
  `base.css` 换 v4.2 tokens，`compat.css` 服务旧弹层）。侧栏、顶栏、发现、漫游、本地、下载、喜欢、历史、档案、歌单、设置、
  播放页、底栏、媒体浮窗、排练室、快捷键、歌单编辑器、扫码登录、彩蛋层都已按原型重写。
  底栏 seek 用原型轨道 + 透明 range（真实拖拽/键盘），导入条、榜单卡带 token 渐变、发现页“今日再听/真实历史传单墙”已收口。
- **待收口**：队列面板暂时保留为原型外的扩展（原型队列在播放页，但旧面板承担清空二次确认/失败标记）；
  `CommandPalette` / `FindLyric` 已补 `.palette` 样式，但仍是原型外入口；17 个彩蛋的真实触发已对齐，只有 E15 等少数仍只走集章/演示入口。
- 旧 `@layer legacy` / v42 覆盖层已从构建移除；新增代码只读 v4.2 token + `af/*`。
