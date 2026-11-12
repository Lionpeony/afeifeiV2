import { useState } from "react";
import type { PageId } from "../pages.js";
import { NavIcon } from "../icons.js";
import { useNowSecond } from "./useStation.js";

/**
 * 顶部 44px 站尺：一排页面入口。
 *
 * 不做"主导航 + 我的 + 设置"三段式 —— 那还是播放器侧栏。
 * 当前页点亮，其余压暗。整条是窗口拖拽区（live 壳没有标题栏），按钮自己 no-drag。
 *
 * 2026-11-10：删掉调频读数（88.1 那套）与副标。导航只需要名字，
 * 不挂假频率——主题已整体弃用，这里连刻度短横也不再留。
 */

interface Tick {
  id: PageId;
  label: string;
}

const TICKS: Tick[] = [
  { id: "home", label: "首页" },
  { id: "online", label: "在线" },
  { id: "roam", label: "漫游" },
  { id: "local", label: "本地" },
  { id: "playlists", label: "歌单" },
  { id: "liked", label: "喜欢" },
  { id: "recent", label: "最近" },
  { id: "stats", label: "统计" },
  { id: "settings", label: "设置" },
  { id: "stage", label: "直播" },
];

const pad2 = (n: number): string => String(n).padStart(2, "0");

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
  /* 只到分钟（2026-11-12）：秒级跳动等于每秒钟一次全屏文本变化，
     在一台"正在听歌"的设备上是持续噪声，而且没人靠顶栏读秒。
     dateTime 仍走完整时间戳，语义不受影响。 */
  const clock = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  const go = (tick: Tick): void => {
    if (tick.id === page) return;
    onGo(tick.id);
  };

  return (
    <header className="ruler" aria-label="站尺">
      <div className="ruler-brand">
        <span className="ruler-dot" aria-hidden="true" />
        <h1>afeifei</h1>
      </div>

      <nav className="ruler-ticks" aria-label="房间">
        {TICKS.map((tick) => (
          <button
            type="button"
            key={tick.id}
            data-page={tick.id}
            aria-label={tick.label}
            className={`ruler-tick${page === tick.id ? " on" : ""}`}
            aria-current={page === tick.id ? "page" : undefined}
            onClick={() => go(tick)}
            title={tick.label}
          >
            <span>{tick.label}</span>
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
