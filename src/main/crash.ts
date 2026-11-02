/**
 * 崩溃兜底（M8）：主进程未捕获异常 / 渲染进程异常退出 → `logs/crash-*.log`。
 *
 * 文件里带版本、时间、种类与堆栈；下次启动 `lastCrash()` 找最新一份，
 * 配合 `markCrashSeen()` 实现「提示过一次就不再烦」。
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { dataDir } from "./paths.js";

const crashDir = (): string => path.join(dataDir(), "logs");

function writeCrash(kind: string, detail: unknown): void {
  try {
    const file = path.join(crashDir(), `crash-${Date.now()}.log`);
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          version: app.getVersion(),
          at: new Date().toISOString(),
          kind,
          detail: detail instanceof Error ? detail.stack : String(detail ?? ""),
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    /* 崩溃记录写失败就算了——不能再崩回去 */
  }
}

/** 在 app ready 之前装。进程级钩子只装一次。 */
export function installCrashGuard(): void {
  process.on("uncaughtException", (err) => {
    writeCrash("main-uncaught", err);
  });
  app.on("render-process-gone", (_e, _wc, details) => {
    writeCrash("renderer-gone", `reason=${details.reason}`);
  });
}

export interface CrashRecord {
  at: string;
  kind: string;
  file: string;
}

/** 最新的、还没被提示过的崩溃记录；没有或已提示过返回 null。 */
export function lastCrash(): CrashRecord | null {
  let files: string[];
  try {
    files = fs
      .readdirSync(crashDir())
      .filter((f) => /^crash-\d+\.log$/.test(f))
      .sort();
  } catch {
    return null;
  }
  const newest = files[files.length - 1];
  if (!newest) return null;
  const seenPath = path.join(crashDir(), "crash-seen.json");
  try {
    const seen = JSON.parse(fs.readFileSync(seenPath, "utf8")) as { file?: string };
    if (seen.file === newest) return null; // 上次启动已经提示过
  } catch {
    /* 没有记录 = 没提示过 */
  }
  try {
    const j = JSON.parse(fs.readFileSync(path.join(crashDir(), newest), "utf8")) as {
      at?: string;
      kind?: string;
    };
    return { at: typeof j.at === "string" ? j.at : "", kind: typeof j.kind === "string" ? j.kind : "unknown", file: newest };
  } catch {
    return { at: "", kind: "unknown", file: newest };
  }
}

/** 提示完成后调用：记下"这份已经提示过"。 */
export function markCrashSeen(file: string): void {
  try {
    fs.mkdirSync(crashDir(), { recursive: true });
    fs.writeFileSync(path.join(crashDir(), "crash-seen.json"), JSON.stringify({ file }), "utf8");
  } catch {
    /* 无声 */
  }
}
