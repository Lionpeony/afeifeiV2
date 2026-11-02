import { useEffect, useRef, useState } from "react";
import type { LyricDoc, RemoteTrack } from "../../../../contracts/capability.js";
import type { AppState, StageLayer } from "../../../../contracts/index.js";
import { dispatch } from "../../../kernel/index.js";
import { onTick } from "../../compositor.js";
import { karaokeState, minimalState, pressState, theatricalState } from "./lyric-state.js";
import { LAYER_KEYS, PRESETS } from "./presets.js";

const LINE_H = 36; // press / theatrical 的固定行高（px），与 stage.css 一致
const SPECTRUM_BARS = 48; // 电影感预设的频谱柱数（50 §9.2）

export interface StageViewProps {
  state: AppState;
  /** 本地曲目封面（160px dataURL，带缓存）。在线曲目走 remote.coverUrl。 */
  cover(trackId: string): Promise<string | null>;
  lyric(sourceId: string, songId: string): Promise<LyricDoc>;
  spectrum(bins: number): number[] | null;
}

const fmt = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** karaoke 的字拆分：优先逐字数据，没有就按字符拆（逐行进度兜底）。 */
function karaChars(doc: LyricDoc, lineIndex: number): string[] {
  const words = doc.words.filter((w) => w.line === lineIndex);
  if (words.length > 0) return words.map((w) => w.char);
  return [...(doc.lines[lineIndex]?.text ?? "")];
}

/**
 * 播放页（M4）：五层按 z 收口（50 §9.2）。
 *   L-a 壁纸 0 / L-b 视觉 1 / L-c 封面 2（不可关）/ L-d 歌词 3 / L-e 控件 4（不可关）。
 * 切预设 = 换一组场景层 token，不重建 store、不重解码封面 —— 控件层不位移。
 * 每帧只写 transform / opacity / --p（合成器友好），不动布局属性。
 */
