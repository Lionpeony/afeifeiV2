# 47 · 对标 Folia：多音源适配是怎么做成的

> 对标对象：`chthollyphile/folia-major` v0.7.23（AGPL-3.0），本地只读镜像在 `tools/refs/folia/`。
> 本文只读源码 + 只读其自带文档写成，**不含任何移植代码**（AGPL 混入风险，见 §9）。
> 我们自己的代码路径以 `app/` 开头。

---

## 0. 三句话结论

1. **它确实在打各家私有接口，但逆向不是它做的**：全部外包给第三方 API 包（网易云 / 酷狗 / QQ / 汽水 / 波点），自己只写"宿主桥 + 归一化 + 界面"。
2. **它真正的工程价值是把 7 个平台收敛成一份契约**：一个 `omni` 门面、一个注册表、一份能力开关，UI 里不出现任何平台名。
3. **我们已经走在同一条路上**（QQ 用的就是同一个包 `@yakult-green-tea/qq-music-api`），差的是收敛度：我们现在是 2 个源、单文件大适配器、能力只有"方法白名单"。

---

## 1. 七个平台的上游真相

来源：`tools/refs/folia/src/services/onlineMusic/UPSTREAMS.md`（96 行，逐平台写明依赖、版本、改动、跟进方式）。

| 平台 | 上游包 / 服务 | 版本 | 桌面端怎么跑 | 网页版 | 谁做逆向 |
|---|---|---|---|---|---|
| 网易云 `netease` | `@neteasecloudmusicapienhanced/api` | 4.41.1 | 主进程 worker 里加载包，起 `127.0.0.1:<port>` 本地服务（`electron/netease/neteaseApiWorker.cjs`） | `VITE_NETEASE_API_BASE` | 第三方包 |
| 酷狗 `kugou` | `kugoumusicapi`（GitHub `MakcRe/KuGouMusicApi` tarball，非 npm） | v1.6.0 | 主进程直接 require 包并调函数，**不起服务**（`electron/kugou/kugouApiBridge.cjs`） | `VITE_KUGOU_API_BASE` | 第三方包 |
| QQ 音乐 `qq` | `@yakult-green-tea/qq-music-api` | 3.3.3 | 主进程 require，包**自己在 require 时起端口**（`electron/qq/qqApiStartup.cjs`） | 包的 `./serverless` 导出 → Vercel `api-ts/qq.ts` / CF `worker/qq.ts` | 第三方包 |
| 汽水音乐 `qishui` | `qishui-music-api` | 0.2.1（npm 现为 0.2.2） | 主进程桥直调 `createQishuiApi`，只放行包导出的操作白名单（`electron/qishui/`） | 无 | 第三方包（车机协议） |
| 波点 `bodian` | `bodian-music-api` | 0.1.2 | 同上（`electron/bodian/`，3 个文件） | 无 | 第三方包 |
| Spotify `spotify` | **自己打**：`api-partner.spotify.com/pathfinder/v2/query` + `spclient.wg.spotify.com`（无公开文档）+ `node-librespot` 解密音频 | 查询哈希钉在 `QUERIES` 表 | `electron/spotify/` | 无 | **自研逆向** |
| YouTube Music `ytm` | `youtubei.js` + `googlevideo` + `bgutils-js`（BotGuard PoToken） | 18.1.0 / 4.1.1 / 4.0.3 | `electron/ytm/`（15 个文件，最重的一个） | 无 | **自研逆向** |

另有 `Navidrome`（用户自己的服务，走公开 Subsonic API，不在 omni 里）。

**关键结论**：桌面端宿主桥极薄——酷狗 1 个文件、汽水 3 个、波点 3 个、QQ 4 个。协议、签名、扫码全在包里。
**接入成本不在协议，在"归一化 + 能力声明 + 失败解释"。**

---

## 2. 它自己的分层（照着抄结构就够了）

`src/services/onlineMusic/README.md` 开头的 layer map：

```
UI / hooks / stores / app services
  -> omni.ts                    唯一对外门面
       -> providerRegistry.ts   唯一注册表
            -> <id>Provider.ts       业务（搜索/播放/歌词/账号…）
                 -> <id>Transport.ts HTTP + 端口 + 错误翻译（唯一的请求出口）
       -> account/               跨平台账号读取
       -> login/                 登录失败分类、请求时限（不认识任何平台）
  -> src/types/onlineMusic.ts    共享契约
```

