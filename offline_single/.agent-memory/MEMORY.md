# 项目记忆

## 底部播放栏 / 迷你播放器掉出视口的根因

- 现象：`.app`（100vh grid）里的底部播放条被裁掉、页面到底部看不到 bar，滚动区看起来能无限长。
- 根因：`.app` 只声明了 `grid-template-columns`，隐式行高为 auto，导致 `.main`（auto 行）被内容撑高，其内部 `1fr` 行同样失去约束，把底部行推出 100vh。
- 修复：`css/v4.css` 里加 `.app{grid-template-rows:100%}` + `.main{height:100%;min-height:0;overflow:hidden}`；页面滚动容器保持 `.main__page{min-height:0;overflow-y:auto}`。

## 脚本作用域约定

- 每个 `js/*.jsx` 是独立的 Babel script，跨文件共享组件/数据必须在文件末尾 `Object.assign(window, {...})` 导出，不能只写 `const X = ...`。
- 新增文件后要同步改 `index.html`：`preload` 行（fetch/script）+ 实际 `<script type="text/babel">` 行，缺一不可。
- 用 Python 批量改这些文件时务必 `assert old in s`，否则替换会静默失效（曾出现 data.jsx 三处替换全未命中、页面报 `DOWNLOADS is not defined`）。

## 程序化封面（TrackArt）图案整块不显示

- 现象：所有 `TrackArt` 只出渐变底，中央的吉他/拨片图案完全消失，大尺寸详情封面尤明显。
- 根因：`hashStr` 返回 uint32，`(h >> 3) % 5` 的 `>>` 按 int32 运算会得到负数，`ART_KEYS[-3]` 为 undefined 而不报错。
- 修复：`js/anime.jsx` 改用无符号右移 `ART_KEYS[(h >>> 3) % 5]` / `(h >>> 7) % 5`。凡是 hash 取模都要用 `>>>`。

## 浮层遮罩不要用 backdrop-filter 做整页压暗

- 现象：搜索遮罩（`position:fixed;inset:0` + `backdrop-filter:blur`）一出现，整页（含浮层本身）都被压成一层白纱，像全局 opacity 降低。
- 根因：无头截图环境对 backdrop-filter 的合成结果异常，把 backdrop 渲染成浅色再叠到上层。
- 修复：遮罩只用 `background:rgba(...)` 做压暗；把浮层面板 z-index 提到 96，避免与遮罩同层纠缠。

## 数据与页面

- 所有歌曲/歌单/榜单为虚构演示数据，集中在 `js/data.jsx`；音源账号是模拟登录（`accounts` 状态 + localStorage），不连真实平台。
