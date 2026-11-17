# 项目记忆

## 底部播放栏 / 迷你播放器掉出视口的根因

- 现象：`.app`（100vh grid）里的底部播放条被裁掉、页面到底部看不到 bar，滚动区看起来能无限长。
- 根因：`.app` 只声明了 `grid-template-columns`，隐式行高为 auto，导致 `.main`（auto 行）被内容撑高，其内部 `1fr` 行同样失去约束，把底部行推出 100vh。
- 修复：`css/v4.css` 里加 `.app{grid-template-rows:100%}` + `.main{height:100%;min-height:0;overflow:hidden}`；页面滚动容器保持 `.main__page{min-height:0;overflow-y:auto}`。

## 脚本作用域约定

- 每个 `js/*.jsx` 是独立脚本，跨文件共享组件/数据必须在文件末尾 `Object.assign(window, {...})` 导出，不能只写 `const X = ...`。
- 运行时加载的是预编译产物 `js/compiled/*.js`（esbuild classic JSX，React 全局来自 `vendor/`），**不是** `text/babel` 动态加载：`file://` 双击打开可用，无需起服务。
- 改了任意 `js/*.jsx` 后要跑 `npm run build` 重新生成 `js/compiled/`；新增文件还要在 `index.html` 底部按依赖顺序补一行 `<script src="js/compiled/X.js">`。
- 编译产物不能包 IIFE / minify 顶层名字，否则跨文件全局丢失。
- 用 Python 批量改这些文件时务必 `assert old in s`，否则替换会静默失效（曾出现 data.jsx 三处替换全未命中、页面报 `DOWNLOADS is not defined`）。

## 程序化封面（TrackArt）图案整块不显示

- 现象：所有 `TrackArt` 只出渐变底，中央的吉他/拨片图案完全消失，大尺寸详情封面尤明显。
- 根因：`hashStr` 返回 uint32，`(h >> 3) % 5` 的 `>>` 按 int32 运算会得到负数，`ART_KEYS[-3]` 为 undefined 而不报错。
- 修复：`js/anime.jsx` 改用无符号右移 `ART_KEYS[(h >>> 3) % 5]` / `(h >>> 7) % 5`。凡是 hash 取模都要用 `>>>`。

## 浮层遮罩不要用 backdrop-filter 做整页压暗

- 现象：搜索遮罩（`position:fixed;inset:0` + `backdrop-filter:blur`）一出现，整页（含浮层本身）都被压成一层白纱，像全局 opacity 降低。
- 根因：无头截图环境对 backdrop-filter 的合成结果异常，把 backdrop 渲染成浅色再叠到上层。
- 修复：遮罩只用 `background:rgba(...)` 做压暗；把浮层面板 z-index 提到 96，避免与遮罩同层纠缠。

## 封面与图片资产

- `data.jsx` 的 `COVER` 必须用内嵌 data URI（8 张，来自 covers/uris.json）；早期 storage 路径（`/spark/app/...storage/object/...`）会 404，已整体替换。新增封面时同样只能内联 data URI，不得引用外部地址。

## v4.3 功能结构（四组新功能）

- 账号区在 `js/Settings.jsx`：已登录行 `.acct-row.is-on(.is-cur)`，未登录行 `.acct-row.is-empty`（虚线 + QR 图标 + `.acct-empty-tag`）。
- 新增文件：`js/Studio.jsx`（定时/音质/EQ 抽屉，导出 `QUALITY_LEVELS`）、`js/Shortcuts.jsx`（`Hotkeys` 全局键 + `MediaDock` 悬浮控制 + `KeysSheet`）、`js/PlaylistEditor.jsx`（`ListEditor` + `AddToListPanel`）、`js/History.jsx`（`history` 页），样式统一在 `css/studio.css`。
- 全局状态都在 `app.jsx`：`myLists / history / quality / eq / sleep / studio / showTr / dock / keysOpen / listEditor / focusList`，并全部进了 ctx；页面路由加 `page === "history"`，侧栏导航加「播放历史」。
- 右侧抽屉 `.studio` 必须 `bottom:72px`（与播放栏同高），否则会盖住播放栏进度与时间。
- 深链参数：`?studio=sleep|quality|eq`、`?keys=1`、`?dock=1`、`?newlist=1`，方便截图与演示。
- 快捷键：`Hotkeys` 绑定一次全局 keydown，通过 `ref` 取最新 ctx；`?` 弹 `KeysSheet`，播放页顶栏有「快捷键 ?」入口 + 首次进入的一次性提示（`keysHintSeen` 持久化）。

