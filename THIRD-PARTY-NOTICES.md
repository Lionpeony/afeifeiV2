# 第三方取用声明

本项目以 **AGPL-3.0-only** 发布（见 `LICENSE`）。

## 取用原则

- 十家开源播放器**只借做法，不搬代码**（理由见 `docs/00` §1.1）。
- 唯一例外是**纯数据**（色值、字幕样本、字段映射）——数据没有架构。
- 确实要搬代码时，在这里登记：来源 / commit / 我们的文件 / 对方文件 / 原许可 / 原作者，并在 `docs/03` 记一句"为什么取而不是自己写"。

## 台账

| 来源 | 许可 | 取用了什么 | 落在本仓库哪里 |
|---|---|---|---|
| [yakult-green-tea/qq-music-api](https://github.com/yakult-green-tea/qq-music-api)（v3.3.5） | MIT | **整包依赖**：QQ 音乐扫码登录（MQTT/HTTP 双通道）、登录态会话管理（QIMEI）、登录态播放地址。作为独立服务由主进程 `qqBackend.ts` 拉起，通过 HTTP 调用 | `src/main/net/qqBackend.ts`、`src/main/net/qqClient.ts` |
| [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) | AGPL-3.0 | **登录身份机制**：每次启动随机 `deviceId`、登录态 cookie 名清单、以及"扫码被连接重置后需换出口 IP"这一事实（来自其源码注释）。未搬其 Worker/jsdom 后端——本项目直接用同一个底层 SDK 的函数式接口 | `src/main/net/neteaseClient.ts`（`DEVICE_ID` 与 `cleanCookie`）、`src/main/ipc/index.ts`（登录态 cookie 白名单思路） |
| [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) | MIT | 作为依赖使用（`npm i NeteaseCloudMusicApi`），未修改其源码 | `package.json` 依赖；经 `main/net/neteaseClient.ts` 调用 |

### 关于 Folia 的取用说明

两者同为 **AGPL-3.0**，许可兼容。取用的是**做法与常量**（随机 deviceId、cookie 名清单），不是整段代码搬运：

- 本项目的网易云通道走 `NeteaseCloudMusicApi` 的**函数式接口**（主进程内直接调用），
  而 Folia 走的是 `electron/netease/` 那套 **Worker 线程 + 本地 HTTP 服务**（`neteaseApiWorker.cjs` + `neteaseApiStartup.cjs`）。
- 因此**没有**复制它的 Worker、jsdom 延迟加载、生命周期管理与诊断模块。
- 若将来改为内嵌 HTTP 服务模式，需重新评估并在此补充登记。

参考实现只读副本位于 `.ref/folia/`，**不进入版本控制**（见 `.gitignore`）。
