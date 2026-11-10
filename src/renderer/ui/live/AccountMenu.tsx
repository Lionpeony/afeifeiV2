import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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
 * 账号弹层（folia 式双栏，2026-11-10 重设计）：
 * 左栏 = 音源列表（点头像行只是「选中查看」），右栏 = 选中源的上下文。
 * 未登录的源选中后，右栏直接内嵌扫码登录（LoginDialog 以面板形态挂进来），
 * 不再另起一层模态——切账号与登录在同一个弹层里完成。
 *
 * 一个播放器同时只认一个账号：右栏的「切换」才是换源；行选中只换右栏内容。
 */
export function AccountMenu({
  open,
  sources,
  active,
  profiles,
  loginFor,
  renderLogin,
  onClose,
  onSwitch,
  onLogin,
  onLogout,
}: {
  open: boolean;
  sources: AccountOption[];
  active: string;
  profiles: Record<string, AccountProfile | undefined>;
  /** 正在登录的源（右栏切到内嵌扫码面板）；null = 没有登录流程在进行 */
  loginFor: string | null;
  /** 渲染内嵌登录面板（index.tsx 组装该源的全部登录能力） */
  renderLogin(id: string): ReactNode;
  onClose(): void;
  onSwitch(id: string): void;
  /** 打开某源的内嵌登录（父级记 loginFor，本弹层右栏跟着切）；传 null = 取消登录面板 */
  onLogin(id: string | null): void;
  onLogout(id: string): void;
}) {
  /* 离场动画的所有权在组件里：关闭请求先播离场帧，再真调 onClose。
     组件实例常驻（open=false 只是不渲染 DOM），状态必须跟着 open 重置。 */
  const [leaving, setLeaving] = useState(false);
  /* 切换时的行内脉冲：拨到新账号，拨完才真切 */
  const [tuning, setTuning] = useState<string | null>(null);
  /* 退出中的行：行淡出 → 状态才真翻（动画所有权在本组件，父级只管改数据） */
  const [signingOut, setSigningOut] = useState<string | null>(null);
  /* 左栏选中查看的源；默认跟 active。打开弹层时重置。 */
  const [sel, setSel] = useState<string>(active);
  const leaveTimer = useRef<number | undefined>(undefined);
  const signOutTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setLeaving(false);
      setTuning(null);
      setSigningOut(null);
      setSel(active);
    }
    // 只在 open 翻转时重置：active 变化（切源）途中若重置，会清掉挂起的关闭定时器，
    // 弹层就永远关不上（2026-11-10 实测）。active 用闭包里的最新值即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    }, 160);
  };

  const handleSwitch = (id: string): void => {
    if (tuning) return;
    setTuning(id);
    leaveTimer.current = window.setTimeout(() => {
      // 右栏先播「交棒」帧，真切源（父级 onSwitch 会置 open=false + 全页换台闪变）
      setLeaving(true);
      leaveTimer.current = window.setTimeout(() => {
        setLeaving(false);
        onClose();
      }, 160);
      onSwitch(id);
    }, 180);
  };

  /* 退出 = 行淡出降饱和（600ms，给眼睛和证据链都留出抓帧窗口），播完才真登出。
     reduce 用户零延迟直接退，不留空等。 */
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
      // 退的就是正在看的源：右栏跟着翻成未登录态
      setSel((s) => (s === id ? id : s));
    }, 600);
  };

  if (!open && !leaving) return null;
  const selected = sources.find((s) => s.id === sel) ?? sources[0];
  const selectedProfile = profiles[selected?.id ?? ""];
  const loginOpen = loginFor != null && loginFor === sel;
  return (
    <>
      <button type="button" className={`acct-scrim${leaving ? " leaving" : ""}`} aria-label="关闭账号弹层" onClick={requestClose} />
      <div className={`acct-menu${leaving ? " leaving" : ""}`} role="dialog" aria-label="账号">
        {/* 左栏：音源列表。行点击只换右栏，不切源。 */}
        <div className="acct-left">
          <header className="acct-head">
            <b>账号</b>
            <span>{sources.length} 个源</span>
          </header>
          <div className="acct-list">
            {sources.map((source, i) => {
              const profile = profiles[source.id];
              const on = source.id === active;
              const viewed = source.id === sel;
              const status = profile?.loggedIn
                ? on
                  ? "使用中"
                  : (profile.nick ?? "已登录")
                : "未登录";
              return (
                /* --row-i 是进场错落的节拍：每行晚 40ms 浮入（纯展示延迟） */
                <button
                  type="button"
                  className={`acct-row${viewed ? " on" : ""}${tuning === source.id ? " tuning" : ""}${
                    signingOut === source.id ? " signout" : ""
                  }`}
                  key={source.id}
                  style={{ "--row-i": i } as CSSProperties}
                  onClick={() => {
                    setSel(source.id);
                    // 换行看 = 取消正在开的登录面板（loginFor 挂在父级，这里显式交还）
                    if (loginFor && loginFor !== source.id) onLogin(null);
                  }}
                  aria-pressed={viewed}
                >
                  <Avatar name={profile?.nick ?? null} url={profile?.avatarUrl ?? null} />
                  <span className="acct-row-tx">
                    <b>{source.name}</b>
                    <span className={profile?.loggedIn && on ? "ok" : undefined}>{status}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <footer className="acct-foot">
            <span>一个播放器只认一个账号</span>
          </footer>
        </div>

        {/* 右栏：跟随左栏选中态。key 换一次 = 内容转场一次（pane-swap）。 */}
        <div className="acct-right">
          <button type="button" className="acct-menu-x" aria-label="关闭" onClick={requestClose}>
            ×
          </button>
          {!selected ? null : loginOpen ? (
            <div className="acct-pane" key={`login-${sel}`}>
              {renderLogin(sel)}
            </div>
          ) : selectedProfile?.loggedIn ? (
            <div className="acct-pane" key={`prof-${sel}`}>
              <div className="acct-prof">
                <Avatar name={selectedProfile.nick} url={selectedProfile.avatarUrl} big />
                <h3>{selectedProfile.nick ?? "已登录"}</h3>
                <p>{selected.name} · 已同步红心与播放记录</p>
                {selected.id === active ? <span className="onair-badge">使用中</span> : null}
                <div className="acct-acts">
                  {selected.id === active ? null : (
                    <button type="button" className="acct-act" onClick={() => handleSwitch(selected.id)}>
                      切换到此账号
                    </button>
                  )}
                  <button type="button" className="acct-act ghost" onClick={() => handleLogout(selected.id)}>
                    退出登录
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="acct-pane" key={`off-${sel}`}>
              <div className="acct-prof">
                <Avatar name={null} url={null} big />
                <h3>{selected.name}</h3>
                <p>未登录。登录后，每日推荐、红心、播放记录与漫游都只属于这个账号。</p>
                <div className="acct-acts">
                  <button
                    type="button"
                    className="acct-act"
                    disabled={!selected.canAuth}
                    onClick={() => onLogin(selected.id)}
                  >
                    {selected.canAuth ? "扫码登录" : "此源不可登录"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Avatar({ name, url, big }: { name: string | null; url: string | null; big?: boolean }) {
  if (url) {
    return <img className={`acct-av${big ? " big" : ""}`} src={url} alt="" referrerPolicy="no-referrer" />;
  }
  const initial = (name ?? "?").trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span className={`acct-av fallback${big ? " big" : ""}`} aria-hidden="true">
      {initial}
    </span>
  );
}
