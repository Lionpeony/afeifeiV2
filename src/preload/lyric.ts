import { contextBridge, ipcRenderer } from "electron";

/**
 * 桌面歌词窗的桥——**只暴露 4 个方法**（迷你窗同款纪律）：
 * 收投影、发意图、关窗、申请改窗高。歌词窗是投影的第二个消费者，没有状态可写。
 */
contextBridge.exposeInMainWorld("lyricApi", {
  onState: (cb: (json: string) => void): void => {
    ipcRenderer.on("lyric:state", (_e, json: unknown) => {
      if (typeof json === "string") cb(json);
    });
  },
  action: (a: string): void => ipcRenderer.send("lyric:action", a),
  close: (): void => ipcRenderer.send("lyric:close"),
  /** 字号放大 / 译文出现后内容会超高，渲染层量完报主进程改窗高（2026-11-10 修裁字 BUG） */
  resize: (px: number): void => ipcRenderer.send("lyric:resize", px),
});