硬规则（有单测强制，`test/unit/onlineMusic/omniArchitecture.test.ts`）：
**UI / hooks / store 不准 import provider、registry、transport**，只能走 `omni.ts`。
架构测试里有一个 `forbiddenImport` 名单，接入新平台必须把它的 transport 加进去，否则测试不管它。

注册表 `providerRegistry.ts` 只有 116 行，核心就三句：

```ts
registerOnlineMusicProvider(neteaseProvider);
registerOnlineMusicProvider(qqProvider);
...
```

它还多做了两件我们没做的事：
- **可运行时增删**（Folium mod 可以注册/卸载 provider），用 `registryVersion` + 订阅让 UI 察觉列表变化；
- **按歌曲反查 provider**：`getOnlineMusicProviderForSong(song)` 靠 `sourceRef`，找不到就报 `unsupported`。

---

## 3. 六个最值得抄的设计

### 3.1 能力开关驱动 UI，UI 里没有平台名

`src/types/onlineMusic.ts:51` `ProviderCapabilities`（20 项）：

```
search / playback / lyrics / auth / userLibrary / playlists / albums / artists /
recommendations / mutations / personalFmModes / wordByWordLyrics / userCloud /
historyRecommendations / playlistSubscription / playlistTrackMutations / likes /
userAlbums / playbackReports / explore / songDetail
```

界面只看开关（探索页签、红心能不能点、歌词有没有逐字），不判断"这是哪个平台"。
`providerSupports(provider, 'likes')` 就是全部判断逻辑。

> 我们现在的 `caps` 是**方法名字符串数组**（`app/main/sources/onlineSource.js:25`），
> 语义是"这个函数存在吗"，不是"这个能力能用吗"。差别很大：`likes: true` 可以配一个"能读不能写"的退化实现，而 `caps: ['like']` 只能表达二选一。

### 3.2 每首歌都必须带 `sourceRef`

```ts
sourceRef: { kind: 'online', providerId: 'qq', mediaId }
```

`README.md` 里明说：没有 `sourceRef` 也没有 `providerId` 的歌**会被当成网易云的**
（`src/utils/appPlaybackGuards.ts` 的 `getPlaybackSourceRef`）。

我们踩过同一个坑：`app/main/sources/netease.js` 与 `qq.js` 都往 `track.source` 写值，但**没有一处强制校验**，
新增源忘了写就是"网易云的歌去问 QQ 要地址"。

### 3.3 失败解释分两层，且冷却按平台的话走

- 通用层 `failure/onlineFailureCase.ts`：**不认识任何平台**，只有几种有名字的情况（未登录、无版权、需要会员、平台说稍后、连不上、平台 5xx）。
- 平台层 `describeFailure(operation, error)`：把平台自己的码翻成上面的事实，或者直接点名（QQ 的 `device-limit`、汽水的 `no-audio`）。
- 时限：登录类 20 秒（`login/loginRequestLimit.ts`）；取播放地址 60 秒（网易云）/ 70 秒（QQ），值写在各 transport 里并注明原因。
- 冷却：平台说了等多久就真等到点（`failure/onlineRequestCooldown.ts`）；没说且是 5xx，只让预取停 30 秒。

我们现在的失败就是一句 `error: "QQ音乐：该曲目无可用音源（result=xxx）…"`（`app/main/sources/qq.js` 的 `resolve`），
上层拿到只能原样弹给用户，没法按类型给"重试 / 去登录 / 换音质"的按钮。

### 3.4 登录抽象：只有两种形态

`auth` 里二选一：`createQr`（扫码轮询）或 `openLoginPage`（浏览器里确认）。
界面 `src/components/login/` 里**不出现平台名**，标题、说明、平台记号、失败话术全由 provider 声明。

配套：`loginSelfCheck.ts`（登录失败后主动自检，结果进诊断报告）、
`loginDiagnosticReport.ts`（凭据、IP、账号先洗掉再进报告）。

这条我们刚吃过教训：QQ 扫码走 pkg 通道**只落 token 不落 cookie**，
而我们的 `hasLoginCookie()` 只看 cookie，导致"登录了但所有用户数据全空"。
Folia 那边把它收在一个地方：`electron/qq/qqAuthSessionRepository.cjs`（会话存储）+ `qq/qqSessionRefresh.ts`（静默刷新）。

