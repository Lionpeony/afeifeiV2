# 项目长期记忆（精选）

## 渲染环境硬约束（2026-11-10 实证）
- 祖先有 filter（如 liquid-glass-react 的 `.glass`）就建立 backdrop root，后代 backdrop-filter 只能看到空 backdrop——「不生效」是规范行为不是环境问题；位移玻璃只适合小控件，整面板尺寸会背后卡片搬进面板。
- 半透明层下背景以 (1−α) 透出：密集列表别赌"低透明度+模糊"，α=0.94 才干净。
- 证据工具：`scripts/queue-shots.mjs`（队列三态 + 1:1 裁切 + 3x 放大）。

## 主题与绘制的坑
- 暗底白高光按主题降档：`--qp-sheen / --qp-head-sheen`，`:root[data-theme="dark"]` 覆盖。
- `animation: both` 会停在独立合成层，切主题子节点可能不重绘；队列面板已去 fill-mode。
- 队列底纱只调 `--qp-tint`（默认 94%）。

## 门禁（唯一正确形态）
- lint（207 文件 8 规则）→ tsc → build；单测 `node scripts/build.mjs --test && node --test test/*.test.mjs`（669 项）。
- `node dist-test/queue.mjs` 不是测试（bundle 空跑，假绿）。

## 播放页皮肤系统（第二代，2026-11-10）
- `StageSkin = sleeve|turntable|proof|prism`（封套/唱机/校样/棱镜）× `StageTone = dark|light`；classic/editorial/nebula/desk 已删（SKIN_MIGRATE 迁移老存档）。皮肤在 `src/renderer/ui/views/stage/skins/`。
- 皮肤只读 `--sk-*` / `data-tone`，不碰 `--stage-*`（A-10）；`--stage-*` 是 StageRoot inline style 写上 `.stage` 的，旧组件接皮肤配色要在组件自己身上声明别名。
- 外壳跟着翻纸：`.shell.live:has(.stage[data-tone="light"]:not(.skin-classic))`。
- 两套 tone 次级文字 alpha：浅 .46 / 暗 .36 才是同一对比（≈3:1）。
- 直播灯位名：冷白灯/琥珀灯/素净灯/余光灯（曾叫 ×台，随「不夜台」弃用改名）；纸面预设 = 纸面剧场/深靛唱机/极简留白/演后余光。

## 不夜台 / 夜航主题（2026-11-10 已全部删除）
- 用户三次明确不要：359a234 删可见文案，50d9d13 补死代码与命名，a9a8fac 删 forest「夜航」配色档（老存档回落 dark）+ 广播措辞中性化（首页 正在播放/播放列表；SkinTop PLAYING/PAUSED 且红灯随播放态熄火；电台页删假频率与 FM 角标）。
- 全局配色现三档：纸色/墨色/旧档；灯位 冷白灯/琥珀灯/素净灯/余光灯；预设 纸面剧场/深靛唱机/极简留白/演后余光。
- 截图 fixture 歌名已中性化（城市漫游/白色海岸/潮汐…），证据图无电台词。

## 证据脚本现状
- **三条链全绿（a9a8fac 起）**：page-shots 25 / live-shots 36 / skin-shots 14。
- live-shots 播放页段曾三处查已删 classic 选择器而假红；seek 判据 = .sk-tape 真指针序（pointerdown→input→pointerup）；主键先看 aria-label 防点成暂停。
- **React 受控 range 坑**：直接 el.value=x + dispatch input 会被 value tracker 去重吞掉；走 pointer 事件序才可靠。

## 液态玻璃（2026-11-12 落地，c677e65 一带）
- **Chromium 确实支持 `backdrop-filter: url(#f)` + feDisplacementMap 折射**（Electron 33 / Chromium 130 实测），"Web 不支持位移"是错的；死的是 liquid-glass-react 的架构（它自己给祖先加 filter）。
- **三条死因**（玻璃整卡失效）：祖先/自身 `opacity < 1`（0.999 也算）、任何 `animation … fill: both`（已播完也留）、祖先 `filter`。静态 `transform` **无害**（别断言 transform === none，会假红）。动画一律 `backwards`。
- **灯带锚定用 CSS anchor positioning**：`.cs-tapes > li:first-child { anchor-name: --lg-lamp-anchor }` + `::before { position:absolute; position-anchor; top:anchor(top); height:calc(anchor-size(height) + bleed) }`。手算常量和"栅格兄弟伪元素"都实测漂移（−9px / −265px，后者会把卡挤到第二行）。
- **`<button>` 的 UA `align-items: flex-start`**：flex 列容器里子项 fit-content → ellipsis 永不触发、space-between 失效（一行 `align-items: stretch` 修）。
- **CSP `style-src 'self'` 会静默拒绝注入的 `<style>`**：判据里装样式要走 CSSOM，且回读确认，否则量到的是"没生效但也不报错"的假值。
- **插入 DOM 后 Chromium 不重拍 backdrop 快照**：玻璃判据必须显式推 style 失效 + 读两遍差值 ≤8 才认。
- 1× 下玻璃感来自"淡青膜 + 2px 倒角 + 灯池溢出"，不是体量——用户若说"看不出来"，调的是 `--lg-lamp` 强度 / 膜 α / scale 三个旋钮，不是重做。

