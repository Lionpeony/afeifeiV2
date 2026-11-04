---
name: 先抄参考实现再自研
description: 接第三方包/平台功能时，先完整照抄参考播放器（folia-major 等）的实现，跑通后再做自己的抽象，能极大加快开发速度
type: feedback
---

接任何第三方能力（登录态、加密、音源 API）时，**第一步是找到参考播放器里对应的那份实现并完整照抄**，跑通之后才考虑按本项目架构改造。「先自己理解协议再手写」的路线在 2026-11-03 的 QQ 登录上多花了两轮返工。

**Why:** QQ 音乐登录的教训：自己猜「包会全局管理会话」，实际包按 `?cookie=` 里的 token 找会话；Folia 的 `qqTransport.ts` 十几行就把 token 收割/携带/持久化写清了。同理：weapi RSA 公钥抄错一个字符、QRC 解密逆置换抄错一处——这些 1:1 移植的坑，参考源码里都是现成答案。

**How to apply:** 动手前先在 `F:\AI\mp-refs` 里搜同类功能的实现（2026-11-04 起为固定位置，含 11 个仓库：folia-major / lx-music-desktop / SPlayer / MusicFreeDesktop / YesPlayMusic / nuclear / museeks / Mineradio / vynody / tauri-rmusic / Twilight_Echo，均为 --depth 1 浅克隆；旧的 Temp\mp-refs 已废弃）；照抄时逐字符对拍（密钥、常量表、位运算尤其如此）；抄通后只做「换成本项目架构」的最小改造，不重写逻辑。
