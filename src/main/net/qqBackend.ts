/**
 * QQ 音乐后端（M6.1 P1）：本地拉起 `@yakult-green-tea/qq-music-api`（MIT，Folia 同款）。
 *
 * 该包 require 即启动 Koa 服务（`server` 导出用于确认绑定）；
 * 登录扫码（MQTT/HTTP 双通道）、登录态、播放地址全由它内部完成。
 * 我们只做三件事：
 *   ① 注入会话仓库（`configureAuthSessionRepository`，同步 KV 文件，登录态跨重启保留）
 *   ② 把服务地址暴露给 qqClient（渲染层契约不变）
 *   ③ **凭据永不进日志**（00 §10.2）——会话文件由包自己管理，我们只存取整包 JSON
 *
 * 端口固定 3210（`QQ_API_PORT` 可覆盖）：只绑 localhost 语义由包内部决定，
 * 我们不对外暴露。端口被占时服务启动失败 → QQ 功能报错，主流程不受影响。
 */
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../paths.js";
import { log } from "../log/index.js";

export const QQ_API_PORT = Number(process.env.QQ_API_PORT ?? 3210);
export const qqApiUrl = (): string => `http://127.0.0.1:${QQ_API_PORT}`;

/* 不能放 dataDir()/cache：Windows 大小写不敏感，和 Chromium 的 Cache/ 是同一目录，
 * 应用退出时会被当缓存清掉 —— 表现就是「登录过，重启后登录态没了」。
 * 与 qq-session-token.json 一样放根目录。 */
const SESSION_FILE = (): string => path.join(dataDir(), "qq-auth-sessions.json");

/** 同步会话仓库：包要求 require 后立即注入，fs 同步实现最直接（文件小、频次低）。 */
function makeSessionRepository(): {
  kind: string;
  load: () => unknown;
  save: (sessions: readonly unknown[]) => void;
} {
  const load = (): unknown => {
    try {
      const text = fs.readFileSync(SESSION_FILE(), "utf8");
      const sessions = JSON.parse(text) as unknown;
      log("info", `[qq] 会话仓库读盘：${Array.isArray(sessions) ? sessions.length : 0} 条`);
      return sessions;
    } catch {
      return [];
    }
  };
  return {
    kind: "electron-kv",
    load,
    save(sessions) {
      try {
        fs.mkdirSync(path.dirname(SESSION_FILE()), { recursive: true });
        fs.writeFileSync(SESSION_FILE(), JSON.stringify(sessions), "utf8");
        log("info", `[qq] 会话仓库写盘：${sessions.length} 条`);
      } catch (err) {
        log("warn", `[qq] 会话写盘失败：code=${(err as NodeJS.ErrnoException).code ?? "unknown"}`);
      }
    },
  };
}

let started = false;

/** require 前必须完成环境变量与仓库注入。返回是否成功（失败 = 端口占用等原因，QQ 功能降级）。 */
export function startQqBackend(): boolean {
  if (started) return true;
  process.env.PORT = String(QQ_API_PORT);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require("@yakult-green-tea/qq-music-api") as {
    configureAuthSessionRepository: (r: unknown) => void;
    server: { address: () => { port: number }; on: (e: string, cb: () => void) => void } | null;
  };
  pkg.configureAuthSessionRepository(makeSessionRepository());
  try {
    if (pkg.server) {
      pkg.server.on("error", () => log("warn", "[qq] QQ API 服务端口异常，QQ 功能不可用"));
      log("info", `[qq] QQ API 服务已启动 @ 127.0.0.1:${pkg.server.address().port}`);
    }
    started = true;
    return true;
  } catch (err) {
    log("warn", `[qq] QQ API 服务启动失败：${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