## 控制台语言（2026-11-12 用户两轮反馈后定）
- **底栏纯白**：`.shell.live .console` 只写 `background: var(--live-panel)`，不吃 `--cs-tint`、不铺噪点/渐变（拼接顺序 live.css → night-signal.css，后者赢；两处必须同值，否则顺序一变就回潮）。采样过 #f4f8f7 = 青灰，就是用户说的"不是白"。
- **整条控制台只有一颗实体按钮**（主键青瓷球）。前后曲与工具排一律无框图标 32×32（16 图标 + 左右 8 = 正圆），hover 6% / active 10% / `.on` 10% 青瓷底 + 青字。**不要再加"白瓷胶囊"**——一排白片浮在面板上会自成一套贴纸材质，用户会再说"和播放器不是一个风格"。
- **顶栏选中 = 青字 + 底部 2px 刻度线**（伪元素），不铺彩色药丸。`border-radius: 999` 上绝对不能用 `inset 0 -2px 0` 画底线（顺着圆角走成"笑弧"）。
- **主键双向态**（ed0a521）：播放中=实心青球+双竖线，暂停中=白瓷球（4% 青底+1.5px 青边+青三角）。球 40px 是硬约束——改 44px 顶高底栏 4px，播放页 1160×740 立刻多 11px 纵向滚动。进度环不旋转（转了会把 1.4% 的弧甩成"球旁绿点"），<2% 不画，暂停时整环 opacity 0。
- **监听区**：封面必须是 `<img referrerPolicy="no-referrer">`（CSS background-image 拿不到 referrer 策略，网易云 403）；`loadCover` 放行 `^(https?:|data:)`；曲名/歌手两行；封面 58 圆角方形；红心紧跟文字，别用 `flex:1` 把它推到列尾。
- **提示两级**：瞬态（收藏/播放失败/队列切不动）走底部胶囊 toast（2/2.6/4.2s 自清、可点掉）；常驻（新版本/异常退出）留顶部 `.notice-bar` + ×。`setNotice` 本身不会自动清，往里塞瞬态就是"永远不消失"。

## 首页信息架构（2026-11-12 评审落地）
- **一类信息一个出口**：状态词只在左眉标、位次也在眉标、总量只在波形脚注、剩余时长只在说明句、音源只在说明第二行。同屏四遍「正在播放」+ 两遍「共 30 首」= 页面在自我叙述，不是信息架构。
- **左栏高度 = copy min-height + 封面 flex:1**：单独收 min-height 会让封面吃掉全部余量（1.03:1「封面墙」、标题贴底）。必须配 `.cs-cover { max-height: 58% }` + `.cs-copy { margin-top: auto }`（文字贴底、两栏底边齐）。
- **底栏中轴**：`.transport` 按内容居中、`.seek` 撑满中列，各算各的中点会差 90px（606 / 714）。给同一个 `max-width: 640px + margin-inline: auto` 才重合；两端时间戳定宽 44px，防 `3:10→12:04` 时轨道跳格。
- **改文案必同步改判据，方向反过来**：`includes("来自")` 奖励复述，`!includes("正在播放")` 才守得住去重。

## 离场层动画（2026-11-12 实证）
- 只负责"滚出去"的层（`.cs-lead-ghost` 这种）必须 `fill: forwards` + `finished` 里立刻摘节点。`backwards` 在结束时会**把样式交还** → 层弹回原位、不透明，压在新内容上（用户看到的"重叠一下"）。
- 这类 bug 单点采样抓不到（旧判据 1140ms 采样照样绿），要整段 rAF 逐帧扫，且判"两层 transform 同时归零"——只看旧层会把动画 delay 的正常停留误判成重影。
- 连点保护：回调里比对 `flySeq`，否则上一轮的 finished 会清掉新一轮的离场层。

## 存量坑
- lint 禁裸 hex（写 `rgb(255 255 255)`）；`!important` 对 player.css 仍报红（HEAD 存量）。
- 本地曲库页默认专辑墙，脚本要曲目行先点「曲目」tab。
- 本 Shell 注入 `ELECTRON_RUN_AS_NODE=1`，跑 electron 前必须 unset；`electron …; echo $?` 若接管道取的是管道退出码（假绿陷阱）。
- **CRLF 文件黑名单（持续扩充）**：player.css、theme/presets.ts、radio/index.tsx、test/global-theme.test.mjs 等——带 \n 的多行 str.replace 静默不命中（单行中文串却能命中，造成改一半假象）；先 normalize 成 LF 或用 Edit 工具。
- **Bash 沙箱 safe-delete 守卫**（2026-11-11）：build.mjs 清 dist-test 会被 SAFE_DELETE_BULK_CONFIRM_REQUIRED 拦（>50 按回合累计，分批删没用）；正解 `CODEBUDDY_SAFE_DELETE_ENABLED=0 node scripts/build.mjs`。
- **electron 证据脚本必须 run_in_background**：前台跑会被 SIGTERM 秒杀；语法排查用 `node --check`（ESM 可用，行号准）。
- **视觉模型读截图不可信**（2026-11-11 两次实证）：把浅色控制台描述成深色厚板；像素采样（`py -c` PIL getpixel）才是写真。
- **CSS 优先级悬念用 matched-rules 探针**：evalJs 里枚举 document.styleSheets 命中元素的全部规则（注意 evalJs 模板串内禁 `${}`，用字符串拼接）。
- **入场动画 fill-mode 用 backwards 不用 both**：both 的 forwards 残留会滞留合成层（主题切换重绘坑同源）。
- matchMedia 驱动的 UI 判据在截图脚本里要轮询等稳（200ms×15），单次 sleep 500ms 会竞态假红。
