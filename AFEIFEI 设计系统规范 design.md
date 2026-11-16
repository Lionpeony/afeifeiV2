# AFEIFEI Design System — 开发交付规范（v4.2 汇总版）

> 项目：AFEIFEI 二次元少女乐队音乐播放器（桌面端 · 多音源聚合）
> 本文档汇总 v3.1 / v3.2 / v3.3 / v4.0 / v4.1 / v4.2 全部设计决策，是唯一的 Token 事实源。
> 全部对比度数值为 WCAG 相对亮度公式实算结果（2026-11-16）。
> 红线（不可违反）：无角色脸 / 无官方 Logo / 无原作截图 / 无台词曲名原文外露；暖黄与薄荷蓝永不作小文字色。

---

## 1. 颜色 Token

### 1.1 亮色主题「排练室」（默认）

| Token | 值 | 用途 | 对比度（实测） |
|---|---|---|---|
| `--bg-base` | `#FFF8F5` | 主背景（奶油粉白） | — |
| `--bg-sub` | `#FFE8EF` | 侧栏 / 卡片区 | — |
| `--bg-card` | `#FFFFFF` | 卡片 | — |
| `--text-primary` | `#3D2B39` | 主文字 | 12.47:1 on bg-base |
| `--text-secondary` | `#6B5A68` | 次文字 | 6.08:1 on bg-base |
| `--brand-pink-400` | `#FF6B9D` | **仅装饰**：贴纸/柔光/渐变/胶带。禁止作白字底、小图标色 | 2.68:1（白字）不达标，故禁用为交互面 |
| `--brand-pink-600` | `#D63384` | 交互主色：按钮底 / 播放键 / 选中态 | 4.50:1（白字） |
| `--brand-pink-700` | `#B7286C` | active / 按下 | 5.94:1（白字） |
| `--lavender-600` | `#7B5FC9` | 链接 / MyGO 世界信号色 | 4.63:1 on bg-base |
| `--mint-400` | `#7EC8E3` | 漫游 / GBC 河夜装饰色（仅装饰） | — |
| `--coral-600` | `#C62A3F` | 点赞印记 / 警告文字 | ≥4.5:1 on 白 |
| `--marker-yellow` | `#FFD166` | 荧光划线底 / 马克笔图形。**禁止任何黄色文字** | 深字 on 黄 9.09:1 |
| `--gradient-tri` | `90deg, #FF9EBB → #B8A9E8 → #7EC8E3` | 顶部装饰条 / 幕布渐变 | — |
| `--shadow-pink` | `0 4px 20px rgba(255,107,157,.15)` | 卡片阴影（唯一常规档） | — |
| `--shadow-pop` | `0 8px 32px rgba(61,43,57,.18)` | 弹层加重档（第二档，禁止更多层级） | — |

### 1.2 暗色主题「排练室熄灯」（`prefers-color-scheme` + 手动三档：明亮/熄灯/跟随系统）

| Token | 值 | 用途 |
|---|---|---|
| `--bg-base-dark` | `#2A2438` | 主背景（雨夜紫黑） |
| `--bg-sub-dark` | `#352E48` | 侧栏 / 卡片区 |
| `--bg-card-dark` | `#3D3554` | 卡片 |
| `--text-primary-dark` | `#F4EAF2` | 主文字（≥7:1） |
| `--text-secondary-dark` | `#B8ABC7` | 次文字（≥4.5:1） |
| `--brand-pink-400-dark` | `#FF85B0` | 装饰 / 图形色（对卡片底约 4.8:1） |
| `--brand-pink-600-dark` | `#E06A9E` | 暗色下不作实心白字按钮 |
| `--lamplet-amber` | `#FFC66E` | 凌晨 2:00–4:00 河灯点缀（限夜间主题） |

暗色按钮规范：底 `#3D3554` + 描边 1px `#FF85B0` + 字 `#F4EAF2`（描边按钮），禁止低对比实心粉底白字。

### 1.3 音源语义色（多音源聚合标识）

