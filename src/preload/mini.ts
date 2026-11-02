import { contextBridge, ipcRenderer } from "electron";

/**
 * 迷你窗的桥——**只暴露 3 个方法**（50 §7.4 对第二窗口的纪律）：
 * 收投影、发意图、关窗。没有状态可写，迷你窗是投影的第二个消费者。
 */
contextBridge.exposeInMainWorld("miniApi", {
  onState: (cb: (json: string) => void): void => {
    ipcRenderer.on("mini:state", (_e, json: unknown) => {
      if (typeof json === "string") cb(json);
    });
  },
  action: (a: string): void => ipcRenderer.send("mini:action", a),
  close: (): void => ipcRenderer.send("mini:close"),
});
