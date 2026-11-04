import type { ReactNode } from "react";
import { useEffect } from "react";
import type { AppState } from "../../../../contracts/index.js";
import { PRESETS, STAGE_TOKEN_KEYS } from "./presets.js";

export function StageRoot({ state, wallPaperUrl, rootRef, onMouseMove, children }: {
  state: AppState;
  wallPaperUrl: string | null;
  rootRef: React.RefObject<HTMLElement | null>;
  onMouseMove(event: React.MouseEvent<HTMLElement>): void;
  children: ReactNode;
}) {
  const stage = state.stage;
  const preset = PRESETS.find((item) => item.id === stage.preset) ?? PRESETS[0];
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const merged = { ...preset.tokens, ...(stage.customTokens ?? {}) };
    for (const key of STAGE_TOKEN_KEYS) root.style.removeProperty(key);
    for (const [key, value] of Object.entries(merged)) root.style.setProperty(key, value);
  }, [preset, stage.customTokens, rootRef]);
  return <section ref={rootRef} className={`stage preset-${stage.preset} fx-${stage.intensity}`} style={{ "--stage-wallpaper-img": wallPaperUrl ? `url(${JSON.stringify(wallPaperUrl)})` : "none" } as React.CSSProperties} onMouseMove={onMouseMove}>{children}</section>;
}