### 3.5 凭据不出主进程，且 IPC 是**操作白名单**

```js
// electron/qishui/qishuiApiBridge.cjs
注入 { 设备标识, 会话仓库, net.fetch }，只放行包导出的 QISHUI_OPERATIONS
```

- 主进程 `safeStorage` 存会话；渲染进程只拿到"数据"，拿不到会话。
- 每个平台一条 IPC 通道（`bodian-api-request`、`qishui-api-request`…），并且先 `isTrustedMainWindowContents(event.sender)` 挡别的窗口。
- 汽水还有一个细节值得记：桥注入 `net.fetch` 时**一律加 `credentials: 'omit'`**，否则会带上 defaultSession 的 cookie 并回写 `Set-Cookie`。

我们现在是单一通道 `src:invoke`（`app/main.js:522`）+ 方法名字符串，白名单靠 `onlineSource.supports()`。
方向对，但粒度是"能不能调这个函数"，不是"能不能做这个操作"。

### 3.6 平台专属坑写进文档，而不是写进记忆

`UPSTREAMS.md` 里每条都有"我们改了什么 / 上游变了怎么跟"，举几个已经踩实了的：

- 网易云：包的 `util/request` 默认会给请求加伪造 `X-Real-IP`，**导致扫码确认失败**，桌面端加载前把导出换掉（`withoutImplicitClientIp`），Docker 镜像另外打补丁。
- QQ：包的 `/getSongInfo` 把 songid 当字符串交给上游，**QQ 只认数字**（2026-10-21 实测），所以按 songid 查歌不走后端。
- 汽水：只播服务直接返回的未加密地址，不碰受保护音频、不解密、不调官方客户端原生模块。
- Spotify：公开 Web API 对这种登录一律 429（2026-10-08 实测），所以才去打 partner 私有接口；查询被换掉时返回 `PersistedQueryNotFound`。

---

## 4. 单个平台的目录模板

```
src/services/onlineMusic/qq/
  qqProvider.ts          业务装配 + capabilities
  qqTransport.ts         唯二请求出口（另有一处直连 musicu，文档里写明了原因）
  qqNormalize.ts         上游字段 → UnifiedSong
  qqLists.ts             列表页
  qqExplore.ts           探索页
  qqRecommendations.ts   推荐 / FM
  qqMutations.ts         红心、歌单增删
  qqAccount.ts           账号读取
  qqSessionRefresh.ts    会话刷新
  qqLyricProvider.ts     歌词（含直连匿名接口）
  qqPreview.ts           试听片段
  qqSongDetail.ts        按 id 查歌
  qishui/qrcDecrypt.ts   此类：歌词/图片加密格式解密
  qqFailure.ts           平台码 → 通用失败事实
  qqLoginFailure.ts
  qqLoginDiagnostics.ts
  qqBackendDeclaration.ts 后端能力声明
```

**十四个文件听起来多，但每个都很薄**，好处是"上游改了答复只改 normalize，平台换了签名只改 transport"。
我们现在是 `qq.js` **85.9 KB 单文件**，`netease.js` 37 KB，任何一处改动都要读全文件。

---

## 5. 接入一个新平台的官方清单（他们的 7 步）

来自 `src/services/onlineMusic/README.md:57-73`，可直接当我们下一阶段的任务书：

1. `foo/fooTransport.ts`：平台原始请求只在这里发，错误换成 `OnlineProviderError('foo')`。
2. `foo/fooProvider.ts`：导出 `OnlineMusicProvider`，**`capabilities` 开关必须与实际实现的成员一一对应**（界面很多地方只看开关）。
3. 每首歌带 `sourceRef`，每个集合带 `providerId`。
4. `providerRegistry.ts` 里 `registerOnlineMusicProvider(fooProvider)`——唯一平台清单。
5. 有登录的：实现 `startLogin` / `checkLogin`，再在 `createQr` 与 `openLoginPage` 里选一个；文案键三份语言文件都要写。
6. 两个架构测试要认得新平台（`omniArchitecture.test.ts` 的 `forbiddenImport`、`platformNameCount.ts` 的 `PLATFORM_NAMES`）。
7. 逻辑测试放 `test/unit/foo/`：归一化、翻页、错误答复，用最小真实答复做数据。

