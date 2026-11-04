import { useEffect, useMemo, useRef, useState } from "react";
import type { LyricDoc } from "../../../../contracts/lyric.js";
import type { AppState, StageLayer } from "../../../../contracts/index.js";
import { getProvider } from "../../../capability/registry.js";
import type { Track } from "../../../domain/library/schema.js";
import { getTracks, subscribe as subscribeLibrary } from "../../../domain/library/state.js";
import { lineStartMs } from "../../../domain/lyrics/cursor.js";
import { dispatch, orderOf, positionOf } from "../../../kernel/index.js";
import { onTick } from "../../compositor.js";
import { lyricState, subscribeLyric } from "../../lyric-source.js";
import { PageHead } from "../../PageHead.js";
import { activeLine, karaokeState, litCount } from "./lyric-state.js";
import { LAYER_KEYS, PRESETS, VISUAL_MODE_NAMES, VISUAL_MODES } from "./presets.js";
import { barHeights } from "./spectrum.js";
import { carouselFaces, ringGeom } from "./visuals.js";
import { sampleCoverTint } from "./tint-client.js";

const SPECTRUM_BARS = 48; // 电影感预设的频谱柱数（50 §9.2）
const SCRIPT_ROWS = 12; // 台词本一屏 12 句（3 列 × 4 排）；整段几百句不可能全铺
const UP_NEXT = 3; // 右栏「接下来」条数（稿子 3 条）