## v5 播放页歌词墙与通行证

- 歌词：`js/LyricWall.jsx` + `css/lyrics.css`。旧的 `LyricsStrip` 已删（anime.jsx 只导出 `lyricsFor/lyricEnFor`），播放页 `.np__stage` 拆成 `.np__stage-top`（封面+信息）+ `LyricWall` 两行。
- 歌词滚动两模式：整首放得下（`totalH <= viewH + rowH*0.9`）就整块居中，否则按当前句锦点 `translate3d` 滚动；行高 58px（全屏 92px），改高度时 JS `rowH` 与 CSS `--row-h` 必须同时改。
- 全屏歌词由 `app.jsx` 的 `lyricsFull` 控制，靠类 `.np--lyrics-full` 隐藏舞台/队列/时间线；`?lyricsfull=1` 可直开。Esc 链里要在 playerOpen 之前先收全屏。
- 媒体键悬浮卡已重做成「后台通行证」 `.pass`（Shortcuts.jsx），纸面不跟随暗色主题（实体证件感）。
- 深链：`?pos=95` 可直接定位播放进度（看卡拉OK 填充）、`?lyrics=0` 关闭歌词、`?lyrics=1` 开桌面歌词。

## v5.5 账号：换台幕间 + 扫码登录

- 换音源用 `switchSource`（app.jsx），不要直接 `setSource` 做“换台”动作：幕布合上（390ms）才真正切源，900ms 开场，1320ms 清除；状态在 `srcSwap{id,phase}`，由 `SourceSwap`（js/SourceSwap.jsx）渲染为 `.swap` 盖在账号卡内（`.acct-card{position:relative;overflow:hidden}`）。
- 扫码登录：`js/ScanLogin.jsx`（`QRCode` 纯 SVG 模拟，无外部图）+ `css/account.css`。状态机 wait→（2s 自动）scanned→点确认→ok→1.5s 自动关；成功时调 `linkAccount`。全局只挂一份，靠 `loginSrc` 开关，Esc 链最先关它。
- 深链：`?p=settings`、`?acct=out|in`（强制未登录/已登录）、`?scan=netease&scanstate=wait|scanned|ok&scanmode=code`、`?swap=qq&swapphase=hold`（静态展示幕间）。
- 图标：`IconQR` 早就有；本次新增 `IconSwap`（icons4.jsx），新增图标记得同时加进两处 Object.assign。

## 动画性能约定（v5.6）

- 首屏启动层已移到 `index.html` + `css/splash.css`：React 之前就能上屏，`window.__bootDone()`（App 挂载时调）负责退场，`window.__splashReplay()` 供彩蛋 E01 重放。EggLayer 里的 `.boot` 已删除，不要再加回去。
- 启动层/换台/胶囊幕帘**只允许 transform / opacity / clip-path**：Guitar 用“全宽轨道 translateX + 内层 rotate”，进度条用“渐变整条预画 + 同色遮挡板 translateX 滑开”，不要 animating `left`/`width`。实测 3 秒内 left+width 会触发 180 次 layout，transform 版为 0。
- `.src-switch` / `.src-pill` 的音源切换走 `switchSource(id, { scope: "pill", quiet: true })` + `<PillWipe/>`（300ms 局部幕帘）；设置页的 `SourceSwap` 是全卡幕间，两者共用一个 `srcSwap` 状态（`scope` 区分）。
- 帧率表：`?perf=1` 或 Ctrl/Cmd+Shift+F（`js/Perf.jsx`，只在每 700ms 汇总一次，自己不会造成重渲染）。
- 已知带布局/重绘的动画（低优先级，未改）：`.dl-bar` 的 `dlShine` 用 `filter:brightness`；进度条 `bar__seek i/b` 仍是 width/left（由 4Hz 的 `pos` 驱动）。

## 数据与页面

- 所有歌曲/歌单/榜单为虚构演示数据，集中在 `js/data.jsx`；音源账号是模拟登录（`accounts` 状态 + localStorage），不连真实平台。