| Token | 值 | 用途 |
|---|---|---|
| `--src-netease` | `#C20C0C` | 网易云音源徽标（红） |
| `--src-qq` | `#31C27C` | QQ音乐音源徽标（绿） |
| `--tag-vip` | 琥珀 `#B8860B` 系 | VIP 曲目标 |
| `--tag-unavailable` | `--text-secondary` 40% | 未收录行整体透明度 |

### 1.4 状态色

| Token | 用途 |
|---|---|
| `--state-success` | `#2E7D5B`（收藏成功类） |
| `--state-warning` | `--coral-600` |
| `--focus-ring` | `0 0 0 3px rgba(214,51,132,.35)`（focus-visible 描边环，全组件统一） |

---

## 2. 字体与字阶

### 2.1 字体栈

```css
--font-display: "ZCOOL XiaoWei","Yozai","PingFang SC","Microsoft YaHei",sans-serif; /* 标题/歌名 */
--font-body: "PingFang SC","Source Han Sans SC","Microsoft YaHei",sans-serif;        /* 正文 */
--font-hand: "ZCOOL KuaiLe","Long Cang",cursive;                                     /* 手写体：仅拟声词/便签/批注/印章(≤16px) */
```

手写体使用边界：歌名正文一律 `--font-body`，防止可读性塌方。

### 2.2 六层字阶（全站唯一字号来源）

| Token | 值 | 字重 | 用途 |
|---|---|---|---|
| `--fs-display` | 28/36 | 700 | 每日推荐标题、日期大字 |
| `--fs-title` | 20/28 | 600 | 页面主标题、歌单名 |
| `--fs-heading` | 16/24 | 600 | 模块标题 |
| `--fs-body` | 14/22 | 400 | 曲目表、正文 |
| `--fs-caption` | 12/18 | 400 | 次级说明、表头（表头另加 letter-spacing .08em） |
| `--fs-micro` | 11/16 | 500 | 徽标、音源标签、角标 |

### 2.3 排版规则

- 数字（时长/序号/进度时间）统一 `font-variant-numeric: tabular-nums`；
- 单行溢出 ellipsis + hover 全文 tooltip；多艺人以「 / 」分隔；
- 中日/中西混排 letter-spacing +0.05em。

---

## 3. 间距 / 圆角 / 栅格

| Token | 值 |
|---|---|
| `--space-1 / 2 / 3 / 4` | 8 / 16 / 24 / 32 px（8px 基准，模块纵向统一 32） |
| `--radius-card` | 16px |
| `--radius-btn` | 999px（胶囊） |
| `--radius-cover` | 4px + 1px 内描边（印刷卡纸感） |
| 布局 | 侧栏定宽 200px；底部播放栏固定 72px；曲目行默认 48px，设置可切紧凑 40px |
| 断点 | 桌面优先 ≥1280；768–1280 收窄列；≤768 只保证不横向溢出（桌面端产品，移动非目标） |
| 滚动条 | 8px：奶油轨道 + 莓粉 30% 滑块圆角，hover 加深 |

---

## 4. 动效 Token（Motion）

### 4.1 缓动曲线

```css
--ease-out-soft: cubic-bezier(0.22, 0.61, 0.36, 1);  /* 默认 */
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);   /* 果冻回弹（要更稳可降为 1.2） */
--ease-curtain:  cubic-bezier(0.65, 0, 0.35, 1);      /* 幕布/转场 */
```

### 4.2 时长阶梯

```css
--dur-tap: 120ms;     /* 按下/弹起 */
--dur-fast: 220ms;   /* hover/图标切换/颜色 */
--dur-base: 380ms;   /* 展开/位移/印章 */
--dur-curtain: 500ms;/* 幕布/切页（收起为镜像 400ms） */
--dur-ambient: 2000ms;/* 主题切换/氛围过渡 */
```

### 4.3 节奏规则

