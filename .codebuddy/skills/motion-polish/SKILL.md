---
name: motion-polish
description: afeifei-v2 的动效打磨规则与审查流程——判断该不该动、动哪里、用多少时长，避免卡顿、过度动画和高频操作变慢。用于用户说「不丝滑」「卡」「加个过渡」「页面切换生硬」「歌词/进度/面板动效」时，或改动任何 transition / animation / rAF 之前。
---

# 动效打磨（afeifei-v2）

本项目的动效底座是 **CSS transition/keyframes + 唯一 rAF 时钟**。没有动画库，也不要为了「丝滑」先加库。丝滑来自正确的属性、频率分级和统一曲线，不是依赖数量。

开工前先读 `AGENTS.md`；验证用 `run-verify` skill。

## 硬约束

1. **不引入动画库**：Framer Motion、GSAP、react-spring、use-gesture、react-virtuoso 都不加。现有虚拟列表、指针拖拽、Canvas 频谱已经覆盖这些场景。确需引入时，先拿到用户明确同意，并用 `perf.mjs` 证明收益。
2. **时间只有一个来源**：[compositor.ts](../../../src/renderer/ui/compositor.ts) 是全应用唯一 `requestAnimationFrame`，通过 `onTick` 分发 `clock.t`。不要新建 rAF、不要在 `ui/` 读 `audio.currentTime`、不要用 `setInterval` 驱动视觉。
3. **连续动效只碰 `transform` / `opacity`**：进度、歌词、拖拽、滚动一律如此。禁止动画 `width`、`height`、`top`、`left`、`margin`、`padding`。
4. **每帧值不要叠 transition**：由 `onTick` 每帧写入的值（进度、歌词位置）直接写 `style`，不要再加 `transition`，否则会和时钟抢状态。
5. **离散状态才用 CSS transition**：展开/收起、显隐、悬停、选中。不要用 keyframes 做可中断的交互，keyframes 每次重头播。
6. **时长预算**：高频导航 0–150ms；普通交互 120–180ms；面板/菜单 180–300ms；只有低频的沉浸转场才允许 300–500ms。
7. **`prefers-reduced-motion` 要更轻，不是全关**：保留 opacity/颜色，去掉位移和缩放。
8. **动画不得改变布局尺寸**：先量再改；改完跑 `node scripts/perf.mjs`。

## 频率分级（本项目）

| 场景 | 时长 | 理由 |
|---|---|---|
| 站尺切房间（本地/在线/设置/喜欢/最近）、快捷键、播放/暂停、上下首、seek | **不加动画** | 每天几十上百次，动画只会显得慢 |
| 按钮按压、红心、音量、静音、选中态 | 100–160ms | 反馈要快，不能拖 |
| 队列面板、睡眠弹层、菜单、迷你窗控件、主题切换 | 180–280ms | 偶尔出现，允许过渡 |
| 播放页进出、首次启动、沉浸模式 | 300–500ms | 低频，可有仪式感 |
| 加载中的呼吸/脉冲 | 1.2–2.6s infinite | 只用于不确定状态，结束时必须停 |

## 动效落点地图

| 位置 | 现状 | 判断 |
|---|---|---|
| [stage-queue.css](../../../src/renderer/ui/views/stage/stage-queue.css:284) | `transform/opacity 300ms cubic-bezier(.3,.7,.3,1)` + `will-change` | **范本**，保持 |
| [player.css](../../../src/renderer/ui/player.css:1076) | `transform 120ms ease` | 合适 |
| [tokens.css](../../../src/renderer/ui/tokens.css:45) | `--stage-dur: 200ms` / `--stage-ease: ease-out` | 场景切换的统一入口 |
| [lyric.css](../../../src/renderer/lyric.css:70) + [lyric.tsx](../../../src/renderer/lyric.tsx:76) | `transition: width .2s linear`，每帧写 width | **要改**：`width` 触发布局；改 `scaleX` |
| [player.css](../../../src/renderer/ui/player.css:218) | 滑杆轨 `height 3px→4px` | 成本极小，保留，不要过度优化 |
| [app.css](../../../src/renderer/ui/app.css:560) | 骨架屏 `sk-pulse` | 不确定态，合理 |
| [live.css](../../../src/renderer/ui/live/live.css:1244) 等 | 多处 `live-pulse` + reduced-motion | 已处理 reduced-motion，保持 |
| 页面内容切换 [index.tsx](../../../src/renderer/ui/index.tsx:1353) | 条件渲染，无过渡 | 高频导航，**保持无动画** |

`prefers-reduced-motion` 目前只覆盖 `live.css`、`night-signal.css`、`player.css`、`stage-queue.css`。新增动效时按文件补，不要假设全局兜底。

## 审查流程

1. 扫一遍：
   - `transition:`
   - `animation:`
   - `@keyframes`
   - `requestAnimationFrame`
   - `will-change`
2. 每条按四问判定：
   - **频率**：每天多少次？高频直接判「不加」。
   - **目的**：反馈、空间连续、状态指示、防止跳变、低频惊喜。说不出目的就删。
   - **属性**：是否只碰 `transform`/`opacity`？是否每帧写值却还叠了 transition？
   - **时长**：是否超过该频率档位？
3. 输出一张表，最多改 3 处：

| 文件:行 | 现状 | 判定 | 改法 | 预算 |
|---|---|---|---|---|

4. 先改最影响手感的一处，跑验证，再继续。不要一次重写整套动效。

## 实现配方

**连续进度线（歌词、迷你窗）**

```css
.bar i {
  width: 100%;
  transform-origin: left center;
  transform: scaleX(var(--p, 0));
}
```

```tsx
<i style={{ ["--p" as string]: String(pct / 100) }} />
```

不要在 `i` 上留 `transition: width`。如果值来自每帧投影，直接写 `transform`；如果来自低频状态，才加 120–200ms 的 `transform` transition。

**面板 / 菜单**

```css
.panel {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
  transform-origin: var(--origin, top center);
  transition: opacity 180ms ease-out, transform 180ms ease-out;
}
.panel.open { opacity: 1; transform: none; }
```

不要从 `scale(0)` 开始；不要用 `ease-in`；弹出物从触发点展开，模态框居中。

**歌词逐字**

现有做法是 `on` / `off` 两个 span，只改颜色，不逐字建盒模型。保持。需要滚动时用 `translateY`，由 `onTick` 写，不叠 transition。

**主题切换**

瞬时换 token。不要给整个页面加 fade，否则每次切主题都像卡一下。

## 验证

```bash
node scripts/build.mjs
node scripts/smoke.mjs
node scripts/perf.mjs
```

- `smoke.mjs` 会点主题、队列、睡眠弹层、播放页、迷你窗、歌词窗；改 CSS 类名或结构会直接红。
- `perf.mjs` 的 5000 行滚动 p95 < 20ms 是硬预算；任何布局属性动画都可能把它顶红。
- 截图用 `run-verify` 里的 harness 模板，改前改后各一张。
- 手感不能只靠代码判断：切歌、seek、展开队列各手动过一遍；冒烟不覆盖「爆音」和「视觉好看」。

## 不要做

- `transition: all`
- `scale(0)` 入场
- UI 交互用 `ease-in`
- 给键盘快捷键、命令面板、播放/暂停加动画
- 用 `setState` 每帧驱动动画
- 第二个 `requestAnimationFrame`
- 为了动画新增依赖
- 改 `perf.mjs` 预算或 `lint.mjs` 阈值来换绿
