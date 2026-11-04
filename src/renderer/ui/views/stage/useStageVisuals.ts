import { useEffect, useRef } from "react";
import type { StagePreset } from "../../../../contracts/index.js";
import { onTick } from "../../compositor.js";
import { barHeights } from "./spectrum.js";
import { ringGeom } from "./visuals.js";
import { spectrumPower } from "./machi/adapter.js";

const SPECTRUM_BARS = 48;

export function useStageVisuals({
  rootRef, enabled, mode, preset, intensity, spectrum, machi,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  mode: "bars" | "wave" | "ring" | "machi";
  preset: StagePreset;
  intensity: 0 | 1 | 2;
  spectrum(bins: number): number[] | null;
  machi?: { setTime(value: number): void; setPower(value: number): void };
}) {
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const ink = useRef("");
  useEffect(() => {
    const root = rootRef.current;
    if (root) ink.current = getComputedStyle(root).color;
  }, [preset]);
  useEffect(() => onTick((time) => {
    if (preset === "cinema" && intensity > 0) {
      const currentPos = current.current;
      const next = target.current;
      if (Math.abs(currentPos.x - next.x) > 0.05 || Math.abs(currentPos.y - next.y) > 0.05) {
        currentPos.x += (next.x - currentPos.x) * 0.12;
        currentPos.y += (next.y - currentPos.y) * 0.12;
        const image = rootRef.current?.querySelector<HTMLImageElement>(".st-cover-img");
        if (image) image.style.transform = `translate(${currentPos.x.toFixed(2)}px, ${currentPos.y.toFixed(2)}px)`;
      }
    }
    if (!enabled) return;
    if (mode === "machi") {
      machi?.setTime(time / 1000);
      machi?.setPower(spectrumPower(spectrum(24) ?? []));
      return;
    }
    const canvas = rootRef.current?.querySelector<HTMLCanvasElement>(".st-spectrum");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const bars = barHeights(spectrum(SPECTRUM_BARS), SPECTRUM_BARS, canvas.height);
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!ink.current) return;
    context.fillStyle = ink.current;
    context.strokeStyle = ink.current;
    context.globalAlpha = 0.55;
    const width = canvas.width / SPECTRUM_BARS;
    if (mode === "ring") {
      const geometry = ringGeom(canvas.width, canvas.height);
      if (geometry.lenMax > 0) {
        context.lineWidth = Math.max(1.5, width * 0.6);
        for (let index = 0; index < bars.length; index += 1) {
          const length = (bars[index] / (canvas.height * 0.9)) * geometry.lenMax;
          if (length <= 0) continue;
          const angle = (index / bars.length) * Math.PI * 2 - Math.PI / 2;
          context.beginPath();
          context.moveTo(geometry.cx + Math.cos(angle) * geometry.r0, geometry.cy + Math.sin(angle) * geometry.r0);
          context.lineTo(geometry.cx + Math.cos(angle) * (geometry.r0 + length), geometry.cy + Math.sin(angle) * (geometry.r0 + length));
          context.stroke();
        }
      }
    } else {
      bars.forEach((height, index) => {
        if (height <= 0) return;
        context.fillRect(index * width + 1, mode === "wave" ? (canvas.height - height) / 2 : canvas.height - height, width - 2, height);
      });
    }
    context.globalAlpha = 1;
  }), [enabled, mode, preset, intensity, spectrum, machi]);

  const onMouseMove = (event: React.MouseEvent<HTMLElement>): void => {
    if (preset !== "cinema" || intensity === 0) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    target.current = { x: (event.clientX / rect.width - 0.5) * 16, y: (event.clientY / rect.height - 0.5) * 16 };
  };
  return { rootRef, onMouseMove };
}
