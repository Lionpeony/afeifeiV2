/**
 * 响度均衡偏好（P0 #8）：界面层 localStorage，与其它 af 偏好同一前缀。
 * 写入时广播一个 DOM 事件，bootstrap 监听后把开关交给 AudioEngine。
 */

const KEY = "afeifei.v42.leveler";
export const LEVELER_CHANGE_EVENT = "afeifei:leveler-change";

export function readLevelerPref(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function writeLevelerPref(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "true" : "false");
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent<boolean>(LEVELER_CHANGE_EVENT, { detail: on }));
}
