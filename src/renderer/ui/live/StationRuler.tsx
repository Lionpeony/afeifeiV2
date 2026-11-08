import { useState } from "react";
import type { PageId } from "../pages.js";
import { NavIcon } from "../icons.js";
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
            className={`ruler-tick${page === tick.id ? " on" : ""}`}
            aria-current={page === tick.id ? "page" : undefined}
            onClick={() => onGo(tick.id)}
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
