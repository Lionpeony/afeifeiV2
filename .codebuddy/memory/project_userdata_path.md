---
name: 打包前必须固定 userData 路径
description: dev 模式 userData 落在 AppData\Roaming\Electron，打包后是 Afeifei 阿飞飞，登录态/设置两边不互通
type: project
---

dev 模式（`npm start` = `electron dist/main.js`）的 userData 落在 `C:\Users\gyrfalcon\AppData\Roaming\Electron\`（netease-cookie.txt 在这里），打包便携版后变成 `Afeifei 阿飞飞\`。

**Why:** `src/main/paths.ts` 的 dataDir() 直接用 `app.getPath("userData")`，没 `app.setName` / `setPath` 固定。2026-11-03 排查网易云登录 cookie 落盘位置时踩过：按 productName 找目录扑空。

**How to apply:** 打包发布前在 main 里固定 userData 路径（`app.setPath("userData", ...)`），否则用户 dev 里的登录态、下载目录、设置全部「丢失」。另外 cookie 属敏感信息，路径相关日志不许打印其内容。
