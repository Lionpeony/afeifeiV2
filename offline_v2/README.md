# AFEIFEI 播放器 · 原版离线包（无需登录版）

## 这是什么
在线原型的**原版源码**改造的完全离线版——就是你在妙搭平台看到的那一版，一个像素没改，只做了离线化处理。

## 与平台导出包的区别（为什么那份双击打不开）
平台导出的原包用 `text/babel + src` 方式加载 23 个 JSX 文件，且依赖飞书 CDN——浏览器 file:// 协议会拦截这种加载方式（XHR 跨域限制），所以双击白屏，看起来像"加密"。不是加密，源码一直是明文。

本包做了 4 件事：
1. 23 个 JSX + sound.js 全部**内联**进 index.html（内容逐字节未改）；
2. React / ReactDOM / Babel 三件套下载进 `vendor/`，改相对路径引用——**断网也能开**；
3. 清理 preload 标签；字体链接保留在线（断网自动降级系统字体，不影响打开）；
4. 保留 `js/` `css/` 原始目录：给 Claude 参考时直接看源文件更方便。

## 打开方式
解压后双击 `index.html`。任何现代浏览器，无需登录、无需联网（首次建议联网加载一次字体）。

## 已验证
- 22 个内联 JSX 块经 @babel/standalone 真实转译 22/22 通过；
- React 18.3.1 / ReactDOM 18.3.1 UMD 在模拟浏览器环境挂载成功；
- selfcheck 质量门 0 FAIL。

## 给 Claude 开发用
- `design.md`（若同目录）是 Token 事实源；本包是视觉与交互参照；
- `js/*.jsx` 是组件化源码（Auth/Discover/Playlists/Search/RowMenu/Eggs 等 23 个文件），比内联版更适合喂给 AI；
- 数据替换点在 `js/data.jsx`。