只在桌面端跑的：额外 6 步（`electron/foo/fooApiBridge.cjs` → `main.cjs` 注册 IPC + 可信窗口校验 → `preload.cjs` → `vite-env.d.ts` → transport 判断 `window.electron?.fooRequest` → 媒体请求头登记）。

---

## 6. 我们 vs 它：差距表

| 维度 | Folia | 我们（现状） | 差距影响 |
|---|---|---|---|
| 音源数量 | 7（网易云/酷狗/QQ/汽水/波点/Spotify/YTM） | 2（网易云自研 + QQ 用包） | 少 5 个 |
| 上游来源 | 全部第三方包（除 Spotify/YTM） | QQ 用包；**网易云自己拼 HTTP** | 网易云要自己跟协议变化 |
| 契约形态 | 类型化 `OnlineMusicProvider` + 20 项能力开关 | 方法名字符串白名单（`onlineSource.js`） | 表达不了"能读不能写"这类退化 |
| 模块边界 | 平台目录内 14 个文件；UI 禁 import transport（单测强制） | `qq.js` 85.9 KB / `netease.js` 37 KB 单文件 | 改动成本、审查成本都高 |
| 强制 `sourceRef` | 有，缺失按网易云处理（明确写了） | `track.source` 有字段，无校验 | 新源漏写 = 串源 |
| 失败处理 | 两层分类 + 时限 + 冷却 + 提示文案分离 | 一句 error 文本 | 用户看到"无可用音源（result=xxx）" |
| 登录 | 两种形态 + 自检 + 诊断报告 + 会话刷新 | 扫码/ Cookie / OAuth 三条各自实现 | 刚出过"token 有 cookie 无"的坑 |
| IPC | 每平台一通道 + 操作白名单 + 可信窗口校验 | 单通道 `src:invoke` + 方法名 | 粒度粗，但安全边界已有 |
| 凭据 | safeStorage，永不出主进程 | cookie sealed（`sources/*.json`），不出主进程 | 基本对齐 ✓ |
| 网页版 | 有（Vercel / CF Worker，服务部署） | 无（纯桌面） | 不影响我们，可不做 |
| 测试 | 架构测试 + 契约测试 + 平台目录名计数 | `test:security` / `test:lyrics` / 我新加的 `test:qq` | 缺"架构约束"类测试 |

---

## 7. 对标改造路线（按性价比排序，不动协议）

### P0 · 零协议风险，1-2 天，立刻可做

**① 把 `caps` 从字符串数组升级成能力对象**
- 改 `app/main/sources/onlineSource.js`：`REQUIRED`/`OPTIONAL` 保留（向后兼容），新增 `CAPABILITIES` 语义表：
  `search / playback / lyrics / auth / likes / likeState / playlists / playlistTracks / daily / radio / tops / explore / exploreTracks / personalFm / wordByWordLyrics`。
- `normalize()` 同时返回 `{ caps: string[], capabilities: {...} }`，`caps` 由 `capabilities` 推导，旧调用方零改动。
- 验收：`npm run check` + 现有界面不回归（在线页/收藏页冒烟）。

**② 给 `track.source` 加硬校验**
- 在 `app/main/sources/index.js` 的 `src:resolve` / `src:invoke` 出口处断言：`track.source === 当前源 id`，否则报 `source-mismatch`。
- 验收：故意改错一首歌的 source，确认被拦住（写进 `tools/test-sources-contract.mjs`）。

**③ 新建 `app/main/sources/qq/` 目录，先只搬 normalize**
- 把 `toTrack` / `playlistOf` / `dissFromPkg` / `singerNames` 挪到 `qq/qqNormalize.js`，`qq.js` 顶部 require 回来。
- **不要一次搬完**：每搬一组跑一次 `npm run test:qq`（7 项映射断言已覆盖），绿了再搬下一组。
- 验收：`npm run verify` 全绿，`qq.js` 行数下降。

### P1 · 3-5 天，接第三个源来验证抽象

**④ 接汽水音乐（`qishui-music-api` 0.2.2，npm 有、MIT）**
这是最划算的第三源：
- 它只用**扫码授权**（不需要 cookie 注入），帮我们把"登录抽象"这一层逼出来；
- 它的能力边界很清晰（只播未加密地址、收藏写入关闭），正好检验"能力开关"能不能表达退化；
- 桌面桥只需要 3 个文件（照 `electron/qishui/` 的形状：bridge + session + mediaCors）。

