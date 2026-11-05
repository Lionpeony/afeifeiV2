import type { PageId } from "../pages.js";
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
}

const TICKS: Tick[] = [
  { id: "home", label: "首页" },
  { id: "online", label: "在线" },
  { id: "charts", label: "榜单" },
  { id: "radio", label: "电台" },
  { id: "roam", label: "漫游" },
  { id: "local", label: "本地" },
  { id: "downloads", label: "下载" },
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
}: {
  page: PageId;
  onGo(page: PageId): void;
  onToggleTheme(): void;
  /** 当前账号摘要；未登录也要给（显示「未登录」入口） */
  account: { nick: string | null; avatarUrl: string | null; sourceName: string; loggedIn: boolean };
  onAccount(): void;
}) {
  const second = useNowSecond();
  const now = new Date(second * 1000);
  const clock = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

  return (
    <header className="ruler" aria-label="站尺">
      <div className="ruler-brand">
        <span className="ruler-dot" aria-hidden="true" />
        <h1>afeifei</h1>
        <span className="ruler-cn">不夜台</span>
        <span className="ruler-en">AFEIFEI BROADCAST</span>
      </div>

      <nav className="ruler-ticks" aria-label="房间">
        {TICKS.map((tick) => (
          <button
            type="button"
            key={tick.id}
            data-page={tick.id}
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

      <div className="ruler-clock">
        <button
          type="button"
          className={`ruler-acct${account.loggedIn ? " on" : ""}`}
          onClick={onAccount}
          title={`账号：${account.loggedIn ? (account.nick ?? "已登录") : "未登录"}（${account.sourceName}）`}
        >
          {account.avatarUrl ? (
            <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <i className="ruler-acct-dot" aria-hidden="true" />
          )}
          <b>{account.loggedIn ? (account.nick ?? "已登录") : "未登录"}</b>
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
