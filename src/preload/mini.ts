import { contextBridge, ipcRenderer } from "electron";

/**
 * 迷你窗的桥——**只暴露 5 个方法**（50 §7.4 对第二窗口的纪律）：
 * 收投影、发意图、关窗、就绪信号、收补推信号。没有状态可写，迷你窗是投影的第二个消费者。
 */
contextBridge.exposeInMainWorld("miniApi", {
  onState: (cb: (json: string) => void): void => {
    ipcRenderer.on("mini:state", (_e, json: unknown) => {
      if (typeof json === "string") cb(json);
    });
  },
  action: (a: string): void => ipcRenderer.send("mini:action", a),
  close: (): void => ipcRenderer.send("mini:close"),
  /** 挂载完喊一声：主窗桥收到会立刻补推一次当前状态（暂停下开窗不再挂"未在播放"） */
  ready: (): void => ipcRenderer.send("mini:ready"),
  onHello: (cb: () => void): void => {
    ipcRenderer.on("mini:hello", () => cb());
  },
});
