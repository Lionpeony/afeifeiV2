import type { PageId } from "./pages.js";
import { NavIcon, type IconName } from "./icons.js";

/**
 * 左侧导航（2026-11-16 整站换装，design: index.html）：
 * 232px、三组导航（浏览 / 曲库 / 系统），底部账号摘要。
 * 品牌与搜索已上移到顶栏；主题切换随「只留深色」一起删除。
 */
const GROUPS: { label: string; items: { id: PageId; label: string; icon: IconName }[] }[] = [
  {
    label: "Browse",
    items: [
      { id: "online", label: "发现", icon: "online" },
      { id: "roam", label: "漫游", icon: "roam" },
      { id: "stage", label: "直播", icon: "radio" },
    ],
  },
  {
    label: "Library",
    items: [
      { id: "local", label: "本地", icon: "local" },
      { id: "playlists", label: "歌单", icon: "playlists" },
      { id: "mine", label: "我的", icon: "liked" },
    ],
  },
  {
    label: "System",
    items: [{ id: "settings", label: "设置", icon: "settings" }],
  },
];

export function Sidebar({
  page,
  onGo,
  account,
  onAccount,
}: {
  page: PageId;
  onGo(page: PageId): void;
  /** 当前账号摘要；未登录也要给（显示「登录」入口） */
  account: { nick: string | null; avatarUrl: string | null; sourceName: string; loggedIn: boolean };
  onAccount(): void;
}) {
  return (
    <aside className="side" aria-label="导航">
      <nav className="side-nav" aria-label="页面">
        {GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-label mono">{group.label}</p>
            {group.items.map((item) => (
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
                <NavIcon name={item.icon} />
                <span className="nav-text">{item.label}</span>
              </button>
            ))}
          </div>
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
        <span className="foot-text">
          <strong>{account.loggedIn ? (account.nick ?? "已登录") : "未登录"}</strong>
          <span>{account.sourceName}</span>
        </span>
      </div>
    </aside>
  );
}