- 列表入场 stagger 间隔 40–60ms，仅前 6 项，其余直接就位；
- 同屏最多 1 个吸睛级动画（幕布 > 印章 > 其它）；
- 所有动画可中断可逆；循环动画（封面呼吸 6s / 柔光环 3s / 便签摆动 4s）页面不可见时暂停，单屏 ≤2 个；
- 页面转场：内容区 translateY(8px)+opacity 300ms `--ease-out-soft`，侧栏与播放栏不动。

### 4.4 动效档位（设置持久化）

- 完整（默认）/ 轻动效（去循环呼吸类）/ 关闭装饰动效；`prefers-reduced-motion: reduce` 时自动按关闭档处理，全部降级为 ≤150ms 纯 opacity 切换。

---

## 5. 组件状态（交互主色 `--brand-pink-600`）

| 状态 | 定义 |
|---|---|
| Default | 底 `#D63384`，白字 |
| Hover | 底 `#C72D78`（加深不提亮，保白字对比） |
| Active | 底 `#B7286C` + translateY(2px) |
| Disabled | 35% 透明 + `cursor:not-allowed` |
| Focus-visible | `--focus-ring` 描边环 |

关键动效规格：播放键按下 scale(.92)→回弹过冲 1.03→1；拨片盖章 1.6→0.95 撞击帧→1 + ink 扩散环 450ms；幕布 scaleX 收拢 500ms + 流苏虚线；setlist 划线 SVG stroke-dashoffset 320ms 笔宽 3→4.5→3；切歌纱帘 150ms（左扫=上一首/右扫=下一首）；Toast 垂直堆叠队列 220ms；时间数字滚入 180ms；进度条双层（莓粉进度 + 12% 暖黄缓冲层）。

---

## 6. 二次元表现层 Token

- 拟声词：手写体 + 2px 描边 + 旋转 -6°~6° 随机，760ms 弹出淡出（ポンッ=点赞/シュッ=切歌/シャッ=随机/ザッ…=幕布/タッタッ…=连跳）；跟音效开关；
- 集中线：幕布/秘密live/暗号解锁时 `repeating-conic-gradient` 0.6s、opacity 峰值 0.12，pointer-events:none；
- 贴纸微视差：卡体 scale(1.008)，贴纸反向 -1.5px，220ms；
- 程序化封面：hash(歌名) → 三色渐变底 + 吉他/拨片/星星/音符/胶带固定组合，**注意 hash 取模用无符号右移**（有符号右移会产生负索引，历史 bug）；
- E17 吉祥物：贴底缘 24px 高度带、9s 横穿、每 session 1–2 次且间隔 >30min。

---

## 7. 彩蛋索引（17 项，集章卡入口在设置页）

E01 吉他滑过加载 / E02 空态便签 / E03 深莓播放键 / E04 副歌提示（长按进度条标记后生效）/ E05 拨片盖章 / E06 切歌划线 / E07 随机绕路 / E08 幕布 / E09 凌晨河灯（限夜间主题）/ E10 十遍写词 / E11 五连点 Logo / E12 暗号色板（迷子/深夜の練習室/アンコール）/ E13 连跳自嘲 / E14 待机熄灯 / E15 安可集章卡 / E16 分幕队列 / E17 吉祥物路过。冷却规则：E06 文案 5 首冷却、彩蛋动画永不阻塞播放控件。

---

## 8. 无障碍硬指标

- 正文对比 ≥4.5:1；大字/图形 ≥3:1（本文档所有交互面 Token 已实算达标）；
- 键盘可用：`/` 聚焦搜索、Esc 全局关闭浮层、focus-visible 全组件可见描边环；
- 动画仅走 transform / opacity / filter / stroke-dashoffset；reduced-motion 全局降级。

---

## 9. 已知限制与待办（显式）

- 原型无真实音频内核：播放进度、歌词、下载均为模拟态；
- 登录/扫描/跨音源均为模拟流程，需接真实 API 后回归；
- 键盘焦点顺序整页走查建议在真实前端框架落地时做；
- 正式 Q 版吉祥物插画、视频/播客页未定稿（占位态）；
- 字体 ZCOOL XiaoWei / ZCOOL KuaiLe 为站酷开源字体，商用需核对当时的授权条款。
