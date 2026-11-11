import { useEffect, useRef, useState } from "react";
import type { RemoteTrack } from "../../../contracts/capability.js";
import { dispatch, getState, remoteTrackId, subscribe } from "../../kernel/index.js";
import { useAccountBundle, type AccountBundle } from "../account-data.js";
import { onTick } from "../compositor.js";
import { runCommand } from "../input/commands.js";
import { toast } from "../toast.js";
import { isAccountLiked, subscribe as subscribeAccountLikes } from "../../domain/account-likes/index.js";
import { isLiked, subscribe as subscribeLikes } from "../../domain/likes/index.js";
import { sampleCoverTint } from "../views/stage/tint-client.js";
import { onAirProgram, type OnAirProgram } from "./on-air.js";
import { catCode, catNumber, pad2, sideLabel, today } from "./home-release/release-data.js";
import { ReleaseHero } from "./home-release/ReleaseHero.js";
import { ReleaseTracklist } from "./home-release/ReleaseTracklist.js";
import { TransportDeck } from "./home-release/TransportDeck.js";
import type { SleeveChip } from "./home-release/ReleaseSleeve.js";
import { HomeEmpty, HomeSkeleton } from "./home-release/HomeStates.js";

export { onAirProgram };
export type { OnAirProgram };

/**
 * 首页 = 厂牌「AFEIFEI RECORDS」今天的发行页（docs/29 体系）。
 * 三块组装：release-hero（封套 + 目录号 + 钢印三态 + 唱针灯牌 + 标题排版 + 操作组）/
 * release-tracklist（印刷曲目单，环列在播行恒 A1）/ transport-deck（双层操作台）。
 * 三态投影沿用 onAirProgram/liveIndex 单一事实源，只把「用户为什么看到这个」印在钢印上。
 * 播放状态一律读 state 投影 + dispatch，不新增本地播放状态。
 */

/** 仅本次运行第一次进入首页时放一次入场；切页回来不重播。 */
let homeVisited = false;

const TIMEOUT_TEXT = "网络较慢，今天的推荐还没取到";

