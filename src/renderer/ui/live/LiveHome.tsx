import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { RemoteTrack } from "../../../contracts/capability.js";
import type { PlayMode } from "../../../contracts/index.js";
import { fmtDuration } from "../views/library/rows.js";
import { useAccountBundle, type AccountBundle } from "../account-data.js";
import { RefreshButton } from "../RefreshButton.js";
import { NightCoverArt } from "./NightCoverArt.js";
import { detectCoverTrim, sampleCoverTint, type CoverTrim } from "../views/stage/tint-client.js";
import { splitLatinRuns, visualUnits, heroTitleTiers } from "./typography.js";
import { useViewportTier } from "./useViewport.js";
import { onTick } from "../compositor.js";
import { onAirProgram, orderProgram, type OnAirProgram } from "./on-air.js";

export { onAirProgram };
export type { OnAirProgram };
/**
 * 首页 = 「正在播放」+「接下来播放」的现代桌面播放器布局：
 * 左侧是悬浮大封面 + 主打信息（暗色舞台），右侧是圆角封面卡网格与真频谱。
 * hero 跟随全局播放（onAirProgram 投影）：在播的歌来自每日推荐就按每日推荐展示，
 * 来自榜单/歌单/搜索/FM 就整页切跟播视图、列表 = 当前队列；空闲回落今日第 1 首。
 * 所有叙事字段来自真实数据；不编造播放时间。
 */

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 仅本次运行第一次进入首页时放一次入场；切页回来不重播。 */
let homeVisited = false;

/**
 * 折射透镜的位移图（design-demos/glass-probe/spec-v1.md §4.1，原样）。
 * 参考系 148×259 = 1440 窗的真实卡尺寸，preserveAspectRatio=none 按实际 box 拉伸。
 * R 控 X 位移、G 控 Y 位移，128 = 零位移 → **中间必须整片 rgb(128,128,128)**：
 * 信息带 100% 不被位移，13.5px 的歌名一个像素都不许弯；只在四条边画 12px 倒角带。
 */
const LENS_MAP =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='148' height='259'><defs><linearGradient id='y' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='0' y2='259'><stop offset='0' stop-color='rgb(128,0,128)'/><stop offset='0.046' stop-color='rgb(128,128,128)'/><stop offset='0.954' stop-color='rgb(128,128,128)'/><stop offset='1' stop-color='rgb(128,255,128)'/></linearGradient><linearGradient id='xl' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='12' y2='0'><stop offset='0' stop-color='rgb(0,128,128)'/><stop offset='1' stop-color='rgb(128,128,128)'/></linearGradient><linearGradient id='xr' gradientUnits='userSpaceOnUse' x1='136' y1='0' x2='148' y2='0'><stop offset='0' stop-color='rgb(128,128,128)'/><stop offset='1' stop-color='rgb(255,128,128)'/></linearGradient><radialGradient id='c1' gradientUnits='userSpaceOnUse' cx='12' cy='12' r='12'><stop offset='0' stop-color='rgb(128,128,128)'/><stop offset='1' stop-color='rgb(0,0,128)'/></radialGradient><radialGradient id='c2' gradientUnits='userSpaceOnUse' cx='136' cy='12' r='12'><stop offset='0' stop-color='rgb(128,128,128)'/><stop offset='1' stop-color='rgb(255,0,128)'/></radialGradient><radialGradient id='c3' gradientUnits='userSpaceOnUse' cx='12' cy='247' r='12'><stop offset='0' stop-color='rgb(128,128,128)'/><stop offset='1' stop-color='rgb(0,255,128)'/></radialGradient><radialGradient id='c4' gradientUnits='userSpaceOnUse' cx='136' cy='247' r='12'><stop offset='0' stop-color='rgb(128,128,128)'/><stop offset='1' stop-color='rgb(255,255,128)'/></radialGradient></defs><rect width='148' height='259' fill='url(%23y)'/><rect width='12' height='259' fill='url(%23xl)'/><rect x='136' width='12' height='259' fill='url(%23xr)'/><rect width='12' height='12' fill='url(%23c1)'/><rect x='136' width='12' height='12' fill='url(%23c2)'/><rect y='247' width='12' height='12' fill='url(%23c3)'/><rect x='136' y='247' width='12' height='12' fill='url(%23c4)'/></svg>";

/* ================= 切歌转场 · 封面飞行层 =================
   「列表里的歌飞进大图」不是换图，是共享元素转场：同一张封面在两组坐标之间连续移动。
   落地方式 = 换歌瞬间在 body 上挂 fixed 副本补间，落位后交回真正的 .cs-cover。

   为什么必须另起图层、不能直接动 .cs-cover：
   · .cs-stage 是 overflow:hidden，放大途中的封面在它内部会被裁掉；
   · .cs-stage 挂 key={lead.sourceId}，换歌即销毁重建，容器内没有可补间的中间态。
   副本是裸 <img>（无 backdrop-filter），进 body 不进组件树 → 不触发玻璃三死因，也不碰卡上的折射。

   时序（2026-11-12 用户定：380ms + 轻微过冲，旧图走到七成路程淡出）：
     0ms    两份副本同时起步（新封面飞入卡位→大图，旧封面大图→列表方向）
     0ms    列表整排左移一格（300ms，只动卡自身，理由见调用处）
     380ms  新封面落位，副本原地与真图交叉淡变 140ms（同位置同图，肉眼无接缝） */
type FlyBox = { left: number; top: number; width: number; height: number };