export function StageView({ state, cover, lyric, spectrum }: StageViewProps) {
  const { player, stage } = state;
  const preset = PRESETS.find((p) => p.id === stage.preset) ?? PRESETS[0];
  const rootRef = useRef<HTMLDivElement>(null);
  const lyricListRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastActiveRef = useRef(-999);

  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [doc, setDoc] = useState<LyricDoc | null>(null);
  const [lyricNote, setLyricNote] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const remote = player.remote;
  const title = player.trackTitle ?? player.trackId ?? "未在播放";
  const renderer = stage.lyricRenderer;

  /* ---- 预设 token：只写场景层变量，写完就完，不触发任何重渲染 ---- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const [key, value] of Object.entries(preset.tokens)) {
      root.style.setProperty(key, value);
    }
  }, [preset]);

  /* ---- 封面：本地取缓存缩略图；在线用 remote.coverUrl ---- */
  useEffect(() => {
    let alive = true;
    setCoverUrl(null);
    if (remote?.coverUrl) {
      setCoverUrl(remote.coverUrl);
    } else if (player.trackId && !/^https?:\/\//i.test(player.trackId)) {
      cover(player.trackId)
        .then((url) => {
          if (alive) setCoverUrl(url);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [player.trackId, remote?.coverUrl, cover]);

  /* ---- 歌词：只有在线曲目拿得到（50 §7.4 解析在能力层）；本地曲目给空态 ---- */
  useEffect(() => {
    let alive = true;
    setDoc(null);
    setLyricNote("");
    lastActiveRef.current = -999;
    if (remote) {
      lyric(remote.sourceId, remote.songId)
        .then((d) => {
          if (alive) setDoc(d);
        })
        .catch((err: unknown) => {
          if (alive) setLyricNote(err instanceof Error ? err.message : "歌词拿不到");
        });
    } else if (player.trackId) {
      setLyricNote("本地曲目暂无歌词");
    }
    return () => {
      alive = false;
    };
  }, [remote?.sourceId, remote?.songId, player.trackId, lyric, remote]);

  /* ---- 每帧：同一份 t 驱动歌词与频谱；活动行没变就不写行 DOM ---- */
  useEffect(
    () =>
      onTick((t) => {
        const list = lyricListRef.current;
        if (doc && list) {
          if (renderer === "press" || renderer === "theatrical") {
            const st = renderer === "press" ? pressState(doc, t) : theatricalState(doc, t);
            if (st.active !== lastActiveRef.current) {
              lastActiveRef.current = st.active;
              list.style.transform = `translateY(${-st.offset * LINE_H}px)`;
              list.querySelectorAll(".st-line").forEach((el, i) => {
                el.classList.toggle("on", i === st.active);
                if (renderer === "theatrical") {
                  const dist = (st as ReturnType<typeof theatricalState>).distances[i] ?? 999;
                  (el as HTMLElement).style.opacity = String(Math.max(0.14, 1 - dist * 0.18));
                } else {
                  (el as HTMLElement).style.opacity = "";
                }
              });
            }
          } else {
            // minimal / karaoke：不位移，只切活动行
            const st = renderer === "minimal" ? minimalState(doc, t) : karaokeState(doc, t);
            if (st.active !== lastActiveRef.current) {
              lastActiveRef.current = st.active;
              list.querySelectorAll(".st-line").forEach((el, i) => {
                el.classList.toggle("on", i === st.active);
              });
            }
            if (renderer === "karaoke" && lastActiveRef.current >= 0) {
              const k = karaokeState(doc, t);
              const row = list.children[lastActiveRef.current] as HTMLElement | undefined;
              if (row) {
                const spans = row.querySelectorAll<HTMLElement>(".st-k");
                if (spans.length > 0 && k.chars.length === spans.length) {
                  spans.forEach((el, i) => el.style.setProperty("--p", String(k.chars[i].progress)));
                } else {
                  row.style.setProperty("--lp", String(k.progress)); // 没有逐字数据：整行进度
                }
              }
            }
          }
        }
        // 频谱（L-b，电影感）：每帧画。analyser 没数据就留空 —— 不画假波形
        if (stage.preset === "cinema" && stage.layers.visual && canvasRef.current) {
          const data = spectrum(SPECTRUM_BARS);
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d");
          if (data && ctx) {
            const { width, height } = canvas;
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = "rgba(232, 230, 227, 0.55)";
            const w = width / SPECTRUM_BARS;
            for (let i = 0; i < data.length; i += 1) {
              const h = Math.max(2, data[i] * height * 0.9);
              ctx.fillRect(i * w + 1, height - h, w - 2, h);
            }
          }
        }
      }),
    [doc, renderer, stage.preset, stage.layers.visual, spectrum],
  );

  const relayer = (layer: StageLayer): void => dispatch({ type: "stage/toggleLayer", layer });

  return (
    <section
      ref={rootRef}
      className={`stage preset-${stage.preset} fx-${stage.intensity}`}
      style={{ "--stage-wallpaper-img": coverUrl ? `url(${JSON.stringify(coverUrl)})` : "none" } as React.CSSProperties}
    >
      {/* L-a 壁纸 */}
      {stage.layers.wallpaper ? (
        <div className={`st-wallpaper ${preset.wallpaperFromCover ? "from-cover" : ""}`} />
      ) : null}

      {/* L-b 视觉（频谱只属于电影感；analyser 无数据就留空，不画假波形） */}
      {stage.layers.visual && stage.preset === "cinema" ? (
        <canvas ref={canvasRef} className="st-spectrum" width={480} height={120} />
      ) : null}

      {/* L-c 封面（不可关） */}
      <div className="st-cover-wrap">
        {coverUrl ? (
          <img className="st-cover" src={coverUrl} alt="" />
        ) : (
          <div className="st-cover st-cover-empty" />
        )}
      </div>

      {/* L-d 歌词。行判定统一走 lyric-state；这里只负责把行铺出来，每帧的更新都在 onTick */}
      {stage.layers.lyric ? (
        <div className={`st-lyric r-${renderer}`}>
          {doc ? (
            <div ref={lyricListRef} className="st-lines">
              {doc.lines.map((line, i) => (
                <p className="st-line" key={`${line.at}-${i}`}>
                  {renderer === "karaoke"
                    ? karaChars(doc, i).map((ch, j) => (
                        <span className="st-k" key={j}>
                          {ch}
                        </span>
                      ))
                    : line.text}
                </p>
              ))}
            </div>
          ) : (
            <p className="st-lyric-empty">{lyricNote || "…"}</p>
          )}
        </div>
      ) : null}

      {/* L-e 控件（不可关）：预设 / 渲染器 / 图层 / 动效 */}
      <div className="st-controls">
        <div className="st-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === stage.preset ? "on" : ""}
              onClick={() => {
                dispatch({ type: "stage/setPreset", preset: p.id });
                dispatch({ type: "stage/setLyricRenderer", renderer: p.lyricRenderer });
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="st-tools">
          <select
            value={renderer}
            onChange={(e) =>
              dispatch({ type: "stage/setLyricRenderer", renderer: e.target.value as typeof renderer })
            }
          >
            <option value="press">印刷</option>
            <option value="karaoke">逐字</option>
            <option value="minimal">单行</option>
            <option value="theatrical">剧场</option>
          </select>
          <button type="button" onClick={() => setMenuOpen(!menuOpen)}>
            图层
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="st-menu">
          {LAYER_KEYS.filter((k) => k !== "cover" && k !== "controls").map((k) => (
            <label key={k}>
              <input type="checkbox" checked={stage.layers[k]} onChange={() => relayer(k)} />
              {k === "wallpaper" ? "壁纸" : k === "visual" ? "视觉" : "歌词"}
            </label>
          ))}
          <label>
            动效
            <select
              value={stage.intensity}
              onChange={(e) =>
                dispatch({ type: "stage/setIntensity", intensity: Number(e.target.value) as 0 | 1 | 2 })
              }
            >
              <option value={0}>关</option>
              <option value={1}>标准</option>
              <option value={2}>全部</option>
            </select>
          </label>
        </div>
      ) : null}

      <p className="st-meta">
        {fmt(0) === "0:00" && player.status === "idle" ? "还没在播" : title}
      </p>
    </section>
  );
}
