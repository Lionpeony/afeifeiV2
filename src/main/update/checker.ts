/**
 * 更新检查（M8）：启动 30s 后拉一次 GitHub Releases 的 latest，
 * 比当前新就推给渲染层——**状态栏一条提示，不弹窗**（docs/04 M8 走偏表）。
 * 用户确认后由渲染层走 `app:openExternal`（白名单域）打开发布页。
 *
 * 不引 electron-updater（依赖白名单纪律 + 我们的场景一个提示就够，00 §17 #9 只禁静默安装）。
 * 网络差 / 仓库没配 / 拉取失败：全部静默——"无新版本零打扰"。
 */
import { app, net } from "electron";
import { log } from "../log/index.js";
import { isNewer } from "./semver.js";

/** 发版仓库。换仓库改这里（或用 AFEIFEI_UPDATE_REPO 覆盖）。 */
const REPO = process.env.AFEIFEI_UPDATE_REPO ?? "Lionpeony/afeifei";

export function startUpdateCheck(sender: { isDestroyed(): boolean; send(channel: string, data: unknown): void }): void {
  setTimeout(() => {
    if (sender.isDestroyed()) return;
    void (async () => {
      try {
        const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { "user-agent": "afeifei-update-check" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return;
        const j = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
        const latest = typeof j.tag_name === "string" ? j.tag_name.replace(/^v/, "") : "";
        const url = typeof j.html_url === "string" ? j.html_url : "";
        if (!latest || !url || !isNewer(latest, app.getVersion())) return;
        log("update", `发现新版本 ${latest}（当前 ${app.getVersion()}）`);
        if (!sender.isDestroyed()) sender.send("update:available", { version: latest, url });
      } catch {
        /* 拉取失败 = 零打扰 */
      }
    })();
  }, 30_000);
}
