import { useEffect, useMemo, useRef, useState } from "react";
import type { LyricDoc } from "../../../../contracts/capability.js";
import type { AppState, StageLayer } from "../../../../contracts/index.js";
import { getProvider } from "../../../capability/registry.js";
import type { Track } from "../../../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary } from "../../../domain/library/state.js";
import { dispatch } from "../../../kernel/index.js";
import { onTick } from "../../compositor.js";
import { setLyricDoc } from "../../lyric-bridge.js";
import { PageHead } from "../../PageHead.js";
import { activeLine, karaokeState } from "./lyric-state.js";
import { LAYER_KEYS, PRESETS } from "./presets.js";
import { sampleCoverTint } from "./tint-client.js";

const SPECTRUM_BARS = 48; // 电影感预设的频谱柱数（50 §9.2）
const SCRIPT_ROWS = 12; // 台词本一屏 12 句（3 列 × 4 排）；整段几百句不可能全铺
const UP_NEXT = 3; // 右栏「接下来」条数（稿子 3 条）

export interface StageViewProps {
  state: AppState;
  /** 本地曲目封面（160px dataURL，带缓存）。在线曲目走 remote.coverUrl。 */
  cover(trackId: string): Promise<string | null>;
  lyric(sourceId: string, songId: string): Promise<LyricDoc>;
  spectrum(bins: number): number[] | null;
  /** 导出当前场景层 token 到文件（M5 主题包）。 */
  exportTheme(): Promise<boolean>;
  /** 从文件导入主题包，返回覆盖值。取消返回 null。 */
  importTheme(): Promise<Record<string, string> | null>;
}

const fmt = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const pad2 = (n: number): string => String(Math.max(0, n)).padStart(2, "0");

