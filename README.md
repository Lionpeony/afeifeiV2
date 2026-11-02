# Afeifei 阿飞飞（v2）

沉浸式音乐播放器 · Windows 桌面 · AGPL-3.0-only

从零重写的第二版。渲染层 TypeScript + React，主进程只做系统调用。
设计与施工依据见 `docs/00-设计基线.md`（造什么）与 `docs/01-施工流程.md`（按什么顺序造）。

## 三条命令

```powershell
npm install                # 只装一次；Electron 二进制走 .npmrc 里的国内镜像
npm start                  # 构建 + 起应用
npm run verify             # typecheck → lint → build:test → test → build
```

## 当前进度

| 段 | 状态 |
|---|---|
| M0 建仓 | 完成：空壳能起、六条 lint 规则、5 个纯函数测试、便携版数据落点 |
| M1–M5 | 未开始，见 `docs/01` §4 |

## 目录

```
src/main/            环境（窗口 / 日志 / 路径），0 行业务
src/preload/         唯一桥
src/contracts/       纯类型，两侧共用
src/renderer/
  kernel/            Ring 0：store（单写者）
  domain/            Ring 1：曲库 / 歌单 / 收藏 / 历史
  capability/        Ring 2：音源 / 歌词 / 舞台 / 主题
  projection/        Ring 3：selector（纯函数）
  ui/                Ring 4：组件 / token / 合成器
scripts/             build / lint（6 条规则）/ verify / todo-count
test/                node --test 纯函数测试
```