/** 副本的速度曲线：末段减速，落位时有 1~2px 的收势（不是回弹）。 */
const FLY_EASE = "cubic-bezier(0.32, 1.05, 0.34, 1)";
const FLY_MS = 380;
/** 落位交接：副本淡出的时长，与真封面的淡入重叠。 */
const FLY_HANDOFF_MS = 140;
/* 轨迹微弧（px，负 = 向上）：直线补间看着像"贴在玻璃上平移"，中段抬 9px 才有被拿起来的分量。
   只在 380ms 的中段可见，落位终点分毫不动——它不许影响最后那一帧的坐标。
   标 number 而非字面量：下面要判 `!== 0`（留一个"关掉微弧"的开关，字面量类型会被 TS 判死代码）。 */
const FLY_ARC: number = -9;
/* 因果编排：封面先被抽走，队列随后补位。三件事（起飞 / 左移 / 换字）0ms 齐发时
   像三张贴纸被一根棍子同时推；错开 50ms 才读得出"抽走 → 补位 → 落字"的先后。 */
const LIST_DELAY_MS = 50;
/* 歌名滚动交接：落位后等 40ms 再推（先让封面稳住，字再走），240ms 走完一格。 */
const ROLL_MS = 240;
const ROLL_DELAY_MS = 40;
/** 滚动用标准的 ease-out —— 和封面的过冲曲线分开：字是"翻过去"，不是"弹出来"。 */
const ROLL_EASE = "cubic-bezier(0.22, 0.9, 0.24, 1)";

const boxOf = (r: DOMRect): FlyBox => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});

/** 建一份封面副本，按 from→to 补间位移/尺寸/圆角。返回副本元素与其动画。 */
function spawnFly(opts: {
  from: FlyBox;
  to: FlyBox;
  url: string | undefined;
  radius: readonly [number, number];
  duration: number;
  fadeOut: boolean;
  /** 起点透明：倒退时新封面没有真实出发点，靠"位移 + 渐显"入场，不凭空出现。 */
  fadeIn?: boolean;
}): { el: HTMLDivElement; anim: Animation } {
  const { from, to, url, radius, duration, fadeOut, fadeIn } = opts;
  const el = document.createElement("div");
  el.className = "cs-fly";
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    // 副本必须当帧有像素：否则飞行前半程是一块空白圆角
    img.decoding = "sync";
    el.appendChild(img);
  } else {
    el.classList.add("cs-fly-blank");
  }
  document.body.appendChild(el);

  /* 宽高逐帧补间，而不是 transform: scale()：卡面是正方形、大图是竖矩形，
     统一 scale 会把封面拉变形；object-fit: cover 只有在盒子真的变尺寸时才裁得对。 */
  const first: Keyframe = {
    offset: 0,
    transform: `translate3d(${from.left}px, ${from.top}px, 0)`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    borderRadius: `${radius[0]}px`,
    opacity: fadeIn ? 0 : 1,
  };
  const last: Keyframe = {
    offset: 1,
    transform: `translate3d(${to.left}px, ${to.top}px, 0)`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    borderRadius: `${radius[1]}px`,
    opacity: fadeOut ? 0 : 1,
  };
  /* 关键帧按 offset 递增排列。Web Animations 对**每个属性独立**插值：
     中间帧只写 transform，宽高就仍由首尾两帧线性补间，互不干扰。
     弧线段不写 width/height，正是为了不让它干扰尺寸曲线。 */
  const frames: Keyframe[] = [first];
  /* 渐显要在前半程就到位：拖到终点才不透明，整段飞行都是"一张淡影在飘"。 */
  if (fadeIn) frames.push({ offset: 0.42, opacity: 1 });
  if (FLY_ARC !== 0) {
    frames.push({
      offset: 0.5,
      transform: `translate3d(${(from.left + to.left) / 2}px, ${(from.top + to.top) / 2 + FLY_ARC}px, 0)`,
    });
  }
  /* 旧封面走到七成路程就开始散：它的真实落点是环列队尾（在屏外的那一格），
     精确塞进第一格是撒谎，硬撑满全程又会看到"缩到一半忽然没了"。 */
  if (fadeOut) frames.push({ offset: 0.68, opacity: 0.9 });
  frames.push(last);

  const anim = el.animate(frames, { duration, easing: FLY_EASE, fill: "forwards" });
  return { el, anim };
}

/** 信号条柱数：与控制台/舞台同源（engine.spectrum 聚合桶），写死就是假仪器。 */
const VU_BARS = 40;

function MixedTitle({ text }: { text: string }) {
  return (
    <>
      {splitLatinRuns(text).map((run, i) => (
        <span key={i} className={run.latin ? "cs-latin" : "cs-cjk"}>
          {run.text}
        </span>
      ))}
    </>
  );
}