export interface StageViewProps {
  state: AppState;
  /** 本地曲目封面（160px dataURL，带缓存）。在线曲目走 remote.coverUrl。 */
  cover(trackId: string): Promise<string | null>;
  spectrum(bins: number): number[] | null;
  /** 导出当前场景层 token 到文件（M5 主题包）。 */
  exportTheme(): Promise<boolean>;
  /** 从文件导入主题包，返回覆盖值。取消返回 null。 */
  importTheme(): Promise<Record<string, string> | null>;
  /** 引擎当前曲目总时长（沉浸态的剩余时间/进度上限用）。无曲目返回 0。 */
  durationMs(): number;
  /** 打开「换一份歌词」弹窗（P0-19）。 */
  findLyric(): void;
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
export function StageView({
  state,
  cover,
  spectrum,
  exportTheme,
  importTheme,
  durationMs,
  findLyric,
}: StageViewProps) {
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
  /* 频谱柱色：canvas 读不到 CSS 变量，换预设时把 .stage 的 color（= --stage-fg）解析成实值存这里 */
  const spectrumColor = useRef("");
  /* b2 沉浸态：钟面/进度与页脚同一份 t，只写 DOM（I1 时间唯一）。
     immersiveRef 让 onTick 免于每帧因闭包重建；tRef 存最近时刻给 queue/prev 用 */
  const [immersive, setImmersive] = useState(false);
  const [immerNarrow, setImmerNarrow] = useState(false);
  const immersiveRef = useRef(false);
  const imTimeRef = useRef<HTMLSpanElement>(null);
  const imTotalRef = useRef<HTMLSpanElement>(null);
  const imBarRef = useRef<HTMLInputElement>(null);
  const imStatRef = useRef<HTMLParagraphElement>(null);
  const imDragRef = useRef(false);
  const tRef = useRef(0);

  const [rev, setRev] = useState(0);
  const [lineIdx, setLineIdx] = useState(-1);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [queueCovers, setQueueCovers] = useState<Record<string, string>>({});
  const [doc, setDoc] = useState<LyricDoc | null>(null);
  const [lyricNote, setLyricNote] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const remote = player.remote;
  const renderer = stage.lyricRenderer;
  const playing = player.status === "playing";
  /** 当前曲的用户校准（P0-18），毫秒。菜单显示它，装配层用它推给 lyric-source。 */
  const lyricOffset = state.lyrics.offsets[player.trackId ?? ""] ?? 0;

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

  /**
   * 「接下来」按**播放序**取 —— shuffle 是投影，显示的必须是真会播的那几首
   * （以前按 items 原顺序排，随机模式下看到的下一首和真播的对不上）。
   * 两套下标不能混：显示编号用播放序位次，操作（播 / 移 / 删）用 items 下标。
   */
  const playOrder = useMemo(
    () => orderOf(queue.items, queue.mode, queue.shuffleSeed),
    [queue.items, queue.mode, queue.shuffleSeed],
  );
  const cursorPos = positionOf(playOrder, queue.cursor);
  const upNextIdx = useMemo((): number[] => {
    if (cursorPos < 0) return playOrder.slice(0, UP_NEXT);
    const rest = playOrder.slice(cursorPos + 1);
    // 列表循环：接下来会绕回队头
    if (queue.mode === "repeat-all") {
      return rest.concat(playOrder.slice(0, cursorPos + 1)).slice(0, UP_NEXT);
    }
    return rest.slice(0, UP_NEXT);
    // playOrder / cursorPos 都是上面算出来的派生值
  }, [playOrder, cursorPos, queue.mode]);
  const upNext = upNextIdx.map((i) => queue.items[i]);
  const upNextKey = upNext.join("|");

  /* 队列行（普通右栏与沉浸态共用）：A-20 可点播、可上移、可删，下标一律用 items 下标 */
  const nxRows = (): React.ReactNode =>
    upNextIdx.map((at) => {
      const id = queue.items[at];
      const no = playOrder.indexOf(at) + 1; // 播放序位次（显示用，与操作用的 items 下标不是一回事）
      return (
        <div className="st-nx" key={id}>
          <button
            type="button"
            className="st-nx-main"
            title="播放这首"
            onClick={() =>
              dispatch({
                type: "player/play",
                trackId: id,
                trackTitle: tracksMap.get(id)?.title ?? null,
              })
            }
          >
            <i className="no">{pad2(no)}</i>
            <span className="art" style={queueCovers[id] ? { backgroundImage: `url("${queueCovers[id]}")` } : undefined} />
            <span className="tx">
              {tracksMap.get(id)?.title ?? fileOf(id)}
              <small>{tracksMap.get(id)?.artist ?? (/^https?:\/\//i.test(id) ? "在线音源" : "")}</small>
            </span>
            <time>{tracksMap.get(id) ? fmt(tracksMap.get(id)!.durationMs) : "--:--"}</time>
          </button>
          <span className="st-nx-ops">
            <button
              type="button"
              aria-label="上移一位"
              disabled={at === 0}
              onClick={() => dispatch({ type: "queue/move", from: at, to: at - 1 })}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="从队列移除"
              onClick={() => dispatch({ type: "queue/remove", index: at })}
            >
              ×
            </button>
          </span>
        </div>
      );
    });

  /* ---- 预设 token + 主题包覆盖：只写场景层变量，写完就完，不触发任何重渲染 ---- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const merged = { ...preset.tokens, ...(stage.customTokens ?? {}) };
    for (const [key, value] of Object.entries(merged)) {
      root.style.setProperty(key, value);
    }
    // canvas 读不到 CSS 变量，把场景墨色解析成实值存下来（每帧再读 computedStyle 就太贵了）。
    // 取 `color` 而不是 `--stage-fg`：前者已经是解析后的 rgb()，且 .stage 的 color 就是场景墨色
    spectrumColor.current = getComputedStyle(root).color;
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

  /* ---- 歌词：doc 由 lyric-source 统一取（A-02），播放页只订阅，不自己发请求 ---- */
  useEffect(() => {
    const read = (): void => {
      const s = lyricState();
      setDoc(s.doc);
      setLyricNote(s.note);
      // 换 doc 等于换词，行号/点亮计数必须归零，否则新词会从旧行号开始点亮
      lastActiveRef.current = -999;
      lastLitRef.current = -1;
      setLineIdx(-1);
    };
    read();
    return subscribeLyric(read);
  }, []);

  /* ---- b2 沉浸态：Esc 退出；<900px 降级为提示文案（b2 稿的窄窗线，resize 实时重测） ---- */
  useEffect(() => {
    if (!immersive) return;
    immersiveRef.current = true;
    const measure = (): void => setImmerNarrow(window.innerWidth < 900);
    measure();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setImmersive(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    return () => {
      immersiveRef.current = false;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
    };
  }, [immersive]);

  /* ---- 每帧：同一份 t 驱动歌词、活字点亮、视差与频谱；活动行没变就不碰 DOM ---- */
  useEffect(
    () =>
      onTick((t) => {
        tRef.current = t;
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
            // 分支收在 litCount（有逐字就字级，没有就按渲染器语义降级）
            const litN = litCount(renderer === "karaoke" ? "karaoke" : "press", k, n);
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
        // 沉浸态钟面（b2）：与页脚同一份 t / durationMs，文本没变就不写 DOM 由浏览器 diff ——
        // 这里每秒最多三次 textContent 赋值 + 一次 --fill，不触发 React 渲染
        if (immersiveRef.current) {
          const dur = durationMs();
          if (imTimeRef.current && imTimeRef.current.textContent !== fmt(t)) imTimeRef.current.textContent = fmt(t);
          if (imTotalRef.current && imTotalRef.current.textContent !== fmt(dur)) imTotalRef.current.textContent = fmt(dur);
          if (imBarRef.current && !imDragRef.current) {
            imBarRef.current.max = String(Math.max(1, Math.round(dur)));
            imBarRef.current.value = String(Math.round(Math.min(t, dur || t)));
            const pct = dur > 0 ? Math.min(100, (t / dur) * 100) : 0;
            imBarRef.current.style.setProperty("--fill", `${pct.toFixed(2)}%`);
            const stat = dur > 0 ? `已播 ${Math.round(pct)}% · 剩余 ${fmt(dur - t)} · 按 Esc 退回` : "按 Esc 退回";
            if (imStatRef.current && imStatRef.current.textContent !== stat) imStatRef.current.textContent = stat;
          }
        }
        // 视觉（C1，C-13 三模式）：共用同一份 analyser 数据，开关就是图层里的「频谱」。
        // 静音/暂停时 barHeights 给全 0，屏幕上真的空 —— 不画假波形
        if (stage.layers.visual) {
          const canvas = rootRef.current?.querySelector<HTMLCanvasElement>(".st-spectrum");
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx) {
            const { width, height } = canvas;
            const bars = barHeights(spectrum(SPECTRUM_BARS), SPECTRUM_BARS, height);
            ctx.clearRect(0, 0, width, height);
            // 颜色还没解析出来（首帧）就不画：宁可空一帧，也不许填成 canvas 默认黑
            const ink = spectrumColor.current;
            if (!ink) return;
            ctx.fillStyle = ink;
            ctx.strokeStyle = ink;
            ctx.globalAlpha = 0.55;
            const w = width / SPECTRUM_BARS;
            if (stage.visualMode === "ring") {
              // 环形：柱从内半径向外伸，48 根绕一圈。画布太扁（lenMax=0）就整圈不画
              const g = ringGeom(width, height);
              if (g.lenMax > 0) {
                ctx.lineWidth = Math.max(1.5, w * 0.6);
                const cap90 = height * 0.9; // barHeights 的封顶值（见 spectrum.ts）
                for (let i = 0; i < bars.length; i += 1) {
                  const len = (bars[i] / cap90) * g.lenMax;
                  if (len <= 0) continue;
                  const a = (i / bars.length) * Math.PI * 2 - Math.PI / 2;
                  const cos = Math.cos(a);
                  const sin = Math.sin(a);
                  ctx.beginPath();
                  ctx.moveTo(g.cx + cos * g.r0, g.cy + sin * g.r0);
                  ctx.lineTo(g.cx + cos * (g.r0 + len), g.cy + sin * (g.r0 + len));
                  ctx.stroke();
                }
              }
            } else if (stage.visualMode === "wave") {
              // 声纹波：同一份柱高以中轴镜像，读作波形
              for (let i = 0; i < bars.length; i += 1) {
                const h = bars[i];
                if (h <= 0) continue;
                ctx.fillRect(i * w + 1, (height - h) / 2, w - 2, h);
              }
            } else {
              for (let i = 0; i < bars.length; i += 1) {
                const h = bars[i];
                if (h <= 0) continue;
                ctx.fillRect(i * w + 1, height - h, w - 2, h);
              }
            }
            ctx.globalAlpha = 1;
          }
        }
      }),
    [doc, renderer, stage.preset, stage.layers.visual, stage.visualMode, stage.intensity, spectrum, durationMs],
  );

  const relayer = (layer: StageLayer): void => dispatch({ type: "stage/toggleLayer", layer });

  /* C-13 轮播面：当前封面 + 队列封面去重；<2 张给空数组（退回单封面，不硬转）。
     依赖用 upNextKey（3+ 首 id 的稳定串），数组每帧换引用会把 memo 打穿 */
  const caroFaces = useMemo(
    () => (stage.coverCarousel ? carouselFaces(coverUrl, upNext.map((id) => queueCovers[id])) : []),
    [stage.coverCarousel, coverUrl, upNextKey, queueCovers],
  );

  /* 台词本：一屏 12 句，当前句往前留 4 句（歌词几百行也不铺满整页） */
  const scriptStart = doc
    ? Math.max(0, Math.min(Math.max(0, doc.lines.length - SCRIPT_ROWS), lineIdx - 4))
    : 0;
  const scriptLines = doc ? doc.lines.slice(scriptStart, scriptStart + SCRIPT_ROWS) : [];
  const curLine = doc && lineIdx >= 0 ? doc.lines[lineIdx] : null;
  // 有逐字数据时按 words 拆字（与 karaokeState 的 chars 一一对应，长度必须相等），
  // 没有才退回整句 text 拆字 —— 两种来源长度不同，混用会让字级点亮退化成整行折算
  // 逐字直接挂在行上（21 §二：行内相对），不再按行号全局过滤 —— 少一次索引对错的机会
  const chars = curLine ? (curLine.words.length > 0 ? curLine.words.map((w) => w.text) : [...curLine.text]) : [];
  // 行级翻译（A-03）：解析阶段已按时间对齐进 line.translations（withTranslation）。
  // 没有翻译就是空串，不占位、不再在 UI 里做一次时间匹配。
  const transText = (): string => curLine?.translations?.zh ?? "";
  const kicker = doc
    ? curLine
      ? `SCRIPT · ${pad2(lineIdx + 1)} / ${doc.lines.length} · IN ${fmt(curLine.startMs)}`
      : `SCRIPT · 00 / ${doc.lines.length}`
    : "SCRIPT · 暂无歌词";

  const lyricBody = (): React.ReactNode => {
    if (!doc) return lyricNote ? <p className="st-lyric-empty">{lyricNote}</p> : null;
    // 译文关掉时给空串：四个渲染器都靠 `trans ?` 决定画不画，一处收口
    const trans = stage.translation ? transText() : "";
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
                  /* 真实逐字数据是「词」不是「字」：英文 yrc 会给
                     "Dancin'"、"all" 这种多字母 token，塞进固定方格必然溢出压到相邻格子。
                     多字母的给 wide 类（宽度随内容），单字仍是田字格 */
                  className={`st-kb${ch === "。" || ch === "，" ? " dot" : ""}${ch.trim().length > 1 ? " wide" : ""}`}
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

      {/* C1 视觉（A-07 / C-13）：三模式共用这一个 canvas，data-mode 给截图桩与调试用。
          关掉=不渲染 canvas，每帧绘制直接不跑 —— 低端机就靠这个 */}
      {stage.layers.visual ? <canvas className="st-spectrum" width={480} height={120} data-mode={stage.visualMode} /> : null}

      <div className="st-page">
        <PageHead
          title="正在播放"
          meta="ONE RECORD · ONE ROOM"
          extra={
            <span className="st-src">
              <b>
                SIDE A · {today} · {sourceName}
              </b>
              <span>
                {queue.items.length > 0
                  ? `QUEUE ${pad2(Math.max(1, cursorPos + 1))} / ${queue.items.length}`
                  : "QUEUE —"}
              </span>
              <button type="button" className="st-viewbtn" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                视图
              </button>
              {/* 沉浸入口排在视图后面：真机判据用 querySelector('.st-viewbtn') 取「视图」，顺序不能反 */}
              <button type="button" className="st-viewbtn" onClick={() => setImmersive(true)} title="沉浸播放（Esc 退出）">
                沉浸
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

          {/* 右栏：队列 + 票据 + 相纸封面（封面不可关）。
              表头留在滚动区外（缝合线向左探出 52px，进滚动区会撑出横向滚动条） */}
          <aside className="st-side">
            <div className="st-side-h">
              <b>接下来</b>
              <span>QUEUE · {upNext.length}</span>
            </div>
            <div className="st-side-scroll">
            {upNext.length === 0 ? (
              <p className="st-side-empty">队列里没有下一首</p>
            ) : (
              nxRows()
            )}

            <div className="st-seal">
              <b>第 {pad2(queue.cursor + 1)} 场</b>
              <small>TOTAL {queue.items.length}</small>
            </div>

            <div className="st-photo">
              {/* 说明收进相纸白边（拍立得本来就是写在白边上的）：
                  挂在外面时整块比右栏高 40px，说明行会压到台词本头上（真机实测 gap=-22px）。
                  收进来之后相纸可以整体被 flex 压缩，矮窗不再溢出 */}
              <div
                className={coverUrl ? "art" : "art no-cover"}
                data-side={nowTrack ? `SIDE A · ${pad2(queue.cursor + 1)}` : "SIDE A"}
              >
                {/* C-13 轮播：≥2 张封面才转，否则退回单封面（caroFaces 空数组就是这个信号）。
                    aria-hidden：轮播是装饰，曲名/歌手在下面的 cap 里都有语义 */}
                {caroFaces.length >= 2 ? (
                  <div className="st-caro" aria-hidden="true">
                    <div className="st-caro-ring" style={{ "--st-caro-n": caroFaces.length } as React.CSSProperties}>
                      {caroFaces.map((url, i) => (
                        <img key={url} src={url} alt="" style={{ "--st-caro-i": i } as React.CSSProperties} />
                      ))}
                    </div>
                  </div>
                ) : (
                  coverUrl ? <img ref={coverRef} className="st-cover-img" src={coverUrl} alt="" /> : null
                )}
                <div className="cap">
                  <b>{nowTitle}</b>
                  <span>{nowDur > 0 ? fmt(nowDur) : "--:--"}</span>
                </div>
                <div className="cap2">
                  {[nowArtist, nowAlbum].filter(Boolean).join(" · ") || "尚未播放"}
                </div>
              </div>
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
                  key={`${ln.startMs}-${scriptStart + i}`}
                  className={`st-srow${scriptStart + i === lineIdx ? " cur" : ""}${scriptStart + i < lineIdx ? " past" : ""}`}
                  onClick={() => {
                    // A-21 跳句走 lineStartMs：偏移量在这里加，别处不再各算一遍
                    const at = lineStartMs(doc, scriptStart + i);
                    if (at !== null) dispatch({ type: "player/seek", positionMs: at });
                  }}
                  title="跳到这句"
                >
                  <i className="no">{pad2(scriptStart + i + 1)}</i>
                  <time>{fmt(ln.startMs)}</time>
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
          {/* 歌词时间轴（P0-18 → B-1）：按曲记，正 = 词往后推。
              folia 的步进是 250ms，比原来的 500ms 更适合对半拍；滑杆负责大范围粗调。 */}
          <div className="st-menu-row">
            <span className="lbl">校准</span>
            <button
              type="button"
              title="歌词整体提前 0.25 秒"
              disabled={!player.trackId}
              onClick={() =>
                player.trackId && dispatch({ type: "lyric/nudgeOffset", trackId: player.trackId, deltaMs: -250 })
              }
            >
              −0.25s
            </button>
            <button
              type="button"
              title="重置这一首的校准"
              disabled={!player.trackId || lyricOffset === 0}
              onClick={() => player.trackId && dispatch({ type: "lyric/resetOffset", trackId: player.trackId })}
            >
              {lyricOffset === 0 ? "对齐" : `${lyricOffset > 0 ? "+" : "−"}${(Math.abs(lyricOffset) / 1000).toFixed(2)}s`}
            </button>
            <button
              type="button"
              title="歌词整体延后 0.25 秒"
              disabled={!player.trackId}
              onClick={() =>
                player.trackId && dispatch({ type: "lyric/nudgeOffset", trackId: player.trackId, deltaMs: 250 })
              }
            >
              +0.25s
            </button>
          </div>
          <div className="st-menu-row">
            <span className="lbl">时间轴</span>
            <input
              type="range"
              min={-10000}
              max={10000}
              step={250}
              value={lyricOffset}
              disabled={!player.trackId}
              aria-label="歌词时间轴整体偏移"
              onChange={(e) => {
                if (!player.trackId) return;
                const next = Number(e.target.value);
                dispatch({ type: "lyric/nudgeOffset", trackId: player.trackId, deltaMs: next - lyricOffset });
              }}
            />
          </div>
          {/* 换词（P0-19）：词对不上（不是慢半拍，而是另一首）时走这里 */}
          <div className="st-menu-row">
            <span className="lbl">词源</span>
            <button type="button" title="搜一版别的歌词" disabled={!player.trackId} onClick={findLyric}>
              换一份…
            </button>
          </div>
          <div className="st-menu-row">
            <span className="lbl">译文</span>
            <label>
              <input
                type="checkbox"
                checked={stage.translation}
                onChange={() => dispatch({ type: "stage/setTranslation", on: !stage.translation })}
              />
              双语并排
            </label>
          </div>
          <div className="st-menu-row">
            <span className="lbl">图层</span>
            {LAYER_KEYS.filter((k) => k !== "cover" && k !== "controls").map((k) => (
              <label key={k}>
                <input type="checkbox" checked={stage.layers[k]} onChange={() => relayer(k)} />
                {k === "wallpaper" ? "壁纸" : k === "visual" ? "频谱" : "歌词"}
              </label>
            ))}
          </div>
          {/* C-13 视觉模式：频谱层开着才有意义，关着时三个按钮一起禁用 */}
          <div className="st-menu-row">
            <span className="lbl">视觉</span>
            <div className="st-presets">
              {VISUAL_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={m === stage.visualMode ? "on" : ""}
                  disabled={!stage.layers.visual}
                  onClick={() => dispatch({ type: "stage/setVisualMode", mode: m })}
                >
                  {VISUAL_MODE_NAMES[m]}
                </button>
              ))}
            </div>
          </div>
          {/* C-13 封面轮播：当前 + 队列封面不足两张时自动退回单封面（视觉里看得出来） */}
          <div className="st-menu-row">
            <span className="lbl">封面</span>
            <label>
              <input
                type="checkbox"
                checked={stage.coverCarousel}
                onChange={() => dispatch({ type: "stage/setCarousel", on: !stage.coverCarousel })}
              />
              3D 轮播
            </label>
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

      {/* b2 沉浸态（stage-v10 b2「刻纹现场」）：全屏覆盖层，Esc 退出，<900px 降级为提示。
          巨字标题 + 封套相纸 + 黑胶盘（暂停即停转）+ 大词 + 队列 + 底部走带。
          窄屏判定由 CSS 媒体查询做主（视口宽度是浏览器的事实，JS 的 resize 事件可能迟到），
          JS 只补一个 .narrow 类做语义标记。 */}
      {immersive ? (
        <div className={`st-immer${immerNarrow ? " narrow" : ""}`} role="dialog" aria-label="沉浸播放">
          <header className="im-top">
            <span className="im-brand">
              <i />
              AFEIFEI
              <small>沉浸播放 · 按 Esc 退出</small>
            </span>
            <div className="st-seal im-seal">
              <b>第 {pad2(queue.cursor + 1)} 场</b>
              <small>ADMIT ONE</small>
            </div>
          </header>

          <p className="im-narrow">沉浸播放需要更宽的窗口（≥ 900px）　按 Esc 退回普通播放页</p>

          <div className="im-body">
                <div className="im-lead">
                  {/* 字号跟着曲名长度走（docs/17 POSTER 的真实工程问题：长曲名定字号必爆版） */}
                  <h2 className={`im-title${nowTitle.length > 20 ? " long" : nowTitle.length > 10 ? " mid" : ""}`}>
                    {nowTitle}
                    <i className="dot" />
                  </h2>
                  <p className="im-tech">
                    {[nowArtist, nowAlbum].filter(Boolean).join(" · ") || "—"} · {sourceName}
                  </p>
                </div>

                <div className="im-grid">
                  {/* 左：封套相纸（无封面 = 素底虚线框，不编图） */}
                  <figure className="st-photo im-sleeve">
                    <div
                      className={coverUrl ? "art" : "art no-cover"}
                      data-side={`SIDE A · ${pad2(queue.cursor + 1)}`}
                    >
                      {coverUrl ? <img className="st-cover-img" src={coverUrl} alt="" /> : null}
                    </div>
                    <figcaption className="im-sleeve-cap">
                      <b>{nowTitle}</b>
                      <span>{nowDur > 0 ? fmt(nowDur) : "--:--"}</span>
                    </figcaption>
                  </figure>

                  {/* 中：黑胶盘 + 唱臂；暂停/加载/缓冲即停转（一个状态一个表现） */}
                  <div className={`im-disc${playing ? "" : " stalled"}`}>
                    <div className="tone" />
                    <div className="disc">
                      <div className="label">
                        <b>SIDE A · {pad2(queue.cursor + 1)}</b>
                        <span>{nowArtist || "—"}</span>
                        <strong>{nowTitle}</strong>
                        <small>33⅓ RPM · STEREO</small>
                      </div>
                    </div>
                  </div>

                  {/* 右：SCRIPT 行 + 上句/当前句/下句 + 队列 */}
                  <div className="im-right">
                    <div className="st-kicker">
                      <i />
                      <span>{kicker}</span>
                    </div>
                    {doc && lineIdx >= 0 ? (
                      <div className="im-lyric">
                        <p className="im-line im-prev">{lineIdx > 0 ? doc.lines[lineIdx - 1].text : "—"}</p>
                        <p className="im-line im-cur">{curLine?.text}</p>
                        {stage.translation && transText() ? <p className="im-line im-trans">{transText()}</p> : null}
                        <p className="im-line im-next">
                          {lineIdx + 1 < doc.lines.length ? doc.lines[lineIdx + 1].text : "（本段终）"}
                        </p>
                      </div>
                    ) : (
                      <p className="im-line im-cur pure">{doc ? "—" : lyricNote || "纯音乐 · 这首歌没有歌词"}</p>
                    )}
                    <div className="im-queue">
                      <div className="st-side-h">
                        <b>接下来</b>
                        <span>QUEUE · {upNext.length}</span>
                      </div>
                      {upNext.length === 0 ? (
                        <p className="st-side-empty">队列里没有下一首</p>
                      ) : (
                        nxRows()
                      )}
                    </div>
                  </div>
                </div>

                <span className="im-vert" aria-hidden="true">
                  ONE RECORD · ONE ROOM · NO.{pad2(queue.cursor + 1)}
                </span>
                <span className="im-no" aria-hidden="true">
                  {pad2(queue.cursor + 1)}
                </span>
              </div>

              <footer className="im-foot">
                <div className="im-row">
                  <span ref={imTimeRef} className="im-tm">
                    0:00
                  </span>
                  <div className="im-tb">
                    <button
                      type="button"
                      aria-label="上一首"
                      onClick={() => dispatch({ type: "queue/prev", atPositionMs: tRef.current })}
                    >
                      <i className="tb-ic ic-prev">
                        <i />
                        <i />
                      </i>
                    </button>
                    <button type="button" className="main" aria-label={playing ? "暂停" : "播放"} onClick={() => dispatch({ type: "player/toggle" })}>
                      <i className={`tb-ic ${playing ? "ic-pause" : "ic-play"}`}>
                        <i />
                        {playing ? <i /> : null}
                      </i>
                    </button>
                    <button type="button" aria-label="下一首" onClick={() => dispatch({ type: "queue/next" })}>
                      <i className="tb-ic ic-next">
                        <i />
                        <i />
                      </i>
                    </button>
                  </div>
                  <input
                    ref={imBarRef}
                    className="im-bar"
                    type="range"
                    min={0}
                    max={1000}
                    defaultValue={0}
                    aria-label="播放进度"
                    onPointerDown={() => {
                      imDragRef.current = true;
                    }}
                    onPointerUp={() => {
                      imDragRef.current = false;
                    }}
                    onBlur={() => {
                      imDragRef.current = false;
                    }}
                    onChange={(e) => dispatch({ type: "player/seek", positionMs: Number(e.target.value) })}
                  />
                  <span ref={imTotalRef} className="im-tm">
                    0:00
                  </span>
                </div>
                <p ref={imStatRef} className="im-stat">
                  按 Esc 退回
                </p>
              </footer>
        </div>
      ) : null}
    </section>
  );
}
