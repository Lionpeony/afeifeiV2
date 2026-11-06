---
name: run-verify
description: 运行 afeifei-v2 并做真机验证——npm start、npm run verify、smoke（Electron + CDP）与 perf 性能预算/基线。改完 UI、运行时、主进程或 preload 后，以及声称任务完成前使用。
---

# 运行与验证（afeifei-v2）

本项目没有 dev server、没有浏览器预览。唯一可信的界面验证是**真起 Electron**：`scripts/smoke.mjs` 走 CDP 驱动真实渲染进程，`scripts/perf.mjs` 测性能预算。不要用静态阅读或单测代替。

## 命令

全部在仓库根目录执行。

| 目的 | 命令 |
|---|---|
| 构建 + 启动（人工看界面） | `npm start` |
| 只构建 | `node scripts/build.mjs` |
| 完整门禁 | `npm run verify` |
| 只跑冒烟 | `node scripts/smoke.mjs` |
| 只跑性能 | `node scripts/perf.mjs` |
| 重新采性能基线 | `node scripts/perf.mjs --baseline` |

`smoke` / `perf` 都直接启动 `dist/main.js`，单独跑之前先 `node scripts/build.mjs`，否则测的是旧产物。

`npm run verify` 依次执行：`typecheck → lint → build:test → test → build → smoke → perf`，任何一步非 0 即整体失败，最后输出 `ALL GREEN`。

## smoke 覆盖什么

`scripts/smoke.mjs` 用端口 **9333**、临时 profile `%TEMP%/afeifei-smoke-<pid>`，不写真实应用数据。分四段：

1. 界面 / preload 桥 / 首页直播面 / 本地页 / 在线页 / 主题 / 睡眠定时 / 设置页 / 真实解码播放 / 无效令牌 / 存档往返
2. 强杀重启 → 恢复曲目、位置、音量、暂停态 → 连切 20 首 → 播放模式 / 键位 / 红心 / 账号区 / 离线横幅 / 三态 / 迷你窗 / 换词 / 桌面歌词窗
3. 存档指向已删文件 → 重启必须落进 error 态（`track-missing`），队列失败标记与清空二次确认
4. `afeifei://play` 冷启动

能自动验的是状态一致、不崩、不进 error、进度条不越界。**这些是手测项，不要声称冒烟覆盖了**：

- 切歌不爆音、淡入淡出、预取延迟（两个 `<audio>` 是 `new Audio()`，不进 DOM）
- 视觉是否好看、间距/颜色是否符合设计稿

## perf 覆盖什么

`scripts/perf.mjs` 用端口 **9334**、临时 profile，向 `library.json` 写 5000 首假数据后重启，走正式恢复链路。预算：

| 指标 | 预算 |
|---|---|
| 二次启动恢复 5000 首 | < 80ms |
| 5000 行滚动帧间隔 p95 | < 20ms |
| 搜索响应 | < 100ms |

基线存在仓库根目录 `perf-baseline.json`。有基线时，当前值需同时超过基线 20% **且** 绝对差 > 15ms 才判劣化；首轮判红会自动重测两轮取中位，避免 CPU 热导致的假红。

**不要为了变绿改 `BUDGET` 或 `NOISE_MS`。** 真出现数量级劣化，先定位根因。

## 用 harness 做定向验证

`scripts/lib/harness.mjs` 是 smoke/perf 共用的启动器，只做「起进程 / 连 CDP / 求值 / 等条件 / 截图 / 收尾」，不含业务断言。需要临时验证某个交互或截一张界面图时，写一个临时 `.mjs` 脚本复用它，验完删掉。

```js
import { launch, cleanupProfile, sleep } from "./scripts/lib/harness.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const profile = path.join(os.tmpdir(), `afeifei-check-${process.pid}`);
const app = await launch({ port: 9335, profile });
try {
  await app.waitFor(`document.querySelector("h1")?.textContent === "afeifei"`);
  const text = await app.evaluate(`document.querySelector(".ruler")?.textContent ?? ""`);
  fs.writeFileSync("shot.png", await app.screenshot());
  console.log(text);
} finally {
  await app.close({ hard: true });
  cleanupProfile(profile);
}
```

要点：

- `evaluate(expression)` 在页面里执行，支持 Promise，返回值必须可 JSON 序列化；页面抛错会直接 throw，并带原始异常。
- `waitFor(expression, timeoutMs = 8000)` 轮询到真值；不要用固定 `sleep` 等渲染。
- `screenshot()` 返回 PNG Buffer，不依赖窗口焦点，适合 UI 改动后人工比对。
- `events()` 是 CDP 的 `Log.entryAdded` / `Runtime.exceptionThrown`；`log()` 是 Electron 进程 stdout+stderr。失败时先看这两个。
- `profile: null` 会省略 `--user-data-dir`，用真实 userData。只用于看真实登录态；任何会改状态的验证都用临时 profile。

## 失败排查顺序

1. 先确认构建：`node scripts/build.mjs` 是否成功，`dist/main.js` 是否存在。
2. CDP 超时：看 `应用输出`（脚本会打印）；常见原因是 Electron 没装（`npm install`）或上一轮 Electron 没退干净占用端口。
3. 页面异常：看 `--- 页面事件`，定位到具体抛错。
4. 断言失败：脚本打印期望与实际值；改代码修根因，不要放宽断言。
5. 性能假红：先单独重跑 `node scripts/perf.mjs`；连续红再看基线是否本身过时。

## 完成前自检

- [ ] 改过 `src/` 就至少跑过 `node scripts/smoke.mjs`
- [ ] 涉及门禁、跨环依赖或提交前，跑完整 `npm run verify`
- [ ] UI 改动用 harness 截图看过实际界面
- [ ] 没有改 lint 阈值、性能预算或测试断言来换绿
- [ ] 没把冒烟未覆盖的听觉/视觉项说成已验证

Windows 注意：`grep` / `wc` 不存在，PowerShell 5.1 不支持 `&&`；检查一律写成 `node scripts/*.mjs`。
