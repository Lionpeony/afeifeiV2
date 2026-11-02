/**
 * 下载的系统调用（M7）：把一个 URL 流式写到指定文件。
 *
 * 只做系统调用，不知道"任务""队列"是什么（00 §2.1——下载是业务，在环 1）。
 * 断点续传：`<destPath>.part` 是续传依据（启动/暂停留下的半成品），
 * 本函数每次自动从 .part 的实际大小续（Range 头），完成后原子 rename 成 destPath。
 * 上游不支持 Range（回 200）时自动从头来。
 */
import fs from "node:fs";
import path from "node:path";
import { net } from "electron";
import { log } from "../log/index.js";

const cancels = new Map<string, AbortController>();

/** 中止进行中的下载。.part 保留，下次 fetch 续传。未知 id 静默成功。 */
export function cancelFetch(taskId: string): void {
  cancels.get(taskId)?.abort();
}

/** 目录内全部文件的总字节数（含 .part）。目录不存在算 0。 */
export async function dirUsage(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    try {
      const st = await fs.promises.stat(path.join(dir, e.name));
      total += st.size;
    } catch {
      /* 竞态下文件消失，不计 */
    }
  }
  return total;
}

export async function fetchToFile(
  taskId: string,
  url: string,
  destPath: string,
  onProgress: (received: number, total: number) => void,
): Promise<{ bytes: number; resumed: boolean }> {
  if (!/^https?:\/\//i.test(url)) throw new Error("非法下载地址");
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

  const part = `${destPath}.part`;
  // 续传以 .part 的真实大小为准（渲染层的 received 可能落后于磁盘）
  let from = 0;
  try {
    from = (await fs.promises.stat(part)).size;
  } catch {
    from = 0;
  }

  const ac = new AbortController();
  cancels.set(taskId, ac);
  try {
    const res = await net.fetch(url, {
      headers: from > 0 ? { range: `bytes=${from}-` } : {},
      signal: ac.signal,
    });
    if (!res.ok && res.status !== 206) throw new Error(`上游返回 ${res.status}`);
    // 服务器不理 Range（回 200）：从头来
    const start = res.status === 206 ? from : 0;
    const total = start + Number(res.headers.get("content-length") ?? 0);
    if (!res.body) throw new Error("上游没有返回内容");

    const out = fs.createWriteStream(part, { flags: start > 0 ? "a" : "w" });
    let received = start;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (!out.write(Buffer.from(value))) {
        await new Promise<void>((r) => out.once("drain", r));
      }
      onProgress(received, total > 0 ? total : received);
    }
    await new Promise<void>((resolve, reject) => {
      out.end(() => resolve());
      out.on("error", reject);
    });

    // 原子落盘：.part → destPath（Windows 上 rename 不覆盖已存在目标，先清）
    await fs.promises.rm(destPath, { force: true });
    await fs.promises.rename(part, destPath);
    log("info", `[download] ${path.basename(destPath)} 完成（${received} 字节${start > 0 ? "，续传" : ""}）`);
    return { bytes: received, resumed: start > 0 };
  } catch (err) {
    // 中止不是错误：.part 留着，下次续传
    if ((err as Error).name === "AbortError") throw new Error("已取消");
    throw err;
  } finally {
    cancels.delete(taskId);
  }
}
