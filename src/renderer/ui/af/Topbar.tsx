/* 顶栏 · 原型 .topbar（搜索 / 音源切换 / 窗口按钮 / 账号） */
import { useEffect, useRef, useState } from "react";

import { useAf } from "./context.js";
import { sourceShort, sourceTone } from "./data.js";
import { PillWipe } from "./SourceSwap.js";
import { TrackArt } from "./art.js";
import { Tape } from "./ui.js";
import { packLineCopy } from "./copy.js";
import { GuitarFigure, IconArrowRight, IconMax, IconMini, IconMin, IconSearch, IconX } from "./icons.js";

/** 最大化后的“还原”图标：两个错位的方框，和 Windows 的含义一致 */
const RestoreGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <rect x="3.6" y="1.6" width="6.8" height="6.8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M1.6 3.6v5.8a1 1 0 0 0 1 1h5.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

interface RemoteItem {
  sourceId: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  coverUrl?: string;
  artistId?: string;
  albumId?: string;
  vip?: boolean;
}

/** 源侧艺人直搜命中（真头像 + 艺人 id）；拿不到就走曲目聚名 */
interface ArtistHit {
  id?: string;
  name: string;
  picUrl?: string;
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/** VIP 金色小角标：权限信息不是错误，永远金色、不折行（.tbl__badge 已有样式） */
const VipBadge = () => <span className="tbl__badge is-vip">VIP</span>;

function Mark({ text, q }: { text: string; q: string }) {
  const key = q.trim();
  if (!key) return <>{text}</>;
  const i = text.toLowerCase().indexOf(key.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="hl">{text.slice(i, i + key.length)}</mark>
      {text.slice(i + key.length)}
    </>
  );
}

function SearchOverlay({ q, onClose }: { q: string; onClose: () => void }) {
  const { searchOnline, playRemote, source, sources, setPage, openList, myLists, palette, openDiscoverDetail, seekOnlineSearch } = useAf();

  const [tab, setTab] = useState<"track" | "artist" | "album" | "list">("track");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<RemoteItem[]>([]);
  const [artistHits, setArtistHits] = useState<ArtistHit[]>([]);
  const key = q.trim();

  useEffect(() => {
    if (!key) return;
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      void searchOnline(key)
        .then((r) => {
          if (!alive) return;
          setItems((r.items as RemoteItem[]) ?? []);
          setArtistHits(r.artists ?? []);
        })
        .catch(() => {
          if (alive) {
            setItems([]);
            setArtistHits([]);
          }
        })
        .finally(() => {
          if (alive) setBusy(false);
        });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key, searchOnline]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const k = key.toLowerCase();

  /* 艺人行 = 源侧直搜（带头像/id）在前，曲目聚出的名字补在后面（同名只留一条） */
  const artistRows = (() => {
    const seen = new Set<string>();
    const rows: ArtistHit[] = [];
    for (const h of artistHits) {
      const kk = h.name.toLowerCase();
      if (seen.has(kk)) continue;
      seen.add(kk);
      rows.push(h);
    }
    for (const name of Array.from(new Set(items.map((t) => t.artist).filter(Boolean)))) {
      const kk = name.toLowerCase();
      if (seen.has(kk)) continue;
      seen.add(kk);
      rows.push({ name });
    }
    return rows;
  })();
  const albumNames = Array.from(new Set(items.map((t) => t.album).filter(Boolean)));
  const albums = albumNames.map((name) => ({ name, items: items.filter((t) => t.album === name) }));
  const lists = myLists.filter((l) => l.name.toLowerCase().includes(k));
  const total = items.length + artistRows.length + albums.length + lists.length;
  const tabs = [
    { id: "track" as const, label: "单曲", n: items.length },
    { id: "artist" as const, label: "艺人", n: artistRows.length },
    { id: "album" as const, label: "专辑", n: albums.length },
    { id: "list" as const, label: "歌单", n: lists.length },
  ];

  /* ↑↓ 键盘选结果：cursor 是当前 tab 列表里的行号，Enter 点真按钮（复用每行的 onClick） */
  const rowsCount =
    tab === "track" ? items.length : tab === "artist" ? artistRows.length : tab === "album" ? albums.length : lists.length;
  const [cursor, setCursor] = useState(0);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* 换词/换 tab 都把光标归零；refs 一并清掉，防止上一 tab 的旧节点还挂着 */
  useEffect(() => {
    setCursor(0);
    rowRefs.current = [];
  }, [key, tab]);

  /* 捕获阶段拦：赶在输入框的 React onKeyDown（Enter 会跑 tryCode）之前 */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.isComposing) return; // 中文输入法选词的 Enter 不能当成「播放」
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (busy || rowsCount === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setCursor((c) => (c + 1) % rowsCount);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setCursor((c) => (c - 1 + rowsCount) % rowsCount);
      } else if (e.key === "Enter" && rowRefs.current[cursor]) {
        e.preventDefault();
        e.stopPropagation();
        rowRefs.current[cursor]?.click();
      }
    };
    document.addEventListener("keydown", fn, true);
    return () => document.removeEventListener("keydown", fn, true);
  }, [onClose, busy, rowsCount, cursor]);

  /* 光标行滚进可视区（只在必要时动，nearest 不会乱跳） */
  useEffect(() => {
    rowRefs.current[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  const SourceDots = () => (
    <span className="src-dots">
      {sources.map((s) => (
        <span key={s.id} className={"src-dot" + (s.id === source ? " is-ok" : " is-none")} style={{ ["--src" as string]: s.tone }} title={s.name}>
          {s.id === source ? sourceShort(s.id, s.name) : "—"}
        </span>
      ))}
    </span>
  );

  return (
    <>
      <div className="search-scrim" onPointerDown={onClose}></div>
      <div className="search-overlay" role="dialog" aria-label="搜索结果">
        <div className="search-overlay__tabs">
          {tabs.map((t) => (
            <button key={t.id} className={"search-tab" + (tab === t.id ? " is-on" : "")} onClick={() => setTab(t.id)}>
              {t.label}
              <span className="num">{t.n}</span>
            </button>
          ))}
          <span className="search-overlay__total meta">「{key}」共 {total} 条</span>
        </div>

        <div className="search-overlay__body">
          {busy ? (
            <div className="search-busy">
              <span className="search-busy__guitar" aria-hidden="true"><GuitarFigure w={110} h={52} /></span>
              <span className="hand">{packLineCopy(palette, "loadingSkeleton")}</span>
            </div>
          ) : total === 0 ? (
            <div className="search-empty-note loop">
              <Tape w={60} rot={-2.5} style={{ top: -9, left: "50%", marginLeft: -30 }} />
              <p>{packLineCopy(palette, "emptySearch")}</p>
              <span className="hand">换个词试试，或者去漫游随便听听。</span>
              <button className="btn btn-soft btn-sm" onClick={() => { onClose(); setPage("roam"); }}>
                去迷路漫游<IconArrowRight size={14} />
              </button>
            </div>
          ) : tab === "track" ? (
            <>
              <div className="sr-list">
                {items.map((t, i) => (
                  <button
                    key={(t.sourceId ?? "") + i}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    className={"sr-row" + (i === cursor ? " is-cursor" : "")}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => { playRemote(source, t, items, "搜索"); onClose(); }}
                  >
                    {t.coverUrl ? <img className="sr-row__art" src={t.coverUrl} alt="" referrerPolicy="no-referrer" /> : <span className="sr-row__art sr-row__art--art"><TrackArt id={t.sourceId ?? String(i)} size={40} radius={9} /></span>}
                    <span className="sr-row__main">
                      <span className="sr-row__title-row">
                        <span className="sr-row__title truncate"><Mark text={t.title} q={q} /></span>
                        {t.vip ? <VipBadge /> : null}
                      </span>
                      <span className="sr-row__sub truncate"><Mark text={t.artist} q={q} /> · <Mark text={t.album} q={q} /></span>
                    </span>
                    <SourceDots />
                    <span className="sr-row__dur num">{fmt(t.durationMs)}</span>
                  </button>
                ))}
              </div>
              {/* 批量下载的入口：整表（全选/下载选中）在发现页，浮层只管速选 */}
              <div className="sr-allrow">
                <button className="btn btn-ghost btn-sm" onClick={() => { onClose(); seekOnlineSearch(key); }}>
                  查看全部结果<IconArrowRight size={14} />
                </button>
              </div>
            </>
          ) : tab === "artist" ? (
            <div className="sr-artists">
              {artistRows.map((a, i) => {
                const own = items.filter((t) => t.artist === a.name);
                const first = own[0];
                /* 直搜的艺人 id 优先（头像和详情页同源）；没有就回落曲目的 artistId */
                const detailId = a.id ?? first?.artistId;
                return (
                  <button
                    key={(a.id ?? "") + a.name + i}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    className={"sr-artist" + (i === cursor ? " is-cursor" : "")}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      onClose();
                      /* 有艺人 id 就进艺人详情页（像 QQ 搜索的歌手栏）；没有的源回落直播 */
                      if (detailId) {
                        openDiscoverDetail({ kind: "artist", id: detailId, name: a.name, coverUrl: a.picUrl ?? first?.coverUrl });
                        return;
                      }
                      if (first) playRemote(source, first, own, "搜索 · 艺人");
                    }}
                  >
                    {a.picUrl ? (
                      <img className="sr-artist__avatar sr-artist__avatar--pic" src={a.picUrl} alt="" referrerPolicy="no-referrer" loading="lazy" />
                    ) : (
                      <span className="sr-artist__avatar">{a.name.slice(0, 1)}</span>
                    )}
                    <span className="sr-artist__name truncate"><Mark text={a.name} q={q} /></span>
                    <span className="meta">{own.length ? `${own.length} 首 · ${first?.album ?? "—"}` : "艺人"}</span>
                  </button>
                );
              })}
            </div>
          ) : tab === "album" ? (
            <div className="sr-list">
              {albums.map((al, i) => {
                const first = al.items[0];
                return (
                  <button
                    key={al.name}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    className={"sr-row" + (i === cursor ? " is-cursor" : "")}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      onClose();
                      /* 有专辑 id 就进专辑详情页；没有的源回落直播 */
                      if (first?.albumId) {
                        openDiscoverDetail({ kind: "album", id: first.albumId, name: al.name, coverUrl: first.coverUrl });
                        return;
                      }
                      if (first) playRemote(source, first, al.items, "搜索 · 专辑");
                    }}
                  >
                    {first?.coverUrl ? <img className="sr-row__art" src={first.coverUrl} alt="" referrerPolicy="no-referrer" /> : <span className="sr-row__art sr-row__art--art"><TrackArt id={al.name} size={40} radius={9} /></span>}
                    <span className="sr-row__main">
                      <span className="sr-row__title truncate"><Mark text={al.name} q={q} /></span>
                      <span className="sr-row__sub truncate">{first?.artist ?? "—"} · {al.items.length} 首</span>
                    </span>
                    <span className="sr-row__tag">{al.items.length} 首</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="sr-list">
              {lists.map((l, i) => (
                <button
                  key={l.id}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className={"sr-row" + (i === cursor ? " is-cursor" : "")}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => { onClose(); openList(l.id); }}
                >
                  <span className="sr-row__art sr-row__art--art"><TrackArt id={"cover-" + l.cover} size={40} radius={9} /></span>
                  <span className="sr-row__main">
                    <span className="sr-row__title truncate"><Mark text={l.name} q={q} /></span>
                    <span className="sr-row__sub truncate">{l.tracks.length} 首 · {l.note || "我的歌单"}</span>
                  </span>
                  <span className="sr-row__tag">我的</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="search-overlay__foot">
          <span className="meta">结果来自当前音源 · 我的歌单来自本地</span>
          <span className="meta">↑↓ 选择 · Enter 播放 · Esc 关闭</span>
        </div>
      </div>
    </>
  );
}

export function Topbar() {
  const { sources, source, switchSource, tryCode } = useAf();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.api.windowIsMaximized().then((v) => {
      if (alive) setMaximized(v);
    });
    window.api.onWindowMaximized((v) => setMaximized(v));
    return () => {
      alive = false;
    };
  }, []);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);

  const win = (window as unknown as { api?: { winMinimize?(): void; winMaximize?(): void; winClose?(): void } }).api;

  return (
    <header
      className="topbar"
      onDoubleClick={(e) => {
        const el = e.target as HTMLElement;
        if (el.closest("button, input, .win-ctrl, .searchbox, .src-switch")) return;
        void window.api.toggleMaximize().then(setMaximized);
      }}
    >
      <div className="searchbox">
        <div className="searchbox__field">
          <IconSearch size={15} style={{ color: "var(--text-3)", flex: "none" }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(Boolean(e.target.value.trim()));
            }}
            onFocus={() => {
              if (q.trim()) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (tryCode(q.trim())) {
                  setQ("");
                  setOpen(false);
                  return;
                }
                setOpen(Boolean(q.trim()));
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="搜索曲目、艺人或专辑"
            aria-label="搜索曲目、艺人或专辑"
            autoComplete="off"
            spellCheck={false}
          />
          {q ? (
            <button
              type="button"
              className="searchbox__clear"
              title="清空搜索"
              aria-label="清空搜索"
              onClick={() => {
                setQ("");
                setOpen(false);
                inputRef.current?.focus();
              }}
            >
              <IconX size={13} />
            </button>
          ) : (
            <span className="searchbox__kbd">/</span>
          )}
        </div>
        {open && q.trim() ? <SearchOverlay q={q} onClose={() => setOpen(false)} /> : null}
      </div>

      <div className="topbar__right">
        <div className="src-switch" title="当前音源">
          <PillWipe />
          {sources.map((s) => (
            <button
              key={s.id}
              className={"src-switch__btn" + (source === s.id ? " is-on" : "")}
              onClick={() => switchSource(s.id, { scope: "pill", quiet: true })}
              title={s.name}
            >
              <i style={{ background: sourceTone(s.id) }}></i>
              {sourceShort(s.id, s.name)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="topbar__mini"
          title="迷你小窗（K）"
          aria-label="迷你小窗"
          onClick={() => void window.api.toggleMini()}
        >
          <IconMini size={16} />
        </button>
        <div className="win-ctrl" aria-label="窗口控制">
          <button type="button" title="最小化" aria-label="最小化" onClick={() => void window.api.minimizeWindow()}>
            <IconMin size={14} />
          </button>
          <button
            type="button"
            title={maximized ? "还原" : "最大化"}
            aria-label={maximized ? "还原" : "最大化"}
            onClick={() => void window.api.toggleMaximize().then(setMaximized)}
          >
            {maximized ? <RestoreGlyph /> : <IconMax size={12} />}
          </button>
          <button type="button" title="关闭" aria-label="关闭" onClick={() => void window.api.closeWindow()}>
            <IconX size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
