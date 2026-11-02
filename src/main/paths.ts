import path from "node:path";
import { app } from "electron";

/**
 * 全仓库唯一计算数据目录的地方（51 §1.7）。
 * 便携版必须跟随 exe：electron-builder 的 portable 目标注入 PORTABLE_EXECUTABLE_DIR，
 * 否则数据会写到 %APPDATA%，用户拷走 exe 后队列/歌单/登录全丢。
 */
export function dataDir(): string {
  const portable = process.env.PORTABLE_EXECUTABLE_DIR;
  return portable ? path.join(portable, "data") : app.getPath("userData");
}