步骤：`app/package.json` 加依赖（**这条要你拍板，破"不新增依赖"红线**）→
`app/main/sources/qishui.js`（provider）→ 按 P0 的契约声明 capabilities → 界面按 caps 显示。
验收：搜索、播放、歌词、"我喜欢"、歌单读取各跑一次真号；`tools/test-qishui-contract.mjs` 断言 caps 与实际方法一致。

### P2 · 失败可读性（2-3 天，用户能直接感知）

**⑤ 失败分类两层 + 时限 + 冷却**
- 新文件 `app/main/sources/failure.js`（不认识任何平台）：`{ code: 'unauthenticated' | 'no-copyright' | 'vip-only' | 'rate-limited' | 'network' | 'upstream-error', retryAfterMs?, detail? }`。
- 平台侧 `qq.js`/`netease.js` 的 `resolve` 返回这个结构（保留 `error` 字符串给旧界面）。
- 界面按 `code` 给按钮：`unauthenticated` → 打开登录；`rate-limited` → 显示"X 秒后重试"并真的在到点前不再请求。
- 验收：断网 / 登出 / 播 VIP 歌 三种情况各触发一次，确认提示与冷却生效。

### P3 · 可选，看你要不要

- **酷狗**：非 npm（GitHub tarball），加进来要改锁文件策略，收益是曲库覆盖，成本是供应链风险 → 建议先不做。
- **网易云换 `@neteasecloudmusicapienhanced/api` 4.41.1**：我们现在自研 37 KB 的 `netease.js`，换成包能少维护一套协议，但要重写登录/扫码/播放地址三段（我们刚在那上面花过力气）→ 只有等自研版开始频繁坏的时候再换。
- **平台名出现次数测试**：Folia 有 `platformNameCount.ts`，强制"平台名只能出现在它自己的目录 + 登记过的接入点"。我们可以在 `tools/check-layers.mjs` 里加一条同类的（成本低，防止平台名漏进 `shell.js`）。
- **架构测试**：把 `tools/check-layers.mjs` 扩一条"渲染层不准 require `app/main/sources/*`"，防止绕过 IPC 直连。

---

## 8. 现在就能动的一件事

不改任何协议的前提下，**今天就能做**：`onlineSource.js` 的 caps 升级（P0-①）+ `source` 校验（P0-②）。
两条都不碰网络，只改契约与断言，`npm run verify` 能全部覆盖，做完之后接第三个源才不会重蹈"方法存在但能力不对"的坑。

---

## 9. 红线与风险

1. **AGPL-3.0**：`tools/refs/folia/` 只能读思路，**一行代码都不能搬**（该目录已在 `.gitignore`，但仍要守住）。
   本文所有结构描述都是"用我们自己的话重述设计"，未复制其代码。
2. **第三方包许可证要逐个确认**：`qishui-music-api` MIT、`bodian-music-api` 需查、`@yakult-green-tea/qq-music-api` 需查、
   `@neteasecloudmusicapienhanced/api` 需查（该系列历史上是 MIT，但 fork 版要确认）。接之前把 LICENSE 写进 `docs/09` §依赖清单。
3. **钉版本 + 锁文件**：Folia 的做法是"根 `package.json` 钉死 + 各自锁文件"，升级时两处一起改。我们现在只有一处，简单。
4. **包被弃维护怎么办**：Folia 的兜底是"桌面端自己起本地服务 / Docker 镜像打补丁"。
   我们的兜底应该是"协议层留在一个文件里（transport），包挂了可以换成自研 HTTP 而不动 provider"——这正是 P0-③ 拆目录的意义。
5. **不新增运行时依赖**是 `AGENTS.md` 的红线，P1 接汽水前需要明确批准，并同步 `app/package.json` + 锁文件。

---

## 10. 验收清单（改完照这个走）

- [ ] `npm run verify` 全绿（含 `test:qq`、`test:cover`、`test:security`）
- [ ] 在线页 / 收藏页 / 歌单页 / 电台页冒烟全绿（`test:online` `test:favorites` `test:playlists` `test:radio`）
- [ ] 真号回归：扫码登录 → 昵称显示 → 每日推荐 30 首 → 收藏红心能点 → 歌单能点开 → 播放地址能拿到 → 歌词能出来
- [ ] 新增平台后：关掉它的依赖包，界面显示"该音源不可用"而不是 500
- [ ] 断网时：提示是"连不上"而不是"无可用音源（result=xxx）"
