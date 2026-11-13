import { useState } from "react";
import type { PageId } from "./pages.js";
import type { Theme } from "./theme.js";

/**
 * 左侧边栏（2026-11-13 改版）：顶栏站尺拆除，导航收进左侧 208px。
 * 一级入口 + 全局搜索 + 账号/主题全在这里；窗口拖拽区挂品牌区。
 * 入口即 PageId，首页已删、并页完成（2026-11-13）：
 * 发现（在线+榜单）/ 本地（曲库+下载+电台）/ 我的（喜欢+最近+统计）都在页内切。
 */
const ITEMS: { id: PageId; label: string }[] = [
  { id: "online", label: "发现" },
  { id: "roam", label: "漫游" },
  { id: "local", label: "本地" },
  { id: "playlists", label: "歌单" },
  { id: "mine", label: "我的" },
  { id: "settings", label: "设置" },
  { id: "stage", label: "直播" },
];

export function Sidebar({
  page,
  onGo,
  onToggleTheme,
  theme,
  account,
  onAccount,
  onSearch,
}: {
  page: PageId;
  onGo(page: PageId): void;
  onToggleTheme(): void;
  /** 当前全局主题：图标表示「现在所处模式」，title 说「切到哪」 */
  theme: Theme;
  /** 当前账号摘要；未登录也要给（显示「登录」入口） */
  account: { nick: string | null; avatarUrl: string | null; sourceName: string; loggedIn: boolean };
  onAccount(): void;
  /** 边栏全局搜索：提交后由宿主跳到在线页并执行 */
  onSearch(query: string): void;
}) {
  const [query, setQuery] = useState("");

  return (
    <aside className="side" aria-label="导航">
      <div className="side-brand">
        <span className="side-dot" aria-hidden="true" />
        <h1>afeifei</h1>
      </div>

      <form
        className="side-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(query.trim());
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索音乐"
          aria-label="搜索在线音乐"
        />
      </form>

      <nav className="side-nav" aria-label="页面">
        {ITEMS.map((item) => (
          <button
            type="button"
            key={item.id}
            data-page={item.id}
            className={`side-item${page === item.id ? " on" : ""}`}
            aria-current={page === item.id ? "page" : undefined}
            onClick={() => {
              if (item.id !== page) onGo(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="side-foot">
        <button
          type="button"
          className={`side-acct${account.loggedIn ? " on" : ""}`}
          onClick={onAccount}
          title={`账号：${account.loggedIn ? (account.nick ?? "已登录") : "未登录"}（${account.sourceName}）`}
          aria-label={`账号：${account.loggedIn ? (account.nick ?? "已登录") : "未登录"}（${account.sourceName}）`}
        >
          {account.loggedIn ? (
            account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <i className="side-acct-dot" aria-hidden="true" />
            )
          ) : (
            <span>登录</span>
          )}
        </button>
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          title={theme === "dark" ? "切换到日间" : "切换到夜间"}
          aria-label={theme === "dark" ? "切换到日间" : "切换到夜间"}
        >
          <i className={theme === "dark" ? "moon" : "sun"} />
        </button>
      </div>
    </aside>
  );
}
