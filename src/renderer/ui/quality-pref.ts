import type { Quality } from "../../contracts/capability.js";

/**
 * 播放音质的单一读取口（P0 #7）：设置页写的是四档偏好，取流链路只认三档。
 * bootstrap 的 resolver、下载器、迷你窗都读这一处，别各自写死 "320k"。
 * 存储键与 af/prefs 的 usePref("quality") 同源。
 */

export type QualityPref = "standard" | "hq" | "lossless" | "hires";

const KEY = "afeifei.v42.quality";

export function readQualityPref(): QualityPref {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return "hq";
    const parsed = JSON.parse(raw) as unknown;
    return parsed === "standard" || parsed === "hq" || parsed === "lossless" || parsed === "hires" ? parsed : "hq";
  } catch {
    return "hq";
  }
}

/** 四档偏好 → 契约里的三档（无损与 Hi-Res 都按 FLAC 请求，上游给不到会自动降级）。 */
export function toWireQuality(pref: QualityPref): Quality {
  return pref === "standard" ? "128k" : pref === "hq" ? "320k" : "flac";
}

export function activeQuality(): Quality {
  return toWireQuality(readQualityPref());
}
