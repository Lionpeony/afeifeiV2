import { useEffect, useRef } from "react";
import type { StageConfig } from "../../../../contracts/index.js";
import type { Track } from "../../../domain/library/schema.js";
import type { LyricDoc } from "../../../../contracts/lyric.js";
import { buildMachiTheme, buildSongContext, MachiValue, spectrumPower, zeroBands } from "./machi/adapter.js";
import { DEFAULT_MACHI_TUNING } from "./machi/types.js";
import { MachiRuntime } from "./machi/createMachiRuntime.js";

export function useMachiScene({
  enabled,
  track,
  doc,
  paused,
  config,
  coverUrl,
  spectrum,
}: {
  enabled: boolean;
  track: Track | null;
  doc: LyricDoc | null;
  paused: boolean;
  config: StageConfig;
  coverUrl: string | null;
  spectrum(bins: number): number[] | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<MachiRuntime | null>(null);
  const time = useRef(new MachiValue(0));
  const power = useRef(new MachiValue(0));
  const bands = useRef(zeroBands());

  useEffect(() => {
    if (!enabled || !host.current) return;
    const abort = new AbortController();
    let disposed = false;
    const css = getComputedStyle(host.current.closest(".stage") ?? host.current);
    void MachiRuntime.create({
      host: host.current,
      song: buildSongContext(track, doc),
      theme: buildMachiTheme({
        bg: css.getPropertyValue("--stage-bg").trim(),
        fg: css.getPropertyValue("--stage-fg").trim(),
        accent: css.getPropertyValue("--stage-accent").trim(),
        dim: css.getPropertyValue("--stage-fg-dim").trim(),
        line: css.getPropertyValue("--stage-line").trim(),
      }, config.intensity),
      tuning: { ...DEFAULT_MACHI_TUNING, motion: config.intensity > 0 },
      renderQuality: { scale: 1, antialias: "auto" },
      currentTime: time.current,
      audioPower: power.current,
      audioBands: bands.current,
      paused,
      staticMode: false,
      showText: true,
      previewMode: false,
      transparent: false,
      fallbackIcons: [],
      onContextLost: () => console.warn("[machi] webgl context lost"),
      signal: abort.signal,
    }).then((instance) => {
      if (disposed) instance.destroy();
      else { runtime.current = instance; instance.setPaused(paused); }
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error("[machi] create failed", error);
    });
    return () => {
      disposed = true;
      abort.abort();
      runtime.current?.destroy();
      runtime.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled) runtime.current?.swapSong(buildSongContext(track, doc));
  }, [enabled, track, doc]);
  useEffect(() => { if (enabled) runtime.current?.setPaused(paused); }, [enabled, paused]);
  useEffect(() => {
    if (!enabled || !host.current) return;
    const css = getComputedStyle(host.current.closest(".stage") ?? host.current);
    runtime.current?.setTheme(buildMachiTheme({
      bg: css.getPropertyValue("--stage-bg").trim(),
      fg: css.getPropertyValue("--stage-fg").trim(),
      accent: css.getPropertyValue("--stage-accent").trim(),
      dim: css.getPropertyValue("--stage-fg-dim").trim(),
      line: css.getPropertyValue("--stage-line").trim(),
    }, config.intensity));
  }, [enabled, config, coverUrl]);

  return {
    host,
    setTime: (value: number) => time.current.set(value),
    setPower: (value: number) => power.current.set(value),
    sample: () => spectrumPower(spectrum(24) ?? []),
  };
}
