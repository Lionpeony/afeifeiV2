import { useEffect, useRef, useState, type CSSProperties } from "react";

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
  /* 离场动画的所有权在组件里：关闭请求先播 190ms 上滑淡出，再真调 onClose。
     组件实例常驻（open=false 只是不渲染 DOM），状态必须跟着 open 重置——
     否则上一次的 leaving 会把下一次打开的面板钉在离场末帧（透明），
     用户看到的就是"没有动画，直接切过去了"。 */
  const [leaving, setLeaving] = useState(false);
  /* 切换时的行内脉冲：像把指针拨到新频段，拨完才真切 */
  const [tuning, setTuning] = useState<string | null>(null);
  /* 退出中的行：信号格逐格熄灭 → 状态才真翻（动画所有权在本组件，父级只管改数据） */
  const [signingOut, setSigningOut] = useState<string | null>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  const signOutTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      window.clearTimeout(leaveTimer.current);
      window.clearTimeout(signOutTimer.current);
      setLeaving(false);
      setTuning(null);
      setSigningOut(null);
    }
  }, [open]);
  useEffect(
    () => () => {
      window.clearTimeout(leaveTimer.current);
      window.clearTimeout(signOutTimer.current);
    },
    [],
  );

  const requestClose = (): void => {
    if (leaving) return;
    setLeaving(true);
    leaveTimer.current = window.setTimeout(() => {
      setLeaving(false);
      onClose();
    }, 190);
  };

  const handleSwitch = (id: string): void => {
    if (tuning) return;
    setTuning(id);
    leaveTimer.current = window.setTimeout(() => {
      // 先进离场态撑住 DOM（父级 onSwitch 会立刻置 open=false），再真切
      setLeaving(true);
      leaveTimer.current = window.setTimeout(() => {
        setLeaving(false);
        onClose();
      }, 190);
      onSwitch(id);
    }, 160);
  };

  const handleLogin = (id: string): void => {
    // 面板滑出、登录弹层随后落位——两个浮层不叠脸
    requestClose();
    leaveTimer.current = window.setTimeout(() => onLogin(id), 190);
  };

  /* 退出 = 断信号：三格信号从高到低依次熄灭（440ms），播完才真登出。
     reduce 用户没有逐格熄灭，零延迟直接退出，不留空等。 */
  const handleLogout = (id: string): void => {
    if (tuning || signingOut) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      onLogout(id);
      return;
    }
    setSigningOut(id);
    signOutTimer.current = window.setTimeout(() => {
      setSigningOut(null);
      onLogout(id);
    }, 440);
  };

  if (!open && !leaving) return null;
  const current = profiles[active];
  return (
    <>
      <button type="button" className={`acct-scrim${leaving ? " leaving" : ""}`} aria-label="关闭账号面板" onClick={requestClose} />
      <div className={`acct-menu${leaving ? " leaving" : ""}`} role="dialog" aria-label="账号">
        <header className="acct-menu-head">
          {/* 电台叙事：音源 = 频段，面板就是调频台的本机频段表 */}
          <span>账号 · 频段表</span>
          <button type="button" className="acct-menu-x" aria-label="关闭" onClick={requestClose}>
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
              <div
                className={`acct-row${on ? " on" : ""}${tuning === source.id ? " tuning" : ""}${
                  signingOut === source.id ? " signout" : ""
                }`}
                key={source.id}
                style={{ "--row-i": i } as CSSProperties}
              >
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
                      <button type="button" className="acct-act" onClick={() => handleSwitch(source.id)}>
                        切换
                      </button>
                    )}
                    <button type="button" className="acct-act ghost" onClick={() => handleLogout(source.id)}>
                      退出
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="acct-act"
                    disabled={!source.canAuth}
                    onClick={() => handleLogin(source.id)}
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
