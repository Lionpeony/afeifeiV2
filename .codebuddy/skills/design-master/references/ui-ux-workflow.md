---

## 二、UI/UX 设计智能

### 🎯 触发场景

当用户询问以下场景时自动触发：
- UI 设计、UX 流程、信息架构、视觉风格方向
- 设计系统 / 设计令牌（Design Tokens）
- 组件规范、微文案（Microcopy）、无障碍设计
- 生成/评审/改进前端 UI（HTML/CSS/JS、React、Next.js、Vue、Svelte、Tailwind）

### 📋 标准工作流

#### Step 1：需求分诊（Triage）
只问必须问的，避免做无用功：
- 目标平台：web / iOS / Android / desktop
- 技术栈：React/Next/Vue/Svelte，CSS/Tailwind，组件库
- 目标和约束：转化率、速度、品牌调性、无障碍等级（WCAG AA？）
- 已有素材：截图、Figma 链接、代码仓库、URL、用户旅程

若用户说「全部都要」（设计 + UX + 代码 + 设计系统），按以下顺序交付：
1. UI 概念 + 布局
2. UX 流程
3. 设计系统
4. 实现方案

#### Step 2：产出交付物（按需要选择）

**UI 概念 + 布局**
- 明确的视觉方向、网格系统、字体系统、色彩系统、关键页面/区块

**UX 流程**
- 用户旅程地图、关键路径、错误/空状态/加载状态、边界情况

**设计系统**
- 设计令牌（色板/字体/间距/圆角/阴影）
- 组件规范（状态/交互/无障碍备注）
- 主题变体（light/dark/high-contrast）

**实现方案**
- 精确的文件级修改清单
- 组件拆分和验收标准

#### Step 3：使用内置资产

读取 `references/ui-ux-data/` 中的数据获取灵感/标准：
- `palettes.json` — 97 个精选配色方案
- `font-pairings.json` — 57 组字体搭配
- `ux-rules.json` — 99 条 UX 规则
- `chart-types.json` — 25 种图表类型

#### Step 4：可选脚本（设计系统生成器）

```bash
python3 references/scripts/design_system.py --help
```

适合需要快速生成结构化令牌输出（ASCII-friendly）的场景。

### ⚡ 输出标准

- 默认使用 ASCII 令牌/变量名（除非项目已使用 Unicode）
- 必须包含：间距阶梯、字体阶梯、2-3 个字体搭配选项、色彩令牌、组件状态
- 始终覆盖：空/加载/错误状态、键盘导航、焦点状态、对比度

---
