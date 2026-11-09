# 项目长期记忆（精选）

## 渲染环境硬约束（2026-11-10 实证，已修正一次错误结论）
- **v3 阶段我下过一个错结论**：「本机 backdrop-filter 完全不生效」。真相有两条：
  ① `liquid-glass-react` 的 `.glass` 带 `filter: url(#…)`，**祖先有 filter 就建立 backdrop root**，
  后代（`.qp`）的 backdrop-filter 只能看到空 backdrop → 看起来"不生效"（这是规范行为，不是环境不支持）；
  ② 面板已经 94% 不透明时，blur 本来也没多少可糊的（实测只削 13% 清晰度）。
- `liquid-glass-react` 的位移玻璃**在真机上是生效的**（用户截图里的错位专辑卡就是 backdrop 被位移的证据），
  `blurAmount` 才是哑参数。**整面板尺寸上做位移折射会把背后卡片/文字整块搬进面板**，不可用；
  位移玻璃只适合小控件。
- 半透明层下背景会以 (1−α) 透出：α=0.86 时列表标题仍可读（会落进行文字里），α=0.94 才干净。
  **不要在密集列表上赌"低透明度 + 模糊"，模糊失灵就直接翻车。**
- 证据工具：`scripts/queue-shots.mjs`（队列三态 + 1:1 裁切 + 3x 放大，走 首页 场景）。

## 主题与绘制的坑
- 暗底上白色高光必须按主题降档（实测：0.5 白会让头部亮度 50 vs 正文 20，成一条浅灰横带）。
  已做成 `--qp-sheen / --qp-head-sheen`，`:root[data-theme="dark"]` 覆盖。
- `animation: … both` 会让元素长期停在独立合成层，切主题时子节点可能不重绘。队列面板已去掉 fill-mode。
- 面板底纱是单个变量 `--qp-tint`（默认 94%），调"更透/更实"只改这一个值。

## 门禁（唯一正确形态）
- `node scripts/lint.mjs` → `npx tsc --noEmit` → `node scripts/build.mjs`；
  单测是 `node scripts/build.mjs --test && node --test test/*.test.mjs`（60 个文件）。
  **`node dist-test/queue.mjs` 不是测试**——那是模块 bundle，跑起来零输出、exit 0，是假绿。

## 播放页皮肤系统（2026-11-10 落地）
- `StageSkin = classic|editorial|nebula|desk` × `StageTone = dark|light`；classic 是旧版式原样保留，其余三套在
  `src/renderer/ui/views/stage/skins/`。新皮肤只读 `--sk-*` / `data-tone`，**一个 `--stage-*` 都不碰**（A-10）。
- 外壳跟着舞台翻纸：`.shell.live:has(.stage[data-tone="light"]:not(.skin-classic))`。`:not(.skin-classic)` 是必须的，
  否则旧的 black 播放页会被拉成纸色。
- `--stage-*` 是 StageRoot 用 **inline style** 写到 `.stage` 上的：想把旧组件（如 `.st-menu`）接到皮肤配色，
  别名必须声明在**那个组件自己**身上，写在 `.stage` 上会被内联盖掉。
- 两套 tone 的次级文字 alpha 不能照抄：浅色 .46 / 暗色 .36 才是同一视觉对比（≈3:1）。

## 存量坑
- `scripts/lint.mjs` 禁止裸 hex（含 `#fff`）：写 `rgb(255 255 255)`；`!important` 对 player.css 仍报红（HEAD 存量）。
- `scripts/page-shots.mjs` 整链断在过期导航项「下载」；队列/音效按钮已图标化，选择器要认 `aria-label`（队列=`播放队列`）。
- 本地曲库页默认落在专辑墙，脚本要曲目行需先点「曲目」tab。
- 本 Shell 环境注入 `ELECTRON_RUN_AS_NODE=1`，跑 electron 脚本前必须 unset。
- **player.css 是 CRLF**：用 node 脚本批量 replace（多行模式）会静默全部失败，改用 Edit 工具或先 normalize 成 LF。
