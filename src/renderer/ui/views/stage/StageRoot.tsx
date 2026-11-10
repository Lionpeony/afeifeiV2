import type { ReactNode } from "react";
import { useEffect } from "react";
import type { AppState } from "../../../../contracts/index.js";
import { LIVE_PRESETS, PRESETS, STAGE_TOKEN_KEYS } from "./presets.js";

export function StageRoot({ state, wallPaperUrl, rootRef, live, children }: {
  state: AppState;
  wallPaperUrl: string | null;
  rootRef: React.RefObject<HTMLElement | null>;
  /** 直播壳：场景层改穿直播灯位，纸面预设的底色不带进来。 */
  live: boolean;
  children: ReactNode;
}) {
  const stage = state.stage;
  const preset = PRESETS.find((item) => item.id === stage.preset) ?? PRESETS[0];
  const lighting = LIVE_PRESETS[preset.id];
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // 顺序即优先级：纸面/影院预设 → 直播灯位 → 导入主题（用户自己选的永远最后落）
    const merged = { ...preset.tokens, ...(live ? lighting.tokens : {}), ...(stage.customTokens ?? {}) };
    for (const key of STAGE_TOKEN_KEYS) root.style.removeProperty(key);
    for (const [key, value] of Object.entries(merged)) root.style.setProperty(key, value);
  }, [preset, lighting, live, stage.customTokens, rootRef]);
  return <section ref={rootRef} className={`stage preset-${stage.preset} skin-${stage.skin}${live ? " is-live" : ""}`}
      data-tone={stage.tone} style={{ "--stage-wallpaper-img": wallPaperUrl ? `url(${JSON.stringify(wallPaperUrl)})` : "none" } as React.CSSProperties}>{children}</section>;
}
