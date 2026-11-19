/* 侧栏 · 原型 .sidebar 结构（200px） */
import { useSyncExternalStore } from "react";

import { useAf } from "./context.js";
import { packLineCopy } from "./copy.js";
import { EGGS } from "./data.js";
import { IconArchive, IconCompass, IconDownload, IconFolder, IconHeart, IconList, IconMoon, IconSettings, IconSparkle, IconSun, LogoMark } from "./icons.js";
import { getLikes, subscribe as subscribeLikes } from "../../domain/likes/index.js";
import { Tape } from "./ui.js";

type NavId = "discover" | "roam" | "local" | "downloads" | "likes" | "history" | "playlists";

export function Sidebar() {
  const { page, setPage, onLogoClick, themePref, setThemePref, eggs, sources, source, accounts, loggedIn, profileOf, track, playing, palette } = useAf();
  const likedCount = useSyncExternalStore(subscribeLikes, () => getLikes().size, () => 0);

  const nav: { id: NavId; label: string; icon: typeof IconCompass }[] = [
    { id: "discover", label: "发现", icon: IconSparkle },
    { id: "roam", label: "漫游", icon: IconCompass },
    { id: "local", label: "本地音乐", icon: IconFolder },
    { id: "downloads", label: "下载管理", icon: IconDownload },
    { id: "likes", label: "我喜欢的音乐", icon: IconHeart },
    { id: "history", label: "播放历史", icon: IconArchive },
    { id: "playlists", label: "歌单", icon: IconList },
  ];

  const activeId: NavId =
    page === "online" || page === "archive"
      ? "discover"
      : page === "roam"
        ? "roam"
        : page === "playlists"
          ? "playlists"
          : page === "local"
            ? "local"
            : page === "downloads"
              ? "downloads"
              : page === "mine"
                ? "likes"
                : page === "history"
                  ? "history"
                  : "discover";

  const go = (id: NavId): void => {
    if (id === "discover") setPage("online");
    else if (id === "roam") setPage("roam");
    else if (id === "playlists") setPage("playlists");
    else if (id === "local") setPage("local");
    else if (id === "downloads") setPage("downloads");
    else if (id === "likes") setPage("mine");
    else if (id === "history") setPage("history");
  };

  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const mon = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"][today.getMonth()];
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][today.getDay()];
  const linked = Object.values(accounts).filter(Boolean).length;
  const src = sources.find((s) => s.id === source);
  const linkedId = sources.find((s) => accounts[s.id])?.id;
  const profile = profileOf(source) ?? (linkedId ? profileOf(linkedId) : null);
  const avatarUrl = profile?.avatarUrl ?? null;
  const nick = profile?.nick ?? null;
  const hasTrack = Boolean(track.id);

  const navButton = (n: { id: NavId; label: string; icon: typeof IconCompass }): React.JSX.Element => {
    const Ico = n.icon;
    const dataPage = n.id === "discover" ? "online" : n.id === "likes" ? "mine" : n.id;
    return (
      <button
        key={n.id}
        className={"nav-item side-item" + (activeId === n.id ? " is-active on" : "")}
        data-page={dataPage}
        onClick={() => go(n.id)}
        title={n.label}
      >
        <span className="nav-ico"><Ico size={18} /></span>
        <span>{n.label}</span>
        {n.id === "likes" && likedCount > 0 ? <span className="num nav-item__count">{likedCount}</span> : null}
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__brand" onClick={onLogoClick} title="AFEIFEI · 点五下试试">
        <span className="brand-mark"><LogoMark size={38} /></span>
        <span className="brand-word">
          <b>AFEIFEI</b>
          <span>少女乐队后台</span>
        </span>
      </div>

      <nav className="nav">
        <div className="nav__label">曲库</div>
        {nav.slice(0, 4).map(navButton)}
        <div className="nav__label nav__label--sub">我的</div>
        {nav.slice(4).map(navButton)}
      </nav>

      {/* 漫画格：当前封面当成「本日公演」的一格；没有封面就是一张字海报 */}
      <button
        type="button"
        className="side-hero"
        onClick={() => setPage("stage")}
        title="展开播放页"
        aria-label="展开播放页"
      >
        <span className="side-hero__panel">
          {hasTrack && track.cover ? (
            <img className="side-hero__img" src={track.cover} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="side-hero__blank">
              <b>{hasTrack ? track.title : "本日の公演"}</b>
              <em>{hasTrack ? track.artist || "未知歌手" : "等待开场"}</em>
            </span>
          )}
          <span className="side-hero__sfx hand" aria-hidden="true">ザッ</span>
          <span className="side-hero__bubble hand">
            {hasTrack ? (playing ? "今晚也唱到散场。" : "先歇一会儿。") : packLineCopy(palette, "queueEmpty")}
          </span>
        </span>
        <span className="side-hero__cap">
          {hasTrack ? `${track.title} · ${track.artist}` : "本日の公演 · 待开场"}
        </span>
      </button>

      <div className="sidebar__next">
        <div className="side-card">
          <Tape w={52} rot={-3} style={{ top: -8, left: "50%", marginLeft: -26 }} />
          <div className="side-card__row">
            <span className="side-card__day">{day}</span>
            <div className="side-card__meta">
              <div>{mon} · {weekday}</div>
              <div style={{ color: "var(--text-3)" }}>{loggedIn ? "音源已就位" : "还没登记账号"}</div>
            </div>
          </div>
          <div className="side-card__note hand">地下室 B1，记得带耳塞。</div>
        </div>

        <div className="side-user">
          <span className="side-user__avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : nick ? (
              nick.slice(0, 1).toUpperCase()
            ) : linked > 1 ? (
              "A"
            ) : (
              "a"
            )}
          </span>
          <span className="side-user__meta">
            <b>{nick ?? src?.name ?? "后台值班"}</b>
            <span className="side-user__stat">{linked}/{sources.length} 音源</span>
          </span>
          <button className="icon-btn" title="设置" data-page="settings" onClick={() => setPage("settings")} style={{ marginLeft: "auto" }}>
            <IconSettings size={16} />
          </button>
        </div>

        <div className="sidebar__foot">
          <span className="eyebrow" style={{ letterSpacing: ".08em", fontSize: 10 }}>彩蛋 {eggs.length}/{EGGS.length}</span>
          <div className="row gap6">
            <button className={"icon-btn" + (themePref === "light" ? " is-on" : "")} onClick={() => setThemePref("light")} title="明亮 · 排练室" aria-label="明亮主题">
              <IconSun size={16} />
            </button>
            <button className={"icon-btn" + (themePref === "dark" ? " is-on" : "")} onClick={() => setThemePref("dark")} title="暗色 · 排练室熄灯" aria-label="暗色主题">
              <IconMoon size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
