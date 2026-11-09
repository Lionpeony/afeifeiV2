import { useEffect, useRef, useState } from "react";
import type { PageId } from "../pages.js";
import { NavIcon } from "../icons.js";
import { onTick } from "../compositor.js";
import { useNowSecond } from "./useStation.js";

/**
 * 顶部 44px 站尺：13 个房间的刻度。
 *
 * 不做"主导航 + 我的 + 设置"三段式 —— 那还是播放器侧栏。
 * 这里是一条可读的站名刻度带，当前房间的刻度点亮，其余压暗。
 * 整条是窗口拖拽区（live 壳没有标题栏），按钮自己 no-drag。
 */

interface Tick {
  id: PageId;
  label: string;
  /** 调谐尺读数：纯装饰，aria-hidden；由栏目序号派生，不是真实电台 */
  freq: string;
}

const TICKS: Tick[] = [
  { id: "home", label: "首页", freq: "88.1" },
  { id: "online", label: "在线", freq: "89.3" },
  { id: "roam", label: "漫游", freq: "90.5" },
  { id: "local", label: "本地", freq: "91.7" },
  { id: "playlists", label: "歌单", freq: "92.9" },
  { id: "liked", label: "喜欢", freq: "94.1" },
  { id: "recent", label: "最近", freq: "95.3" },
  { id: "stats", label: "统计", freq: "96.5" },
  { id: "settings", label: "设置", freq: "97.7" },
  { id: "stage", label: "直播", freq: "98.9" },
];

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 调频滚动时长：切页时目标签子的频率读数从当前房间滚到目标房间（ease-out 收尾）。 */
const TUNE_MS = 420;

export function StationRuler({
  page,
  onGo,
  onToggleTheme,
  account,
  onAccount,
  onSearch,
}: {
  page: PageId;
  onGo(page: PageId): void;
  onToggleTheme(): void;
  /** 当前账号摘要；未登录也要给（显示「未登录」入口） */
  account: { nick: string | null; avatarUrl: string | null; sourceName: string; loggedIn: boolean };
  onAccount(): void;
  /** 顶栏全局搜索：提交后由宿主跳到在线页并执行 */
  onSearch(query: string): void;
}) {
  const [query, setQuery] = useState("");
  const second = useNowSecond();
  const now = new Date(second * 1000);
  const clock = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

  /*
   * 调频切页：点击签子时，目标签子的频率读数从当前房间的频率滚到目标频率
   * （像旋钮扫过刻度盘），滚完才落定。帧循环走 onTick（rAF 唯一），
   * 时间以 Date.now 计（onTick 的 t 是播放时钟，暂停时会停走，不能当秒表）；
   * 数据全走 ref 直写 data-freq，不触发 React 渲染，只有起止各一次 setState。
   */
  const roll = useRef<{ el: HTMLElement; from: number; to: number; t0: number } | null>(null);
  const [tuning, setTuning] = useState<PageId | null>(null);

  useEffect(
    () =>
      onTick(() => {
        const r = roll.current;
        if (!r) return;
        if (r.t0 < 0) r.t0 = Date.now();
        const p = Math.min(1, (Date.now() - r.t0) / TUNE_MS);
        const eased = 1 - Math.pow(1 - p, 3);
        r.el.dataset.freq = (r.from + (r.to - r.from) * eased).toFixed(1);
        if (p >= 1) {
          roll.current = null;
          setTuning(null);
        }
      }),
    [],
  );

  const go = (tick: Tick, el: HTMLElement): void => {
    if (tick.id === page) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // 上一次滚动没走完就点新签子：先把旧签子的读数落定，再起新滚动
      const prev = roll.current;
      if (prev) prev.el.dataset.freq = prev.to.toFixed(1);
      const from = parseFloat(TICKS.find((t) => t.id === page)?.freq ?? tick.freq);
      roll.current = { el, from, to: parseFloat(tick.freq), t0: -1 };
      setTuning(tick.id);
    }
    onGo(tick.id);
  };

  return (
    <header className="ruler" aria-label="站尺">
      <div className="ruler-brand">
        <span className="ruler-dot" aria-hidden="true" />
        <h1>afeifei</h1>
        <span className="ruler-cn">不夜台</span>
      </div>

      <nav className="ruler-ticks" aria-label="房间">
        {TICKS.map((tick) => (
          <button
            type="button"
            key={tick.id}
            data-page={tick.id}
            data-freq={tick.freq}
            aria-label={tick.label}
            className={`ruler-tick${page === tick.id ? " on" : ""}${tuning === tick.id ? " tuning" : ""}`}
            aria-current={page === tick.id ? "page" : undefined}
            onClick={(e) => go(tick, e.currentTarget)}
            title={tick.label}
          >
            <span>{tick.label}</span>
            <i aria-hidden="true" />
          </button>
        ))}
      </nav>

      <form
        className="ruler-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(query.trim());
        }}
      >
        <NavIcon name="search" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索音乐"
          aria-label="搜索在线音乐"
        />
      </form>

      {/* 账号与时钟是站尺右端的「一格」，不是一块面板：只留 22px 头像，
          昵称/音源在悬停提示与账号面板里（面板本来就是完整信息）。 */}
      <div className="ruler-clock">
        <button
          type="button"
          className={`ruler-acct${account.loggedIn ? " on" : ""}`}
          onClick={onAccount}
          title={`账号：${account.loggedIn ? (account.nick ?? "已登录") : "未登录"}（${account.sourceName}）`}
          aria-label={`账号：${account.loggedIn ? (account.nick ?? "已登录") : "未登录"}（${account.sourceName}）`}
        >
          {account.loggedIn ? (
            account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <i className="ruler-acct-dot" aria-hidden="true" />
            )
          ) : (
            <span className="ruler-acct-login">登录</span>
          )}
        </button>
        <time dateTime={now.toISOString()}>{clock}</time>
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          title="日间 / 夜间（只换 token 值）"
          aria-label="切换日间 / 夜间"
        >
          <i className="moon" />
        </button>
      </div>
    </header>
  );
}