/** 队列里可能有在线曲目（id 是 URL），曲库查不到时用文件名兜底，不编标题。 */
function fileOf(id: string): string {
  const parts = id.split(/[\\/]/);
  const last = parts[parts.length - 1] ?? id;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * 播放页（stage-v10 a2「活字帖」重排）。
 *
 * 五层不变量不变（50 §9.2）：C0 壁纸 / C1 频谱 / C2 封面 / C3 歌词 / C4 控件，
 * 换的是**排版**：页头三件套 → 左歌词（田字格活字）+ 右栏队列/票据/相纸封面 → 底部台词本。
 * 四个歌词渲染器仍是"同一份 activeLine 的四种呈现"（lyric-state 对拍测试不变）：
 *   press 田字格整句落墨 / karaoke 田字格逐字点亮 / minimal 单行大字 / theatrical 三行提词器。
 * 每帧只写 class 与 transform；换预设仍只换场景层 token，控件不位移。
 */
export function StageView({ state, cover, lyric, spectrum, exportTheme, importTheme }: StageViewProps) {
  const { player, stage } = state;
  const preset = PRESETS.find((p) => p.id === stage.preset) ?? PRESETS[0];
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<(HTMLSpanElement | null)[]>([]);
  const coverRef = useRef<HTMLImageElement | null>(null);
  const lastActiveRef = useRef(-999);
  const lastLitRef = useRef(-1);
  /* 电影感视差（50 §9.2：±8px、阻尼 0.12）：鼠标定目标，onTick 里插值，只写 transform */
  const parallaxTarget = useRef({ x: 0, y: 0 });
  const parallaxCurrent = useRef({ x: 0, y: 0 });

  const [rev, setRev] = useState(0);
  const [lineIdx, setLineIdx] = useState(-1);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [queueCovers, setQueueCovers] = useState<Record<string, string>>({});
  const [doc, setDoc] = useState<LyricDoc | null>(null);
  const [lyricNote, setLyricNote] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const remote = player.remote;
  const renderer = stage.lyricRenderer;

  /* 曲库元数据：队列行与台词本要标题/时长。在线曲目不在曲库里 → 走兜底，不编数据。 */
  useEffect(() => subscribeLibrary(() => setRev((r) => r + 1)), []);
  const tracksMap = useMemo(() => {
    const m = new Map<string, Track>();
    // 队列里存的是原始大小写的 path（onPlay 用 r.path 建队列），id 是小写规范化路径：
    // 两个键都要建，否则队列行只能显示文件名（"Alarm01.wav"），真名查不到。
    for (const t of getTracks()) {
      m.set(t.id, t);
      m.set(t.path, t);
    }
    return m;
  }, [rev]);

  const queue = state.queue;
  const nowTrack = player.trackId ? tracksMap.get(player.trackId) : undefined;
  const nowTitle = player.trackTitle ?? nowTrack?.title ?? (player.trackId ? fileOf(player.trackId) : "未在播放");
  const nowArtist = nowTrack?.artist ?? (remote ? "在线音源" : "");
  const nowAlbum = nowTrack?.album ?? "";
  const nowDur = nowTrack?.durationMs ?? 0;
  const sourceName = remote ? (getProvider(remote.sourceId)?.name ?? remote.sourceId) : "本地曲库";

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  }, []);

  const upNext = queue.items.slice(queue.cursor + 1, queue.cursor + 1 + UP_NEXT);
  const upNextKey = upNext.join("|");

  /* ---- 预设 token + 主题包覆盖：只写场景层变量，写完就完，不触发任何重渲染 ---- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const merged = { ...preset.tokens, ...(stage.customTokens ?? {}) };
    for (const [key, value] of Object.entries(merged)) {
      root.style.setProperty(key, value);
    }
  }, [preset, stage.customTokens]);

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

  /* ---- 队列缩略图：只取有本地文件的（在线 id 不是路径，cover() 会空转） ---- */
  useEffect(() => {
    let alive = true;
    const want = upNext.filter((id) => !/^https?:\/\//i.test(id));
    Promise.all(want.map((id) => cover(id).catch(() => null))).then((urls) => {
      if (!alive) return;
      const next: Record<string, string> = {};
      want.forEach((id, i) => {
        const url = urls[i];
        if (url) next[id] = url;
      });
      setQueueCovers(next);
    });
    return () => {
      alive = false;
    };
    // upNextKey 是 3 个 id 的稳定串，避免数组引用每帧换
  }, [upNextKey, cover]);

  /* ---- 封面取色（M9-2）：只写 --stage-tint，量化在 Worker，失败保留当前值 ---- */
  useEffect(() => {
    if (!coverUrl) return;
    let alive = true;
    sampleCoverTint(coverUrl, (tint) => {
      if (alive && tint) rootRef.current?.style.setProperty("--stage-tint", tint);
    });
    return () => {
      alive = false;
    };
  }, [coverUrl]);

  /* ---- 歌词：只有在线曲目拿得到（50 §7.4 解析在能力层）；本地曲目给空态 ---- */
  useEffect(() => {
    let alive = true;
    setDoc(null);
    setLyricDoc(null); // 桌面歌词窗同步清行（M9-1）
    setLyricNote("");
    lastActiveRef.current = -999;
    lastLitRef.current = -1;
    setLineIdx(-1);
    if (remote) {
      lyric(remote.sourceId, remote.songId)
        .then((d) => {
          if (alive) {
            setDoc(d);
            setLyricDoc(d);
          }
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

  /* ---- 每帧：同一份 t 驱动歌词、活字点亮、视差与频谱；活动行没变就不碰 DOM ---- */
  useEffect(
    () =>
      onTick((t) => {
        if (doc) {
          const idx = activeLine(doc.lines, t);
          if (idx !== lastActiveRef.current) {
            lastActiveRef.current = idx;
            setLineIdx(idx); // 每句一次重渲染，不是每帧
            lastLitRef.current = -1;
          }
          const boxes = boxRef.current;
          if ((renderer === "press" || renderer === "karaoke") && boxes.length > 0) {
            const k = karaokeState(doc, t);
            const n = boxes.length;
            // 有逐字数据（chars 与田字格一一对应）→ 一律字级点亮，press 也一样：
            // 「整句落墨」只对没有逐字数据的歌才有意义（2026-11-03 用户实测反馈）
            const litN =
              k.chars.length === n
                ? k.chars.filter((c) => c.progress >= 1).length
                : renderer === "press"
                  ? n
                  : Math.round(k.progress * n);
            if (litN !== lastLitRef.current) {
              lastLitRef.current = litN;
              for (let i = 0; i < n; i += 1) {
                const el = boxes[i];
                if (!el) continue;
                el.classList.toggle("lit", i < litN);
                el.classList.toggle("now", renderer === "karaoke" && i === litN - 1);
              }
            }
          }
        }
        // 电影感视差：每帧向目标阻尼插值（0.12），intensity=0 或非 cinema 时不动
        if (stage.preset === "cinema" && stage.intensity > 0) {
          const cur = parallaxCurrent.current;
          const tgt = parallaxTarget.current;
          if (Math.abs(cur.x - tgt.x) > 0.05 || Math.abs(cur.y - tgt.y) > 0.05) {
            cur.x += (tgt.x - cur.x) * 0.12;
            cur.y += (tgt.y - cur.y) * 0.12;
            const img = coverRef.current;
            if (img) img.style.transform = `translate(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px)`;
          }
        }
        // 频谱（C1，电影感）：每帧画。analyser 没数据就留空 —— 不画假波形
        if (stage.preset === "cinema" && stage.layers.visual) {
          const canvas = rootRef.current?.querySelector<HTMLCanvasElement>(".st-spectrum");
          if (canvas) {
            const data = spectrum(SPECTRUM_BARS);
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
        }
      }),
    [doc, renderer, stage.preset, stage.layers.visual, stage.intensity, spectrum],
  );

  const relayer = (layer: StageLayer): void => dispatch({ type: "stage/toggleLayer", layer });

  /* 台词本：一屏 12 句，当前句往前留 4 句（歌词几百行也不铺满整页） */
  const scriptStart = doc
    ? Math.max(0, Math.min(Math.max(0, doc.lines.length - SCRIPT_ROWS), lineIdx - 4))
    : 0;
  const scriptLines = doc ? doc.lines.slice(scriptStart, scriptStart + SCRIPT_ROWS) : [];
  const curLine = doc && lineIdx >= 0 ? doc.lines[lineIdx] : null;
  // 有逐字数据时按 words 拆字（与 karaokeState 的 chars 一一对应，长度必须相等），
  // 没有才退回整句 text 拆字 —— 两种来源长度不同，混用会让字级点亮退化成整行折算
  const lineWords = doc && lineIdx >= 0 ? doc.words.filter((w) => w.line === lineIdx) : [];
  const chars = lineWords.length > 0 ? lineWords.map((w) => w.char) : curLine ? [...curLine.text] : [];
  // 行级翻译（A-03）：取时间戳最接近活动行的中文翻译行（500ms 内才算对上，
  // 网易云 tlyric 的时间轴与主歌词同行起步）。没有翻译就是空串，不占位。
  const transText = (): string => {
    const zh = doc?.translations.find((t) => t.lang === "zh");
    if (!zh || !curLine) return "";
    let best = "";
    let diff = 500;
    for (const l of zh.lines) {
      if (!l.text.trim()) continue;
      const d = Math.abs(l.at - curLine.at);
      if (d < diff) {
        diff = d;
        best = l.text;
      }
    }
    return best;
  };
  const kicker = doc
    ? curLine
      ? `SCRIPT · ${pad2(lineIdx + 1)} / ${doc.lines.length} · IN ${fmt(curLine.at)}`
      : `SCRIPT · 00 / ${doc.lines.length}`
    : "SCRIPT · 暂无歌词";

  const lyricBody = (): React.ReactNode => {
    if (!doc) return lyricNote ? <p className="st-lyric-empty">{lyricNote}</p> : null;
    const trans = transText();
    if (renderer === "press" || renderer === "karaoke") {
      return (
        <div className="st-typeset">
          {chars.length === 0 ? (
            <p className="st-prev">—</p>
          ) : (
            <div className="st-krow">
              {/* ref 数组必须截断到本行字数：残留的上一行长尾会让 onTick 里
                  n !== k.chars.length，逐字点亮被误判成「无逐字数据」整句全亮 */}
              {boxRef.current.length > chars.length && (boxRef.current.length = chars.length)}
              {chars.map((ch, i) => (
                <span
                  key={i}
                  className={`st-kb${ch === "。" || ch === "，" ? " dot" : ""}`}
                  ref={(el) => {
                    boxRef.current[i] = el;
                  }}
                  style={{ "--i": i } as React.CSSProperties}
                >
                  {ch}
                </span>
              ))}
            </div>
          )}
          {trans ? <p className="st-trans">{trans}</p> : null}
        </div>
      );
    }
    if (renderer === "minimal") {
      return (
        <>
          <p className="st-min">{curLine?.text ?? "—"}</p>
          {trans ? <p className="st-trans">{trans}</p> : null}
        </>
      );
    }
    const prev = lineIdx > 0 ? doc.lines[lineIdx - 1].text : "—";
    const next = lineIdx + 1 < doc.lines.length ? doc.lines[lineIdx + 1].text : "（本段终）";
    return (
      <div className="st-theatrical">
        <p className="st-prev">{prev}</p>
        <p className="st-min">{curLine?.text ?? "—"}</p>
        {trans ? <p className="st-trans">{trans}</p> : null}
        <p className="st-next">{next}</p>
      </div>
    );
  };

  return (
    <section
      ref={rootRef}
      className={`stage preset-${stage.preset} fx-${stage.intensity}`}
      style={{ "--stage-wallpaper-img": coverUrl ? `url(${JSON.stringify(coverUrl)})` : "none" } as React.CSSProperties}
      onMouseMove={(e) => {
        if (stage.preset !== "cinema" || stage.intensity === 0) return;
        const r = rootRef.current?.getBoundingClientRect();
        if (!r) return;
        parallaxTarget.current = {
          x: (e.clientX / r.width - 0.5) * 16, // ±8px（50 §9.2）
          y: (e.clientY / r.height - 0.5) * 16,
        };
      }}
    >
      {/* C0 壁纸 */}
      {stage.layers.wallpaper ? (
        <div className={`st-wallpaper ${preset.wallpaperFromCover ? "from-cover" : ""}`} />
      ) : null}

      {/* C1 视觉（频谱只属于电影感；analyser 无数据就留空，不画假波形） */}
      {stage.layers.visual && stage.preset === "cinema" ? (
        <canvas className="st-spectrum" width={480} height={120} />
      ) : null}

      <div className="st-page">
        <PageHead
          title="正在播放"
          meta="ONE RECORD · ONE ROOM"
          extra={
            <span className="st-src">
              <b>
                SIDE A · {today} · {sourceName}
              </b>
              <span>{queue.items.length > 0 ? `QUEUE ${pad2(queue.cursor + 1)} / ${queue.items.length}` : "QUEUE —"}</span>
              <button type="button" className="st-viewbtn" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                视图
              </button>
            </span>
          }
        />

        <div className="st-body">
          {/* C3 歌词：活字帖（当前句拆字） */}
          <section className="st-lyr">
            <span className="st-folio" aria-hidden="true">
              {lineIdx >= 0 ? pad2(lineIdx + 1) : "—"}
            </span>
            <div className="st-kicker">
              <i />
              <span>{kicker}</span>
            </div>
            {stage.layers.lyric ? (
              lyricBody()
            ) : (
              <p className="st-lyric-empty">歌词层已关闭</p>
            )}
          </section>

          {/* 右栏：队列 + 票据 + 相纸封面（封面不可关） */}
          <aside className="st-side">
            <div className="st-side-h">
              <b>接下来</b>
              <span>QUEUE · {upNext.length}</span>
            </div>
            {upNext.length === 0 ? (
              <p className="st-side-empty">队列里没有下一首</p>
            ) : (
              upNext.map((id, i) => (
                <div className="st-nx" key={id}>
                  <i className="no">{pad2(queue.cursor + 2 + i)}</i>
                  <span className="art" style={queueCovers[id] ? { backgroundImage: `url("${queueCovers[id]}")` } : undefined} />
                  <span className="tx">
                    {tracksMap.get(id)?.title ?? fileOf(id)}
                    <small>{tracksMap.get(id)?.artist ?? (/^https?:\/\//i.test(id) ? "在线音源" : "")}</small>
                  </span>
                  <time>{tracksMap.get(id) ? fmt(tracksMap.get(id)!.durationMs) : "--:--"}</time>
                </div>
              ))
            )}

            <div className="st-seal">
              <b>第 {pad2(queue.cursor + 1)} 场</b>
              <small>TOTAL {queue.items.length}</small>
            </div>

            <div className="st-photo">
              <div className="art" data-side={nowTrack ? `SIDE A · ${pad2(queue.cursor + 1)}` : "SIDE A"}>
                {coverUrl ? <img ref={coverRef} className="st-cover-img" src={coverUrl} alt="" /> : null}
              </div>
              <div className="cap">
                <b>{nowTitle}</b>
                <span>{nowDur > 0 ? fmt(nowDur) : "--:--"}</span>
              </div>
              <div className="cap2">
                {[nowArtist, nowAlbum].filter(Boolean).join(" · ") || "尚未播放"}
              </div>
            </div>
          </aside>
        </div>

        {/* 台词本：整段可点跳句（稿子的 r4 资产） */}
        {doc && scriptLines.length > 0 ? (
          <div className="st-script">
            <div className="sh">
              <b>台词本 · 整段</b>
              <span>
                共 {doc.lines.length} 句 · 显示 {scriptStart + 1}–{scriptStart + scriptLines.length}
              </span>
            </div>
            <div className="rows">
              {scriptLines.map((ln, i) => (
                <button
                  type="button"
                  key={`${ln.at}-${scriptStart + i}`}
                  className={`st-srow${scriptStart + i === lineIdx ? " cur" : ""}${scriptStart + i < lineIdx ? " past" : ""}`}
                  onClick={() => dispatch({ type: "player/seek", positionMs: ln.at })}
                  title="跳到这句"
                >
                  <i className="no">{pad2(scriptStart + i + 1)}</i>
                  <time>{fmt(ln.at)}</time>
                  <span className="tx">{ln.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* C4 控件：五层开关 / 预设 / 渲染器 / 主题包，收进「视图」浮层，不占版面 */}
      {menuOpen ? (
        <div className="st-menu" role="dialog" aria-label="播放页视图设置">
          <div className="st-menu-row">
            <span className="lbl">预设</span>
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
          </div>
          <div className="st-menu-row">
            <span className="lbl">歌词</span>
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
          </div>
          <div className="st-menu-row">
            <span className="lbl">图层</span>
            {LAYER_KEYS.filter((k) => k !== "cover" && k !== "controls").map((k) => (
              <label key={k}>
                <input type="checkbox" checked={stage.layers[k]} onChange={() => relayer(k)} />
                {k === "wallpaper" ? "壁纸" : k === "visual" ? "视觉" : "歌词"}
              </label>
            ))}
          </div>
          <div className="st-menu-row">
            <span className="lbl">动效</span>
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
          </div>
          <div className="st-menu-row">
            <span className="lbl">主题包</span>
            <button type="button" onClick={() => void importTheme().catch(() => undefined)}>
              导入
            </button>
            <button type="button" onClick={() => void exportTheme()}>
              导出
            </button>
            {stage.customTokens ? (
              <button type="button" className="on" onClick={() => dispatch({ type: "stage/setTheme", tokens: null })}>
                清除导入
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
