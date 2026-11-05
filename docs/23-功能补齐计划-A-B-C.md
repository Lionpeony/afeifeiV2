# 23 · 功能补齐计划（A / B / C 档）

> 用户 2026-11-04 给的缺口清单，全部照做，执行顺序由我排。
> 每条都要有代码证据（`docs/03` 记录 + 截图/测试输出），不靠印象。

## 执行顺序与状态

| # | 缺口 | 档 | 状态 | 落地位置 |
|---|---|---|---|---|
| 1 | 曲库目录管理（持久化多目录） | A | **已完成**（2026-11-04） | `main/ipc` `library:roots/addRoot/removeRoot`、`main/fs/roots.ts`、设置页 |
| 2 | 桌面通知（后台切歌 / 下完） | A | **已完成**（2026-11-04） | `main/ipc` `notify:show`、bootstrap 订阅、`download/queue.ts#justFinished` |
| 3 | 开机自启 | A | **已完成**（2026-11-04） | `app:autoLaunch/setAutoLaunch`、设置页「启动」块 |
| 4 | 专辑页 / 歌手页 + 行内跳转 | A | **已完成**（2026-11-04） | `views/library/album-wall.tsx`、`artists.tsx`、`ui/library-focus.ts`、`domain/library/group.ts` |
| 5 | 本地元数据编辑 | A | **已完成**（2026-11-04） | `domain/library/meta.ts`、`domain/library/state.ts`（覆盖层）、`views/library/EditMeta.tsx` |
| 6 | 歌单导入（分享链接/ID → 收藏） | A | **已完成**（2026-11-04） | `domain/playlists/online.ts`、`views/playlists`（并接进导航）；参考 lx `OpenListModal` + `addSongListDetail` |
| 7 | 歌词时间轴编辑 | B | **已完成**（2026-11-04） | `stage/index.tsx`：250ms 步进 + ±10s 滑杆；参考 folia 的每曲偏移/步进（folia 并没有逐行编辑器） |
| 8 | 歌词正则过滤 | B | **已完成**（2026-11-04） | `domain/lyrics/filter.ts` + 设置页「歌词」块；解析后显示前，两组预设 |
| 9 | 全局配色主题（不止明暗两档） | B | **已完成**（2026-11-04） | `ui/theme/presets.ts`（四档）、`ui/global-theme.ts`（配色包导入导出）、设置页「配色」块 |
| 10 | 下载增强（命名模板 / 并发 / 批量） | B | **已完成**（2026-11-04） | `domain/download/naming.ts`（命名模板）、`domain/download/settings.ts`（并发 1–6 默认 3）、在线搜索批量下载 |
| 11 | 「不喜欢」/ 少推这首 | B | **已完成**（2026-11-04） | `domain/dislikes/`（黑名单持久化）、推荐与漫游过滤、在线日报「不感兴趣」 |
| 12 | 听歌统计 | B | **已完成**（2026-11-04） | `domain/listening/log.ts`（会话账本）、`projection/stats.ts`（周/月/24h/Top）、`views/stats/`（听歌报告页） |
| 13 | 视觉器 / 3D 轮播 / ~~桌面壁纸~~ | C | **部分回退**（2026-11-04 完成轮播与三模式；2026-11-05 用户决定移除「町景」——引擎直接来自 folia，代码/依赖/测试引用已删） | `stage` 菜单「视觉/封面」两行、对焦式轮播 `index.tsx` + `stage.css` |
| 14 | 同步服务器 | C | **不做**（2026-11-04 用户定） | — |
| 15 | 开放 API | C | **不做**（2026-11-04 用户定） | — |
| 16 | 使用引导动画 | C | **已完成**（2026-11-04） | `views/onboarding.tsx`（3 步、键盘可过）、KV `onboarded`、smoke/page-shots 断言 |
| 17 | 播客 / 有声书 | C | **不做**（2026-11-04 用户定） | — |

> C 档范围收窄：用户 2026-11-04 明确「C 档只做 13 和 16，其他不做了」。14（同步）、15（开放 API）、17（播客）从计划中移除，不再排期。

## 已定的三个决策（后续别推翻）

1. **元数据编辑不写音频文件标签**：folia 的 `LocalSongMetadataMatchDialog` 也只写自己的库 + 保留导入快照可还原。ID3v1/v2、APEv2、FLAC picture、编码、损坏文件，任一处写错就是用户原文件报废。我们做「索引之上的一层覆盖」（`library-meta` KV），清空三项即回文件原值。
2. **专辑/歌手不建实体表**：folia 用 `local_library_entities` + `assignments`（Dexie）是为了处理合并、别名、`mergedInto` 重定向。我们是 5000 首级的本地库，`groupByAlbum/groupByArtist` 现算毫秒级，不引第二套真相。
3. **参考实现只抄行为，不抄语言**：folia 是 Tauri+Rust+Dexie，lx 是 Vue，直接搬代码等于重写；每条都注释「抄的是哪条规则、为什么不抄那部分」。

## 记录方式

- 每次交付：`docs/03-改动日志.md` 顶部加一条（动机 / 改了 / 关键决策 / 坑 / 遗留）。
- 本文件只维护「状态」这一列，不写细节。
