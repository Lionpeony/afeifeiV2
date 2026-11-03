# AGENTS.md

给 AI 编程助手的入口。**一页，读完就能开工。**

## 1. 三条硬事实

1. **技术栈是 TypeScript + React 19 + esbuild**，没有 Vite、没有 dev server、没有路由库。改 UI 改 `.tsx`，改构建改 `scripts/build.mjs`。
2. **构建产物在 `dist/`，全部由 esbuild 生成，不入库**。改完源码必须 `npm run build`（`npm start` 会自动构建）。
3. **`src/main/` 里不许有业务**。判断"这是系统调用还是业务"：读文件是系统调用，决定要不要索引是业务。业务放 `src/renderer/domain/`。

## 2. 五环与一个端口（依赖只能向内）

```
ui (Ring 4) → projection (3) → capability (2) → domain (1) → kernel (0)
                                    ↑
contracts（纯类型）+ preload（唯一桥）→ main（环境，只做系统调用）
```

- 外层可以 import 内层，**内层不许 import 外层**。`scripts/lint.mjs` 规则 1 会拦。
- **只有 `ui/` 能 import react**。
- **环 0–4 都不许 import `electron`**，出站只走 `contracts` + `preload`。
- `ui/` 只能 import `kernel/index.js`，不许直接碰 `kernel/store.js`（写入口）。

## 3. 六条回退信号（出现就停，别硬推）

| 信号 | 说明 |
|---|---|
| `ui/` 里读 `audio.currentTime` | 时钟没做对 |
| 出现第二个 `new AudioContext` | 唯一音频图破了 |
| 同一个状态有两个写者 | 单一事实源破了 |
| 加音源要改 `ui/` | 能力声明漏了 |
| 某个文件超过 400 行 | 它在承担两件事 |
| 没走 `gate:` 协议就改 lint 阈值 | 门禁在被绕过 |

### 3.1 交付闸（95 分，2026-11-03 起）

**任何设计稿或代码改动，自评不到 95 分不许输出。** 不许"先给你看看"、不许一次摆多个未达标方案、自评必须带具体扣分项（写不出扣分项 = 没评）。

- **设计尺**：辨识度 25 / 惊艳 25 / 完成度 20（空态·错误态·降级·窄窗·键盘缺一项扣 2 起）/ 品类 15 / 可实施 10 / 一致 5
- **开发尺**：功能正确 25 / 不变式 20 / 判据可红 20（先红后绿）/ 回归安全 15 / 规模 10 / 诚实 10
- 细则、输出格式、假自评黑名单：`docs/15-交付门槛-95分.md`
- 执行版规则：`.codebuddy/rules/95-gate.mdc`（`alwaysApply: true`）
- **例外只有一种**：用户明确要草稿，且输出第一行必须写「未达 95（xx 分）：草稿，仅用于确认方向」

## 4. 命令

```powershell
npm start                    # 构建 + 启动
npm run verify               # 一条命令：typecheck / lint / build:test / test / build
node scripts/lint.mjs        # 只跑 6 条规则
node scripts/todo-count.mjs  # TODO 处数，只许降
```

**Windows 注意**：`grep` / `wc` 不存在，PowerShell 5.1 不支持 `&&`。检查一律写成 `node scripts/*.mjs`。

## 5. 文档地图

| 文件 | 内容 |
|---|---|
| `docs/00-设计基线.md` | **唯一权威设计**：五条不变式、五环、八个模型、M0–M5、"做好了"的十条 |
| `docs/01-施工流程.md` | 施工手册：依赖白名单、M0 建仓、六步循环、各段施工单、阶段门 |
| `docs/02-取用台账.md` | 从外部取了什么、为什么取 |
| `docs/03-改动日志.md` | 倒序流水账，**每次提交后加一条** |

**设计与代码冲突时以 `docs/00` 为准；要改设计，先改 `docs/00` 再改代码。**

## 6. 提交

- 一提交一件事，diff ≤ 400 行。
- 信息格式 `<环>: <做了什么>`，例 `kernel: add clock drift guard`；脚本/配置用 `chore:` / `build:`；放宽门禁用 `gate:` 并写清原值→新值。
- 只提交，不 push。
