import { useState } from "react";
import { NavIcon } from "./icons.js";

export interface TopbarProps {
  /** 当前账号摘要；未登录也显示头像位 */
  account: { nick: string | null; avatarUrl: string | null; sourceName: string; loggedIn: boolean };
  /** 打开账号菜单（与左栏底部同一个入口） */
  onAccount(): void;
  /** 提交搜索：宿主负责跳页与发起请求 */
  onSearch(query: string): void;
}

/**
 * 顶栏（2026-11-16 整站换装，design: index.html）：
 * 品牌 / 搜索 / 账号三段。搜索是全站唯一入口（原来在左栏），
 * 品牌区承担窗口拖拽；按钮一律 no-drag，否则点不动。
 */
export function Topbar({ account, onAccount, onSearch }: TopbarProps) {
  const [query, setQuery] = useState("");
  const initial = (account.nick ?? "A").trim().slice(0, 1).toUpperCase() || "A";

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">AFEIFEI</span>
      </div>

      <form
        className="search"
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
          placeholder="搜索曲目、艺人或专辑"
          aria-label="搜索曲目、艺人或专辑"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd>/</kbd>
      </form>

      <div className="top-actions">
        <button
          type="button"
          className={`avatar${account.loggedIn ? " on" : ""}`}
          onClick={onAccount}
          title={`账号：${account.loggedIn ? (account.nick ?? "已登录") : "未登录"}（${account.sourceName}）`}
          aria-label={`账号：${account.loggedIn ? (account.nick ?? "已登录") : "未登录"}（${account.sourceName}）`}
        >
          {account.avatarUrl ? <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" /> : initial}
        </button>
      </div>
    </header>
  );
}