export function LiveHome({
  account,
  onPlayRemote,
  onAccount,
  nowPlaying,
  playing,
  onAir,
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
  /** 真实频谱采样。首页不再消费频谱（STEREO 装饰件随体系退役），签名保留保接线稳定。 */
  spectrum(bins: number): number[] | null;
}) {
  const state = useAccountBundle(account, "daily");
  const [tint, setTint] = useState<string | null>(null);
  const [, setStoreRev] = useState(0);
  const [, setLikeRev] = useState(0);
  /** 加载相位：loading → hold（300ms 防闪）→ idle；8s 超时切错误态（不依赖 state.error） */
  const [phase, setPhase] = useState<"idle" | "loading" | "hold" | "timeout">("idle");
  const posRef = useRef(0);

  // store/红心的变化都要驱动重渲染（deck 模式钮、♡ 显示态都读域快照）
  useEffect(() => subscribe(() => setStoreRev((r) => r + 1)), []);
  useEffect(() => subscribeAccountLikes(() => setLikeRev((r) => r + 1)), []);
  useEffect(() => subscribeLikes(() => setLikeRev((r) => r + 1)), []);
  // 3 秒规则的上一首要实时位置；同一份合成器 t 存进参照，不触发渲染
  useEffect(() => onTick((t) => (posRef.current = t)), []);

  // 骨架节奏：进入 loading 8s 超时；离开 loading 后骨架再驻 300ms（数据先到也不闪）
  useEffect(() => {
    if (state.loading) {
      setPhase("loading");
      const to = window.setTimeout(() => setPhase("timeout"), 8000);
      return () => window.clearTimeout(to);
    }
    setPhase((p) => (p === "loading" || p === "timeout" ? "hold" : p));
    const t = window.setTimeout(() => setPhase((p) => (p === "hold" ? "idle" : p)), 300);
    return () => window.clearTimeout(t);
  }, [state.loading, state.sourceId]);

  /* hero 取色管线原样保留：封面主色 → --cs-tint，页面级氛围底随歌呼吸，离开回落 transparent
     （依赖/投影变量在下方声明，effect 闭包只在提交后执行） */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--cs-tint", tint ?? "transparent");
    return () => root.style.setProperty("--cs-tint", "transparent");
  }, [tint]);

  /* —— 投影（单一事实源，逻辑照旧）—— */
  const liveIndex =
    nowPlaying && nowPlaying.sourceId === state.sourceId
      ? state.songs.findIndex((t) => t.sourceId === nowPlaying.songId)
      : -1;
  const onAirIdx = onAir ? onAir.list.findIndex((t) => t.sourceId === onAir.meta.songId) : -1;
  const onAirMode = onAir != null && liveIndex < 0 && onAirIdx >= 0;
  const live = onAirMode || liveIndex >= 0;
  const leadIndex = onAirMode ? onAirIdx : liveIndex >= 0 ? liveIndex : 0;
  const lead: RemoteTrack | undefined = onAirMode ? onAir.list[onAirIdx] : state.songs[leadIndex];
  const program: RemoteTrack[] = onAirMode ? onAir.list : state.songs;
  const total = program.length;
  const guest = onAirMode;
  const firstVisit = !homeVisited;
  homeVisited = true;

  /* hero 取色：封面主色 → --cs-tint（M9-2 管线，失败静默回落 transparent） */
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

  // 点行/立即播放：队列 = 整份列表，从这一首开始（origin 跟列表走）
  const play = (track: RemoteTrack): void => {
    if (onAirMode) onPlayRemote(onAir.meta.sourceId, track, onAir.list, onAir.origin ?? undefined);
    else onPlayRemote(state.sourceId, track, state.songs, "每日推荐");
  };

  // 加入队列（S 级）：元数据随队列入表（queue/add 的 remote 通道），不打断播放
  const addToQueue = (): void => {
    if (!lead) return;
    const sourceId = onAirMode ? onAir.meta.sourceId : state.sourceId;
    const id = remoteTrackId(sourceId, lead.sourceId);
    dispatch({
      type: "queue/add",
      items: [id],
      remote: {
        [id]: {
          sourceId,
          songId: lead.sourceId,
          title: lead.title,
          artist: lead.artist,
          coverUrl: lead.coverUrl,
          durationMs: lead.durationMs,
        },
      },
    });
    toast(`已加入队列：${lead.title}`);
  };

  // ♡：显示态读账号红心域；按下——账号红心端口在 App 手里（期一接线零改动），
  // 先提示去控制台（D3 自行决策，期二操作台收编时接 toggleCurrentLike）
  const likedNow = lead ? isAccountLiked(lead.sourceId) || isLiked(lead.sourceId) : false;
  const pressLike = (): void => {
    if (!lead) return;
    toast("账号红心请切到其他页面，用底部控制台操作（期二收编到发行页）");
  };

  const skeleton = phase === "loading" || phase === "hold";
  const errorText = state.error ?? (phase === "timeout" && state.loading ? TIMEOUT_TEXT : null);
  const stateName = !live ? "待机" : guest ? "客座发行" : "今日发行";
  const seal = !live ? ["待机"] : guest ? ["客座", "发行"] : ["今日", "发行"];
  const chip: SleeveChip = !live ? "standby" : playing ? "playing" : "paused";
  const chipText = !live ? "STANDBY" : `${playing ? "PLAYING" : "PAUSED"} · ${sideLabel(0)}`;
  const kicker = !live
    ? "STANDBY · 06:00 换新"
    : guest
      ? `GUEST RELEASE · 来自 ${onAir.origin || onAir.sourceName}`
      : `TODAY'S RELEASE · 每日 06:00 换新 · 共 ${total} 首`;
  const catPos = lead ? program.findIndex((t) => t.sourceId === lead.sourceId) + 1 : 1;
  const cat = catNumber(catCode(guest, guest ? (onAir?.origin ?? null) : null), catPos, new Date());
  const { queue, player } = getState();
  const deckSrc =
    live && lead
      ? `${guest ? onAir.origin || onAir.sourceName || "当前队列" : "每日推荐"} · ${pad2(leadIndex + 1)}/${pad2(total)}`
      : "";

  const rootCls = `live-home home-release${firstVisit ? " home-enter" : ""}`;
  const deck = (
    <TransportDeck
      title={live && lead ? lead.title : ""}
      srcLine={deckSrc}
      playing={playing}
      durationMs={live && lead ? lead.durationMs : 0}
      mode={queue.mode}
      volume={player.volume}
      muted={player.muted}
      onOpenStage={() => runCommand("tab-stage")}
      onPrev={() => dispatch({ type: "queue/prev", atPositionMs: posRef.current })}
      onLyric={() => runCommand("open-lyric")}
      onMini={() => runCommand("open-mini")}
    />
  );

  if (skeleton) {
    return (
      <section className={rootCls}>
        <HomeSkeleton />
        {deck}
      </section>
    );
  }
  if (errorText) {
    return (
      <section className={rootCls}>
        <ReleaseHero
          track={null}
          cat={cat}
          seal={["待机"]}
          chip="standby"
          chipText="STANDBY"
          stateName="待机"
          date={today(new Date())}
          total={0}
          kicker="STANDBY · 06:00 换新"
          liked={false}
          onPlay={() => undefined}
          onQueue={() => undefined}
          onLike={() => undefined}
          error={errorText}
          onRetry={state.reload}
        />
        {deck}
      </section>
    );
  }
  if (!lead) {
    return (
      <section className={rootCls}>
        <HomeEmpty
          kind={state.hint ? "hint" : "empty"}
          hint={state.hint ?? ""}
          reloading={state.loading}
          onAccount={onAccount}
          onReload={state.reload}
        />
        {deck}
      </section>
    );
  }
  return (
    <section className={rootCls}>
      <ReleaseHero
        track={lead}
        cat={cat}
        seal={seal}
        chip={chip}
        chipText={chipText}
        stateName={stateName}
        date={today(new Date())}
        total={total}
        kicker={kicker}
        liked={likedNow}
        onPlay={() => play(lead)}
        onQueue={addToQueue}
        onLike={pressLike}
        error={errorText}
        onRetry={state.reload}
      />
      <ReleaseTracklist
        program={program}
        leadIndex={leadIndex}
        live={live}
        playing={playing}
        onPlay={(track) => play(track)}
        showReload={!guest}
        reloading={state.loading}
        onReload={state.reload}
      />
      {deck}
    </section>
  );
}
