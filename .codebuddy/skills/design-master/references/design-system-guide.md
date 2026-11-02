## 三、设计系统管理（v2.0 新增）

### 🎯 核心能力

解决「多个项目间设计语言不统一」的痛点，提供从令牌定义到跨平台同步的完整方案。

### 📦 设计令牌（Design Tokens）管理

#### 令牌命名规范（基于 W3C Design Tokens Community Group 标准）

```
// 层级结构
{
  "color": {
    "core": {
      "blue-50":  { "value": "#eff6ff" },
      "blue-500": { "value": "#3b82f6" },
      "blue-900": { "value": "#1e3a5f" }
    },
    "semantic": {
      "primary":    { "value": "{color.core.blue-500}" },
      "primary-text":{ "value": "{color.core.blue-50}" },
      "success":    { "value": "#10b981" },
      "warning":    { "value": "#f59e0b" },
      "error":      { "value": "#ef4444" }
    },
    "component": {
      "button-primary-bg":  { "value": "{color.semantic.primary}" },
      "button-primary-text": { "value": "{color.semantic.primary-text}" }
    }
  },
  "spacing": {
    "xs":  { "value": "4px" },
    "sm":  { "value": "8px" },
    "md":  { "value": "16px" },
    "lg":  { "value": "24px" },
    "xl":  { "value": "32px" }
  },
  "typography": {
    "font-family": {
      "sans": { "value": "Inter, system-ui, sans-serif" },
      "serif":{ "value": "Georgia, serif" }
    },
    "font-size": {
      "xs":   { "value": "12px" },
      "sm":   { "value": "14px" },
      "base": { "value": "16px" },
      "lg":   { "value": "18px" },
      "xl":   { "value": "24px" },
      "2xl":  { "value": "32px" }
    }
  },
  "radius": {
    "sm": { "value": "4px" },
    "md": { "value": "8px" },
    "lg": { "value": "12px" },
    "full":{ "value": "9999px" }
  },
  "shadow": {
    "sm": { "value": "0 1px 2px rgba(0,0,0,0.05)" },
    "md": { "value": "0 4px 6px rgba(0,0,0,0.1)" },
    "lg": { "value": "0 10px 15px rgba(0,0,0,0.1)" }
  }
}
```

#### 自动生成 CSS 自定义属性

```css
/* 从设计令牌自动生成 */
:root {
  /* Color */
  --color-primary: #3b82f6;
  --color-primary-text: #eff6ff;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Typography */
  --font-sans: Inter, system-ui, sans-serif;
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 24px;
  --text-2xl: 32px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Shadow */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
}
```

### 🔗 跨平台样式同步

#### 支持的输出格式

| 平台/框架 | 输出格式 | 用途 |
|-----------|----------|------|
| CSS | 自定义属性（如上） | Web 项目 |
| Tailwind | `tailwind.config.js` 扩展 | Tailwind 项目 |
| Figma | 设计令牌插件格式（JSON） | 设计师同步 |
| Flutter | `ThemeData` + `ColorScheme` | 移动端 App |
| iOS | `UIColor` 扩展 | iOS App |
| Android | `colors.xml` + `dimens.xml` | Android App |

#### Tailwind 配置示例

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          900: '#1e3a5f',
        },
        semantic: {
          success: '#10b981',
          warning: '#f59e0b',
          error:   '#ef4444',
        }
      },
      spacing: {
        '18': '18px',
      },
      borderRadius: {
        '4xl': '32px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    }
  }
}
```

#### Figma 同步工作流

```
设计令牌（JSON）→ Figma Tokens Studio 插件 → 设计师在 Figma 中使用
                                         ↓
                                  Figma 设计稿更新
                                         ↓
                             miniprogram-ci / 代码生成器 → 开发项目同步
```

### 🌓 主题切换支持

#### 主题令牌结构

```css
/* Light Theme (默认) */
:root, [data-theme="light"] {
  --color-bg: #ffffff;
  --color-bg-secondary: #f8f9fa;
  --color-text: #1a1a2e;
  --color-text-secondary: #6b7280;
  --color-border: #e5e7eb;
  --color-primary: #3b82f6;
}

/* Dark Theme */
[data-theme="dark"] {
  --color-bg: #1a1a2e;
  --color-bg-secondary: #252540;
  --color-text: #e5e7eb;
  --color-text-secondary: #9ca3af;
  --color-border: #374151;
  --color-primary: #60a5fa;
}

/* High Contrast Theme (无障碍) */
[data-theme="high-contrast"] {
  --color-bg: #000000;
  --color-text: #ffffff;
  --color-border: #ffffff;
  --color-primary: #ffff00;
}
```

#### 主题切换实现

```js
// 主题切换逻辑
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

// 跟随系统
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
prefersDark.addEventListener('change', (e) => {
  setTheme(e.matches ? 'dark' : 'light');
});
```

#### 主题配置推荐

| 主题 | 适用场景 | 对比度要求 |
|------|----------|------------|
| Light | 默认，日间使用 | WCAG AA 4.5:1 |
| Dark | 夜间，护眼 | WCAG AA 4.5:1 |
| High Contrast | 无障碍，视力障碍用户 | WCAG AAA 7:1 |
| Auto | 跟随系统设置 | 自动适配 |

### 🗂️ 多项目管理方案

#### 项目令牌继承结构

```
design-tokens/
├── core.tokens.json       # 核心令牌（跨项目共享）
│   ├── color.core.*
│   ├── spacing.*
│   └── typography.font-family.*
├── brand-a.tokens.json    # 品牌 A 扩展（继承 core）
│   ├── color.semantic.*   # 覆盖语义色
│   └── brand.logo        # 品牌专属
├── brand-b.tokens.json    # 品牌 B 扩展
└── project-x.tokens.json  # 项目 X 扩展
```

#### 使用 Style Dictionary 自动化

```bash
# 安装
npm install -g style-dictionary

# 配置文件
{
  "source": ["design-tokens/**/*.tokens.json"],
  "platforms": {
    "css": {
      "transformGroup": "web",
      "buildPath": "dist/css/",
      "files": [{ "destination": "tokens.css", "format": "css/variables" }]
    },
    "scss": {
      "transformGroup": "scss",
      "buildPath": "dist/scss/",
      "files": [{ "destination": "_tokens.scss", "format": "scss/variables" }]
    },
    "js": {
      "transformGroup": "js",
      "buildPath": "dist/js/",
      "files": [{ "destination": "tokens.js", "format": "javascript/es6" }]
    }
  }
}

# 构建
style-dictionary build
```

