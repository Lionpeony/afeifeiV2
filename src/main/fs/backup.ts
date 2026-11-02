/**
 * 数据备份/恢复（M6.6，`docs/04`）：把 dataDir 的业务数据复制到用户选的目录。
 *
 * 备份范围：根层 `*.json`（app-state / 收藏 / 歌单 / 历史 / 用户源 / 音频配置…）
 * + `library/`（曲库快照与增量日志）。
 * **明确排除**：cookie（登录凭据，00 §10.2 精神——备份文件会离开本机）、`logs/`、`cache/`（可再生）。
 * 恢复后需重启生效（各域内存态不热刷）。
 */
import fs from "node:fs";
import path from "node:path";
import { dialog } from "electron";
import { dataDir } from "../paths.js";
import { log } from "../log/index.js";

function copyTree(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** 备份目录是否像一份备份：必须有 library/。防止用户选错目录把数据洗掉。 */
function looksLikeBackup(dir: string): boolean {
  return fs.existsSync(path.join(dir, "library"));
}

export async function exportBackup(): Promise<string | null> {
  const r = await dialog.showSaveDialog({
    defaultPath: `afeifei-backup-${new Date().toISOString().slice(0, 10)}`,
    properties: ["createDirectory"],
  });
  if (r.canceled || !r.filePath) return null;
  const src = dataDir();
  const dest = r.filePath;
  fs.mkdirSync(dest, { recursive: true });

  // 根层 json（排除凭据类）
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".json") && !/cookie/i.test(e.name)) {
      fs.copyFileSync(path.join(src, e.name), path.join(dest, e.name));
    }
    if (e.isDirectory() && e.name === "library") {
      copyTree(path.join(src, "library"), path.join(dest, "library"));
    }
  }
  log("info", `[backup] 已备份到 ${dest}`);
  return dest;
}

export async function importBackup(): Promise<{ restored: boolean } | null> {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (r.canceled || r.filePaths.length === 0) return null;
  const src = r.filePaths[0];
  if (!looksLikeBackup(src)) throw new Error("所选目录不是备份（缺 library/），已中止——不会覆盖现有数据");
  const dest = dataDir();

  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".json")) {
      fs.copyFileSync(path.join(src, e.name), path.join(dest, e.name));
    }
    if (e.isDirectory() && e.name === "library") {
      copyTree(path.join(src, "library"), path.join(dest, "library"));
    }
  }
  log("info", `[backup] 已从 ${src} 恢复，重启后生效`);
  return { restored: true };
}
