import type { CSSProperties } from "react";

export interface AccountOption {
  id: string;
  name: string;
  /** 这个源能不能登录（不能登录的只做账号/数据展示） */
  canAuth: boolean;
}

export interface AccountProfile {
  loggedIn: boolean;
  nick: string | null;
  avatarUrl: string | null;
}

/**
 * 账号面板（不夜台站尺右端）：当前账号的头像与昵称 + 全部可登录源。
 *
 * 一个播放器同时只认一个账号：点某个源就是切换账号（active-source），
 * 每日推荐 / 红心 / 播放记录 / 漫游随之换源。未登录的源在这里直接给登录入口。
 */
export function AccountMenu({
  open,
  sources,
  active,
  profiles,
  onClose,
  onSwitch,
  onLogin,
  onLogout,
}: {
  open: boolean;
  sources: AccountOption[];
  active: string;
  profiles: Record<string, AccountProfile | undefined>;
  onClose(): void;
  onSwitch(id: string): void;
  onLogin(id: string): void;
  onLogout(id: string): void;
}) {
  if (!open) return null;
  const current = profiles[active];
  return (
    <>
      <button type="button" className="acct-scrim" aria-label="关闭账号面板" onClick={onClose} />
      <div className="acct-menu" role="dialog" aria-label="账号">
        <header className="acct-menu-head">
          {/* 电台叙事：音源 = 频段，面板就是调频台的本机频段表 */}
          <span>账号 · 频段表</span>
          <button type="button" className="acct-menu-x" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>

        {current?.loggedIn ? (
          <div className="acct-now">
            <Avatar name={current.nick} url={current.avatarUrl} />
            <div>
              <b>{current.nick ?? "已登录"}</b>
              <span>{sources.find((s) => s.id === active)?.name ?? active}</span>
            </div>
          </div>
        ) : (
          <p className="acct-menu-hint">当前音源未登录。登录后，每日推荐、红心、播放记录与漫游都只属于这个账号。</p>
        )}

        <div className="acct-list">
          {sources.map((source, i) => {
            const profile = profiles[source.id];
            const on = source.id === active;
            const bars = profile?.loggedIn ? 3 : 0;
            return (
              /* style 是进场错落的节拍：每行晚 40ms 浮入（纯展示延迟，css 变量不走状态） */
              <div className={`acct-row${on ? " on" : ""}`} key={source.id} style={{ "--row-i": i } as CSSProperties}>
                <Avatar name={profile?.nick ?? null} url={profile?.avatarUrl ?? null} small />
                <div className="acct-row-tx">
                  <b>{source.name}</b>
                  <span>{profile?.loggedIn ? (profile.nick ?? "已登录") : "未登录"}</span>
                </div>
                {/* 信号强度格：登录了才有信号——0 格的频段调不进来 */}
                <span
                  className={`acct-sig${bars ? "" : " mute"}`}
                  title={profile?.loggedIn ? "信号良好" : "无信号（未登录）"}
                  aria-hidden="true"
                >
                  <i className={bars > 0 ? "hit" : ""} />
                  <i className={bars > 1 ? "hit" : ""} />
                  <i className={bars > 2 ? "hit" : ""} />
                </span>
                {profile?.loggedIn ? (
                  <>
                    {on ? (
                      /* 正在使用的频段不摆按钮：ON AIR 灯牌，红点呼吸 */
                      <span className="onair-badge">
                        <i aria-hidden="true" />
                        ON AIR
                      </span>
                    ) : (
                      <button type="button" className="acct-act" onClick={() => onSwitch(source.id)}>
                        切换
                      </button>
                    )}
                    <button type="button" className="acct-act ghost" onClick={() => onLogout(source.id)}>
                      退出
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="acct-act"
                    disabled={!source.canAuth}
                    onClick={() => onLogin(source.id)}
                  >
                    {source.canAuth ? "登录" : "不可登录"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Avatar({ name, url, small }: { name: string | null; url: string | null; small?: boolean }) {
  if (url) {
    return <img className={`acct-av${small ? " sm" : ""}`} src={url} alt="" referrerPolicy="no-referrer" />;
  }
  const initial = (name ?? "?").trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span className={`acct-av fallback${small ? " sm" : ""}`} aria-hidden="true">
      {initial}
    </span>
  );
}
