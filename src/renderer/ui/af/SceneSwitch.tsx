/* 换景 v3：全站页面 / 换源 / 换主题共用的「分镜横移」。
   一张带墨边与网点边的纸从来的方向扫进，盖满后停 40ms 再换内容，
   最后往去的方向扫出；页面只在自己那侧移 12px 落位。 */
import type { ReactNode } from "react";

export type SceneKind = "page" | "source" | "theme" | "stage";
export type ScenePhase = "close" | "hold" | "open";

export interface SceneInfo {
  kind: SceneKind;
  label: string;
  sub?: string;
  phase: ScenePhase;
  tone?: string;
  /** 方向：r = 去右边，纸从左侧扫入；l = 去左边，纸从右侧扫入。 */
  dir?: "l" | "r";
  /** 覆盖范围：page 只盖内容区，full 盖满窗口 */
  inset?: "content" | "full";
}

export function SceneSwitch({ scene }: { scene: SceneInfo | null }): ReactNode {
  if (!scene) return null;
  return (
    <div
      className={[
        "scene",
        "scene--" + scene.kind,
        "scene--" + scene.phase,
        "scene--dir-" + (scene.dir ?? "l"),
        scene.inset === "content" ? "scene--content" : "scene--full",
      ].join(" ")}
      style={{ ["--scene-tone" as string]: scene.tone ?? "var(--pink-600)" }}
      aria-hidden="true"
    >
      <span className="scene__band" />
    </div>
  );
}