export function LiveHome({
  account,
  accountName,
  onPlayRemote,
  onAccount,
  nowPlaying,
  playing,
  onAir,
  spectrum,
  replaySeq,
  queue,
}: {
  account(): Promise<AccountBundle>;
  accountName: string;
  /** 带上整份播出单：点哪首就从哪首开始，队列 = 这份列表。origin = 节目来源标签。 */
  onPlayRemote(sourceId: string, track: RemoteTrack, list?: RemoteTrack[], origin?: string): void;
  onAccount(): void;
  /** 正在播放的在线曲目（音源 + 歌 id）。命中本期播出单时左栏跟着切 */
  nowPlaying: { sourceId: string; songId: string } | null;
  playing: boolean;
  /** 全局正在播的远程节目（onAirProgram 投影）。null = 没在播远程歌 */
  onAir: OnAirProgram | null;
  /** 真实频谱采样（engine.spectrum）。null = 音频图未建，信号条贴底待机。 */
  spectrum(bins: number): number[] | null;
  /** ⏮ 命中 3 秒规则时的脉冲计数（store 的 player.replaySeq）。
      重播时 trackId 不变、positionMs 本来就是 0，转场 effect 的依赖一个都不动，
      所以需要一个显式信号来接住"按到了、从头开始"。 */
  replaySeq: number;
  /** 队列投影（items / mode / seed）。随机模式下列表必须按**播出顺序**显示，
      否则「接下来」是假的，切歌也拿不到可补间的源坐标。见 on-air.ts orderProgram()。 */
  queue: { items: readonly string[]; mode: PlayMode; shuffleSeed: number } | null;
}) {
  const state = useAccountBundle(account, "daily");
  const [showAll, setShowAll] = useState(false);
  const [failedCovers, setFailedCovers] = useState<ReadonlySet<string>>(new Set());
  const [tint, setTint] = useState<string | null>(null);
  const [trims, setTrims] = useState<Record<string, CoverTrim>>({});
  const vuRefs = useRef<Array<HTMLSpanElement | null>>([]);
  /** 转场要在地面坐标上操作，所以整块首页挂一个 ref 兜底 query。 */
  const rootRef = useRef<HTMLElement | null>(null);
  /** 上一次 commit 测到的卡封面 rect（songId → 视口坐标）。
      切歌那一刻新列表里已经没有被点那首的格子了，所以快照必须**提前**存在：
      转场 effect（声明在前）读它，测量 effect（声明在后）每次 commit 重写它。 */
  const tapeRects = useRef<Map<string, FlyBox>>(new Map());
  const coverBox = useRef<FlyBox | null>(null);
  /** 上一首的文本快照。转场落位后要做"整块上推"，就必须留着上一首的字：
      React 已经把 .cs-copy 换成新内容了，不留快照就只能淡入，做不出滚动交接。 */
  const prevLead = useRef<{ id: string; url?: string; title: string; artist: string } | null>(null);
  const [prevText, setPrevText] = useState<{ title: string; artist: string } | null>(null);
  const ghostTimer = useRef(0);
  /** 上一次见到的重播计数。挂载时对齐当前值 —— 否则从别的页面按完 ⏮ 再回首页，
     首次 effect 会把"历史遗留的变化"当成刚发生的重播，莫名压一下。 */
  const replaySeen = useRef(replaySeq);
  const flySeq = useRef(0);
  const [flying, setFlying] = useState(false);
  /** 倒退方向标记（⏮）：飞行期间列表第 1 格的封面要让位给"正往这儿落"的副本。
      和 flying 一起构成 CSS 的隐藏条件，flying 一解除自动恢复，不需要额外清理。 */
  const [backDir, setBackDir] = useState(false);
  /** 转场落位标记：真封面要**当帧**不透明（副本已精确停在终态），
      否则 260ms 淡入会在副本摘掉后透出页面底色。每次换 lead 先复位。 */
  const [landed, setLanded] = useState(false);

  /* 卸载时收掉标题交接的定时器。飞行副本不在这里管：它们挂在 body 上，
     由各自的 anim.finished 回收（见转场 effect 里的 outgoing / incoming）。 */
  useEffect(() => () => window.clearTimeout(ghostTimer.current), []);

  /** 白边图的反制：按检测到的最大白边比例放大（中心对称，白边被挤出圆角容器外）。
      正常封面 trim=null 不动；上限 1.17（15% 白边全量反制）。 */
  const trimScale = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    const t = trims[url];
    if (!t) return undefined;
    const peak = Math.max(t.top, t.right, t.bottom, t.left);
    return peak > 0 ? `scale(${(1 + Math.min(0.15, peak) * 1.15).toFixed(3)})` : undefined;
  };
  /** 图片加载成功后检测一次白边（onload 时机天然就绪，canvas 采样 ~2ms）。 */
  const detectTrim = (url: string | undefined): void => {
    if (!url || trims[url] !== undefined) return;
    detectCoverTrim(url, (t) => {
      if (t) setTrims((s) => ({ ...s, [url]: t }));
      else setTrims((s) => ({ ...s, [url]: { top: 0, right: 0, bottom: 0, left: 0 } }));
    });
  };

  /*
   * 信号条：每帧从引擎取真频谱写 scaleY（composite-only，不走 React 渲染）。
   * 没在播时 analyser 数据衰减为 0，条子自然贴底——空态就是仪器的待机态，不造假波形。
   */
  useEffect(() => onTick(() => {
    const values = spectrum(VU_BARS);
    for (let i = 0; i < vuRefs.current.length; i++) {
      const el = vuRefs.current[i];
      if (el) el.style.transform = `scaleY(${(values?.[i] ?? 0.02).toFixed(3)})`;
    }
  }), [spectrum]);

  /*
   * hero 显示哪一档——两个模式，同一投影：
   *  - 每日推荐（默认）：正在播的歌属于今日推荐，或没在播（回落第 1 档）；
   *  - 跟播：正在播的远程歌来自别处（榜单/歌单/搜索/FM），整页切过去，
   *    列表 = 当前队列——在任何页选的歌，回首页都能看到它和整份列表。
   * 单一事实源不变：播放状态由 store 唯一持有，这里只做投影，不另存 selected。
   */
  const liveIndex =
    nowPlaying && nowPlaying.sourceId === state.sourceId
      ? state.songs.findIndex((t) => t.sourceId === nowPlaying.songId)
      : -1;
  const onAirIdx = onAir ? onAir.list.findIndex((t) => t.sourceId === onAir.meta.songId) : -1;
  const onAirMode = onAir != null && liveIndex < 0 && onAirIdx >= 0;

  const live = onAirMode || liveIndex >= 0;
  const leadIndex = onAirMode ? onAirIdx : liveIndex >= 0 ? liveIndex : 0;
  const lead: RemoteTrack | undefined = onAirMode ? onAir.list[onAirIdx] : state.songs[leadIndex];
  /* 长标题降档：档位判定在 typography.heroTitleTiers（>24 单行省略 / >14 两行钳 44px，
     窄窗 <1180 宽或矮窗 <760 高降 38px）。判据 = visualUnits（CJK=1/拉丁=0.5）。 */
  const vp = useViewportTier();
  const leadUnits = lead ? visualUnits(lead.title) : 0;
  const titleCls = `cs-title daily-title ${heroTitleTiers(leadUnits, vp.narrow, vp.short)}`.trim();
  /* 离场层要复现上一首的字号档位：两行歌名与单行歌名高度不同，
     若统一用当前档位，滚动交接时两层字会错位（看起来像两首歌叠在一起）。 */
  const ghostCls = prevText
    ? `cs-title daily-title ${heroTitleTiers(visualUnits(prevText.title), vp.narrow, vp.short)}`.trim()
    : "";
  // 本期列表：跟播 = 当前队列，每日推荐 = 账号推荐列表（两者都是**队列原顺序**）
  const program: RemoteTrack[] = onAirMode ? onAir.list : state.songs;
  const total = program.length;
  /* 左栏说明行（2026-11-12 去重）：原来写「来自 X 的播放列表正在播放，顺着列表往下走」——
     状态词与眉标重复、句子本身是系统自述、还替用户指路（右边四张卡已经在指路了）。
     现在只说一件全页只有这里能给的事：还要听多久。 */
  const restCount = Math.max(0, total - leadIndex - 1);
  const restMinutes = Math.round(
    program.slice(leadIndex + 1).reduce((sum, t) => sum + (t.durationMs || 0), 0) / 60000,
  );
  /* 播出顺序（shuffle 投影）：随机模式下 program 的原顺序**不等于**真会播的顺序，
     列表若按原顺序取名，「接下来」就是假的（实测：播 04 时第 1 格写 05、实际播 01）。
     重排之后切歌时新 lead 必然落在旧列表第 1 格 → 转场 rect 快照命中，
     随机与顺序共用同一套动画，不需要任何新动效分支。null = 不重排，回落原顺序。 */
  const byOrder = orderProgram(program, queue, onAirMode ? onAir.meta.sourceId : state.sourceId);
  const view = byOrder ?? program;
  /* 编号 = 这首歌在**歌单**里的位置，不是它在播出顺序里的位置。
     随机时编号乱跳（21 → 07 → 13）本身就是「随机生效了」的可视化；
     若按播出顺序编号，随机看起来会和顺序播放一模一样，白瞎了这个区别。 */
  const baseAt = new Map<string, number>();
  program.forEach((t, i) => baseAt.set(t.sourceId, i));
  const noOf = (t: RemoteTrack): string => pad2((baseAt.get(t.sourceId) ?? 0) + 1);
  // 待播带 = 真正的「接下来」：在播出顺序里从 lead 的下一格起环列（尾曲之后回到开头）。
  // 单首歌单（total<=1）没有"接下来"，upcoming 为空走到头话术。
  const viewAt = lead ? view.findIndex((t) => t.sourceId === lead.sourceId) : -1;
  const at = viewAt >= 0 ? viewAt : 0;
  const upcoming: RemoteTrack[] = [];
  for (let k = 1; k < total; k++) upcoming.push(view[(at + k) % total]);
  const tapes = upcoming.slice(0, vp.cols);
  // 点待播带里的任意一格：队列 = **整份原顺序列表**，从这一首开始（连播靠它）。
  // ⚠ 传的必须是 program（原顺序），不能传 view（播出顺序）：
  //    queue/set 会把 items 重排成 view 的顺序，同 seed 算出的 order 整个变，
  //    列表会自己跳一下。顺序播放时 view === program 无差别，随机时这里是分水岭。
  const play = (track: RemoteTrack): void => {
    if (onAirMode) onPlayRemote(onAir.meta.sourceId, track, onAir.list, onAir.origin ?? undefined);
    else onPlayRemote(state.sourceId, track, state.songs, "每日推荐");
  };

  /* —— 切歌转场：换 lead 时把封面"飞"过去 ——
     两个方向共用一个 effect，靠「新 lead 在不在旧待播带上」分岔：
       · 在   → 顺播（点卡 / 自动下一首）：起点就是那张卡，坐标真实可测；
       · 不在，但旧 lead 这一帧出现在带上 → 倒退（⏮）：落点是它新的那一格，
         同样真实可测；而"上一首从哪来"在环列里位于队尾、屏幕之外，
         没有可测的出发点，所以只做「从左侧 72px 推入 + 渐显」，不假称某一格是它的起点；
       · 两者都不成立（随机 / 跨列表跳转）→ 一个坐标都不编，回落原有的淡入。 */
  useLayoutEffect(() => {
    const id = lead?.sourceId ?? null;
    const prev = prevLead.current;
    /* 快照要带文本：落位后的"整块上推"得把上一首的字留在台面上，
       而 React 已经把 .cs-copy 换成新内容了。 */
    prevLead.current =
      id && lead ? { id, url: lead.coverUrl, title: lead.title, artist: lead.artist } : null;
    // 每次换 lead 先复位"落位"标记：没命中转场的换歌（随机/跨列表）要回到正常淡入
    setLanded(false);
    if (!id || !lead || !prev || prev.id === id) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const root = rootRef.current;
    const coverEl = root?.querySelector<HTMLElement>(".cs-stage .cs-cover");
    if (!root || !coverEl) return;
    // 目标位在这一帧才定下来：新歌标题的行数决定 copy 高度，进而决定封面高度
    const to = boxOf(coverEl.getBoundingClientRect());
    if (to.width < 48) return;

    /* data-song 的值是音源内 id，拼进属性选择器要转义 —— 直接按 dataset 比对，
       不走字符串拼选择器（id 里出现引号或方括号就会静默查不到，转场无声消失）。 */
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".cs-tapes .cs-tape"));
    const findArt = (song: string): HTMLElement | null => {
      const card = cards.find((c) => c.dataset.song === song);
      return card ? card.querySelector<HTMLElement>(".cs-tape-art") : null;
    };

    const from = tapeRects.current.get(id) ?? null;
    // 倒退的落点：旧 lead 这一帧被"退"回了列表，找它现在所在的格子
    const backArt = from ? null : findArt(prev.id);
    const backBox = backArt ? boxOf(backArt.getBoundingClientRect()) : null;
    if (!from && !backBox) return;
    if (from && from.width < 8) return;
    const isBack = !from;

    /* 确定要走转场了才挂离场层（上一首的字）。没命中就一个节点都不加——
       否则那句旧标题会一直压在真标题上，看起来像没换歌。
       900ms 后收掉：落位 380 + 延迟 40 + 滚动 240 = 660，留足余量。 */
    window.clearTimeout(ghostTimer.current);
    setPrevText({ title: prev.title, artist: prev.artist });
    ghostTimer.current = window.setTimeout(() => setPrevText(null), 900);

    const seq = ++flySeq.current;
    // 连点切歌：上一份副本立刻撤掉，不让两层影子叠在一起飞
    for (const stale of document.querySelectorAll(".cs-fly")) stale.remove();
    setFlying(true); // layout effect 里的 setState 在 paint 前冲刷，不会闪一帧
    setBackDir(isBack);

    /* 先建退场的那份（旧封面）：两份副本 z-index 相同，同层里由 DOM 顺序决定叠放，
       后插入的在上。前景必须是"正在靠近的新封面"，所以旧的先建、垫在下面——
       反过来新封面会在交叉点被旧封面整块盖住，"飞进来"这个动作就看不见了。 */
    const back = coverBox.current;
    let outgoing: { el: HTMLDivElement; anim: Animation } | null = null;
    if (back) {
      const firstArt = findArt(cards[0]?.dataset.song ?? "");
      const slotBox = backBox ?? (firstArt ? boxOf(firstArt.getBoundingClientRect()) : null);
      outgoing = spawnFly({
        from: back,
        to: slotBox
          ? { left: slotBox.left, top: slotBox.top, width: slotBox.width, height: slotBox.width }
          : {
              left: back.left + back.width * 0.55,
              top: back.top + back.height * 0.42,
              width: back.width * 0.4,
              height: back.width * 0.4,
            },
        url: prev.url,
        radius: [18, 12],
        duration: FLY_MS - 60,
        /* 顺播时它的真实落点在环列队尾（屏外），走到七成就要散；
           倒退时它是真的"回家"，落点那一格真实存在，走满全程、落位后再交接。 */
        fadeOut: !isBack,
      });
      if (!isBack) {
        // 顺播它自己已散到透明，不会退场：不回收就是 body 上一块永久残留的节点
        outgoing.anim.finished.then(
          () => outgoing?.el.remove(),
          () => outgoing?.el.remove(),
        );
      }
    }

    /* 新封面：最后创建 = 压在最上层。
       顺播从卡位起飞（宽高逐帧长，圆角 12→18）；倒退没有可见起点，
       直接从大图尺寸沿 x 推入 72px 并渐显 —— 是"推进来"而不是"从空气里长出来"。 */
    const incoming = spawnFly({
      from: from ?? { left: to.left - 72, top: to.top, width: to.width, height: to.height },
      to,
      url: lead.coverUrl,
      radius: from ? [12, 18] : [18, 18],
      duration: FLY_MS,
      fadeOut: false,
      fadeIn: isBack,
    });

    /* 整排位移一格：**只动 .cs-tape 自己，绝不动 li**。
       li 是光场 position-anchor 的宿主，li 一旦被 transform 带动，anchor() 每帧重算，
       整排卡的 backdrop 折射跟着逐帧重算（2026-11-11 实测）。
       倒退时严格成立的是"整排右移一格"；若一跳不止一首，步长就不是一格了，
       硬套一个 step 会把中间那几张推错位 —— 那种情况不做整排，只做封面交接。 */
    const oneStep = !isBack || cards[0]?.dataset.song === prev.id;
    if (oneStep && cards.length > 1) {
      const step = cards[1].getBoundingClientRect().left - cards[0].getBoundingClientRect().left;
      if (step > 4) {
        const dir = isBack ? -1 : 1;
        for (const card of cards) {
          /* 顺播时最右那张是**本次新插入的节点**（上一帧的待播带里没有这个 id）：
             它本来就在位移队列里（从右一格滑进来），只缺透明度 —— 补上淡入，
             补位才不是"凭空出现"。这就是为什么不需要另找"新卡"：diff 已经在 tapeRects 里。
             倒退不做淡入：第 1 格是旧 lead 飞回来的落点，它有自己的副本交接；
             再叠一层卡片淡入会在 380~600ms 之间出现半透明卡，透出底下的玻璃。 */
          const fresh =
            !isBack && card.dataset.song ? !tapeRects.current.has(card.dataset.song) : false;
          card.animate(
            fresh
              ? [
                  { transform: `translateX(${dir * step}px)`, opacity: 0 },
                  { offset: 0.67, opacity: 1 },
                  { transform: "none", opacity: 1 },
                ]
              : [{ transform: `translateX(${dir * step}px)` }, { transform: "none" }],
            /* fill: backwards —— delay 期间必须保持第一帧（opacity 0），
               否则新卡会在 50ms 的等待里先以全不透明出现、再跳回透明淡入一次。
               backwards 不带 forwards：动画结束就交还样式，不在合成层上滞留。 */
            { duration: 300, delay: LIST_DELAY_MS, easing: FLY_EASE, fill: "backwards" },
          );
        }
      }
    }

    /* 落位交接：副本停在终态原地淡出，同时解除 flying 让真封面淡入。
       两张同位置、同图、同圆角叠着交叉，看到的是"图变成了真的那一层"，没有接缝。 */
    let landed = false;
    const land = (): void => {
      if (landed || flySeq.current !== seq) return;
      landed = true;
      window.clearTimeout(guard);
      /* 两个 setState 同批：landed 让真封面**当帧**不透明（跳过 260ms 淡入，
         否则副本摘掉时底下一半透明 → 透出页面底色），flying 解除让文案开始浮现。
         backDir 同时归零：倒退时列表第 1 格的封面是"让位"状态，飞行一结束就得显示。 */
      setLanded(true);
      setFlying(false);
      setBackDir(false);
      /* 歌名整块上推：旧字走到 −100%、新字从 +100% 归位。
         必须在落位这一刻施加初始位移（fill: backwards 让 40ms 延迟里停在起点）——
         提前写 transform，真文案会在落位瞬间先闪一下再跳到下面。 */
      const rollNow = root.querySelector<HTMLElement>(".cs-lead-now");
      const rollOld = root.querySelector<HTMLElement>(".cs-lead-ghost");
      if (rollNow && rollOld) {
        rollNow.animate(
          [{ transform: "translateY(100%)", opacity: 0.4 }, { transform: "none", opacity: 1 }],
          { duration: ROLL_MS, delay: ROLL_DELAY_MS, easing: ROLL_EASE, fill: "backwards" },
        );
        /* 离场层**必须** fill: forwards 且播完立刻摘节点（2026-11-12 用户截图实锤）：
           backwards 只兜住延迟段，动画一结束样式就交还 → 旧标题弹回原位、不透明，
           正压在新标题上叠成"重影一下"，要等 900ms 兜底定时器才散。
           项目禁用 forwards 的理由是"结束态会压住内联样式/滞留合成层"，
           而这里节点紧接着就被移除，残留只存在一帧，代价为零。
           闭包里比对 flySeq：连点切歌时上一轮的 finished 可能落在新一轮之后，
           不加守卫会把**新的**离场层一起清掉（滚动交接只剩新字推入）。 */
        const clearGhost = (): void => {
          if (flySeq.current !== seq) return;
          window.clearTimeout(ghostTimer.current);
          setPrevText(null);
        };
        rollOld
          .animate(
            [{ transform: "none", opacity: 1 }, { transform: "translateY(-100%)", opacity: 0 }],
            { duration: ROLL_MS, delay: ROLL_DELAY_MS, easing: ROLL_EASE, fill: "forwards" },
          )
          .finished.then(clearGhost, clearGhost);
      } else {
        /* 没挂上离场层（例如连点切歌时 DOM 已换过一轮）就别把它留在台面上——
           一句旧标题压着真标题，看起来像没换歌。 */
        setPrevText(null);
      }
      incoming.anim.finished
        .then(() =>
          incoming.el
            .animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLY_HANDOFF_MS, fill: "forwards" })
            .finished.then(
              () => incoming.el.remove(),
              () => incoming.el.remove(),
            ),
        )
        .catch(() => incoming.el.remove());

      /* 倒退时旧封面停在终态、不透明 —— 它下面就是那张真正回到列表的卡，
         原地淡出 140ms，两层的同图交叉，看不到接缝。 */
      if (outgoing && isBack) {
        const el = outgoing.el;
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLY_HANDOFF_MS, fill: "forwards" })
          .finished.then(
            () => el.remove(),
            () => el.remove(),
          );
      }
    };
    // 兜底：动画被系统冻结（窗口最小化等）时不能让 flying 永远挂住，真封面会一直透明
    const guard = window.setTimeout(land, FLY_MS + 240);
    incoming.anim.finished.then(land, () => {});
    // lead 变了就是一次新的转场，旧 effect 无需 cleanup（副本自己会退场）
  }, [lead?.sourceId]);

  /* 每次 commit 后刷新测量快照。**必须在转场 effect 之后声明**：
     React 按声明顺序跑 layout effect，先读上一帧旧快照，再写本帧新快照。 */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = new Map<string, FlyBox>();
    for (const card of root.querySelectorAll<HTMLElement>(".cs-tape[data-song]")) {
      const art = card.querySelector<HTMLElement>(".cs-tape-art");
      const id = card.dataset.song;
      if (art && id) next.set(id, boxOf(art.getBoundingClientRect()));
    }
    tapeRects.current = next;
    const cover = root.querySelector<HTMLElement>(".cs-stage .cs-cover");
    coverBox.current = cover ? boxOf(cover.getBoundingClientRect()) : null;
  });

  /* —— ⏮ 重播反馈 ——
     播过 3 秒按上一首 = 回开头重播（不换歌）。store 那边只发一个 replaySeq 脉冲，
     trackId / positionMs / remote 一个都没变，转场 effect 完全感知不到。
     这里接住脉冲给一次可见的确认：封面轻压一下再弹回，不加文字提示。 */
  useEffect(() => {
    if (replaySeq === replaySeen.current) return;
    replaySeen.current = replaySeq;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const cover = rootRef.current?.querySelector<HTMLElement>(".cs-stage .cs-cover");
    if (!cover) return;
    /* 关键帧在这 180ms 内会盖掉 inline 的白边补偿 scale —— 那补偿只对有白边的封面
       生效，短暂丢失看不出差别，换来的是"按到了"的确切反馈。 */
    cover.animate(
      [
        { transform: "scale(0.975)", offset: 0 },
        { transform: "scale(1)", offset: 1 },
      ],
      { duration: 180, easing: FLY_EASE },
    );
  }, [replaySeq]);

  // 卸载/切页时把还在飞的副本收干净（body 上的节点不在 React 树里，不回收就永久残留）
  useEffect(() => () => {
    for (const el of document.querySelectorAll(".cs-fly")) el.remove();
  }, []);

  const firstVisit = !homeVisited;
  homeVisited = true;

  /* hero 取色（复用播放页 M9-2 管线）：封面主色 → --cs-tint。
     唯一写入点在文档根（tokens.css @property 注册 + html 过渡）：
     页面氛围底（cs-home）、舞台色晕（cs-stage）两处消费同一份封面色，随歌呼吸——
     离开首页时回落 transparent。底部控制台 2026-11-12 起改纯白，不再吃这层色晕
     （用户要"播放器默认白色"）。
     失败静默回落 transparent（纯壳底），取色不影响任何东西。 */
  useEffect(() => {
    const url = lead?.coverUrl;
    if (!url) return;
    let active = true;
    sampleCoverTint(url, (t) => {
      if (active) setTint(t);
    });
    return () => {
      active = false;
    };
  }, [lead?.coverUrl]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--cs-tint", tint ?? "transparent");
    return () => {
      root.style.setProperty("--cs-tint", "transparent");
    };
  }, [tint]);

  return (
    <section
      ref={rootRef}
      /* cs-flying / cs-back 是给「倒退时第 1 格让位」用的根级状态标记。
         真正的飞行样式仍然挂在 .cs-stage.cs-flying 上，两者互不干扰。 */
      className={`live-home cs-home${firstVisit ? " cs-enter" : ""}${flying ? " cs-flying" : ""}${
        backDir ? " cs-back" : ""
      }`}
    >
      {/* 折射透镜：整页只渲染一次，CSS 侧 --lg-backdrop: url(#lg-lens) 引用它。
          id 一旦拼错，整条 backdrop-filter 声明失效（不是"只丢折射"）——J1 判据兜这一条。
          绝对定位 + 0×0：不占栅格、不进版面。 */}
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
        <filter id="lg-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage href={LENS_MAP} result="map" preserveAspectRatio="none" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale="10"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      {!lead ? (
        <div className="cs-state-wrap">
          {state.loading ? <p className="daily-state">正在载入今日推荐…</p> : null}
          {!state.loading && state.error ? <p className="daily-state">{state.error}</p> : null}
          {!state.loading && !state.error && state.hint ? (
            <div className="daily-gate">
              <p>{state.hint}</p>
              <button type="button" className="cs-play" onClick={onAccount}>
                去登录 / 切换账号
              </button>
            </div>
          ) : null}
          {!state.loading && !state.error && !state.hint ? (
            <div className="cs-empty">
              <NightCoverArt className="cs-empty-art" />
              <div>
                <h2>今天还没有推荐</h2>
                <p>推荐源没有给出今天的曲目。晚点再刷新一次。</p>
                <RefreshButton onClick={state.reload} busy={state.loading} />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {/* 左：「正在播放」大图卡。stage 按 lead.sourceId 重挂 —— 换档时封面与文案各播一次入场
              （见 cover-stage.css）。key 放在 section 上而不是子元素上：img 单独换 key 实测不重挂。 */}
          <section
            className={`cs-stage${flying ? " cs-flying" : ""}${landed ? " cs-landed" : ""}`}
            key={lead.sourceId}
            aria-labelledby="leadTitle"
          >
            {lead.coverUrl ? (
              <img
                className="cs-cover"
                src={lead.coverUrl}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={() => detectTrim(lead.coverUrl)}
                style={{ transform: trimScale(lead.coverUrl) }}
              />
            ) : (
              <NightCoverArt className="cs-cover" />
            )}

            <div className="cs-copy">
              <p className="cs-kicker">
                {live ? (playing ? "正在播放" : "暂停中") : "今日主打"}
                <span className="cs-idx">
                  第 {leadIndex + 1} 首
                </span>
              </p>
              {/* 标题滚动交接（2026-11-12 用户定）：落位后旧字推出、新字推上来。
                  离场层绝对定位，不参与布局 —— 否则它会把 .cs-copy 撑高，
                  封面（flex:1）跟着缩水，每次切歌版面都抖一下。 */}
              <div className="cs-lead-roll">
                {prevText ? (
                  <div className="cs-lead-ghost" aria-hidden="true">
                    <div className={ghostCls}>
                      <MixedTitle text={prevText.title} />
                    </div>
                    <p className="cs-artist">
                      <b>{prevText.artist}</b>
                    </p>
                  </div>
                ) : null}
                <div className="cs-lead-now">
                  <button type="button" className={titleCls} id="leadTitle" onClick={() => play(lead)}
                    title={leadUnits > 24 ? lead.title : undefined}>
                    <MixedTitle text={lead.title} />
                  </button>
                  <p className="cs-artist">
                    <b>{lead.artist}</b>
                    <span className="cs-dur">{fmtDuration(lead.durationMs)}</span>
                  </p>
                </div>
              </div>
              {/* 两行信息块：上行「还要听多久」（全页唯一），下行只报音源。
                  原句「来自 每日推荐 的播放列表正在播放」被中英混排空格切成三段，
                  而且状态词在上面的眉标里已经说过一次——同屏四遍「正在播放」就是这么来的。 */}
              <p className="cs-note">
                {live ? (
                  <>
                    {restCount > 0 ? (
                      <>
                        队列还剩 {restCount} 首
                        {restMinutes > 0 ? ` · 约 ${restMinutes} 分钟` : null}
                      </>
                    ) : (
                      "这是队列的最后一首"
                    )}
                    <span className="cs-note-2">{onAirMode ? onAir.sourceName : "今日推荐"}</span>
                  </>
                ) : (
                  "今天从这一首开始，先把它听完。"
                )}
              </p>
            </div>
          </section>

          {/* 右：每日推荐 + 横向待播带 + 信号 */}
          <section className="cs-feed" aria-label="今日推荐">
            <header className="cs-feed-head">
              <div>
                <p className="cs-feed-kicker">{onAirMode ? "播放队列" : "每日推荐"}</p>
                <p className="cs-feed-meta">
                  {onAirMode ? (
                    <>
                      来自 {onAir.origin || onAir.sourceName}
                    </>
                  ) : (
                    <>
                      {accountName || "当前音源"} · 每天 <b>06:00</b> 换新 · 共 <b>{total}</b> 首
                    </>
                  )}
                </p>
              </div>
              {onAirMode ? null : <RefreshButton onClick={state.reload} busy={state.loading} title="刷新推荐" />}
            </header>

            <div className="cs-strip-head">
              <h2>
                {upcoming.length === 0 ? "今天的推荐听完了" : showAll ? "完整列表" : "接下来播放"}
              </h2>
              <span className="cs-strip-sub">
                {upcoming.length === 0
                  ? `已播完 ${total} 首，今天到此`
                  : `${showAll ? `剩 ${upcoming.length} 首 · ` : ""}${byOrder ? "随机" : "顺序"}播放`}
              </span>
              {upcoming.length > 0 ? (
                <button
                  type="button"
                  className="cs-more"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "收起列表" : "完整列表"}
                </button>
              ) : null}
            </div>

            {upcoming.length === 0 ? (
              <p className="cs-end">接下来没有歌了。回完整播放器换一首，或者刷新一份新的推荐。</p>
            ) : showAll ? (
              <ol className="cs-all" aria-label="接下来的曲目，按播放顺序（循环回列表开头）">
                {upcoming.map((track) => (
                  <li key={track.sourceId}>
                    <button
                      type="button"
                      className="cs-all-row"
                      onClick={() => play(track)}
                    >
                      <span className="cs-all-no">{noOf(track)}</span>
                      {/* 缩略图：与待播带格子同一封面链路；失败切迷你黑胶垫底 */}
                      {track.coverUrl && !failedCovers.has(track.coverUrl) ? (
                        <img
                          className="cs-all-art"
                          src={track.coverUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={() => setFailedCovers((s) => new Set(s).add(track.coverUrl as string))}
                        />
                      ) : (
                        <span className="cs-all-art cs-all-art-blank" aria-hidden="true" />
                      )}
                      <span className="cs-all-tx">
                        {/* 单行省略 + title 全文：卡面不折行，hover 读全（2026-11-11 统一长文案策略） */}
                        <span className="cs-all-title" title={track.title}>{track.title}</span>
                        <span className="cs-all-artist" title={track.artist}>{track.artist}</span>
                      </span>
                      <span className="cs-all-dur">{fmtDuration(track.durationMs)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <ol
                className="cs-tapes"
                aria-label="待播曲目，按播放顺序（循环回列表开头）"
                /* --lg-n：光场的右侧收口按**实际卡数**收（CSS 侧 min() 夹到列数）。
                   少一首就少一节空光池，不靠写死列数。 */
                style={{ "--lg-n": tapes.length } as CSSProperties}
              >
              {tapes.map((track, i) => (
                <li key={track.sourceId} style={{ "--i": i } as CSSProperties}>
                  <button
                    type="button"
                    className="cs-tape"
                    data-song={track.sourceId}
                    onClick={() => play(track)}
                    aria-label={`播放 ${noOf(track)} ${track.title}，${track.artist}，${fmtDuration(track.durationMs)}`}
                    /* 卡面一律单行省略：完整歌名在这条 title 里，hover 就能读到（2026-11-11 长文案策略） */
                    title={`${track.title} — ${track.artist}`}
                  >
                    {/* 专辑封面：方形整幅在卡顶（现代专辑卡），img 直接做 flex item。
                        无封面或加载失败换黑胶垫底，按 coverUrl 记失败。 */}
                    {track.coverUrl && !failedCovers.has(track.coverUrl) ? (
                      <img
                        className="cs-tape-art"
                        src={track.coverUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => setFailedCovers((s) => new Set(s).add(track.coverUrl as string))}
                        onLoad={() => detectTrim(track.coverUrl)}
                        style={{ transform: trimScale(track.coverUrl) }}
                      />
                    ) : (
                      <span className="cs-tape-art cs-tape-vinyl" aria-hidden="true" />
                    )}
                    <span className="cs-tape-no">{noOf(track)}</span>
                    <span className="cs-tape-title">{track.title}</span>
                    <span className="cs-tape-artist">{track.artist}</span>
                    <span className="cs-tape-foot">
                      <span className="cs-tape-dur">{fmtDuration(track.durationMs)}</span>
                      <i className="cs-tape-play" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            )}

            <div className="cs-signal" aria-hidden="true">
              <div className="cs-vu">
                {Array.from({ length: VU_BARS }, (_, i) => (
                  <i
                    key={i}
                    ref={(el) => {
                      vuRefs.current[i] = el;
                    }}
                  />
                ))}
              </div>
              <div className="cs-sig-foot">
                {/* 波形脚注只描述波形自己（实时频谱）与队列总量。
                    原来左边又写一遍「正在播放」——同屏第四次；右边「循环列表」
                    则是底栏循环键已表达的开关状态。 */}
                <span className="cs-standby">
                  <i aria-hidden="true" />
                  实时频谱
                </span>
                <span>共 {total} 首</span>
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
