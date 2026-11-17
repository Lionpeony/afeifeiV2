/* 顶栏 · 原型 .topbar（搜索 / 音源切换 / 窗口按钮 / 账号） */
import { useEffect, useRef, useState } from "react";

import { useAf } from "./context.js";
import { sourceShort, sourceTone } from "./data.js";
import { PillWipe } from "./SourceSwap.js";
import { TrackArt } from "./art.js";
import { Tape } from "./ui.js";
import { GuitarFigure, IconArrowRight, IconSearch } from "./icons.js";

interface RemoteItem {
  sourceId: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  coverUrl?: string;
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

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
  const { searchOnline, playRemote, source, sources, setPage, openList, myLists } = useAf();
  const [tab, setTab] = useState<"track" | "artist" | "album" | "list">("track");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<RemoteItem[]>([]);
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
        })
        .catch(() => {
          if (alive) setItems([]);
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
  const artists = Array.from(new Set(items.map((t) => t.artist).filter(Boolean)));
  const albumNames = Array.from(new Set(items.map((t) => t.album).filter(Boolean)));
  const albums = albumNames.map((name) => ({ name, items: items.filter((t) => t.album === name) }));
  const lists = myLists.filter((l) => l.name.toLowerCase().includes(k));
  const total = items.length + artists.length + albums.length + lists.length;
  const tabs = [
    { id: "track" as const, label: "单曲", n: items.length },
    { id: "artist" as const, label: "艺人", n: artists.length },
    { id: "album" as const, label: "专辑", n: albums.length },
    { id: "list" as const, label: "歌单", n: lists.length },
  ];
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
              <span className="hand">在翻曲库……</span>
            </div>
          ) : total === 0 ? (
            <div className="search-empty-note loop">
              <Tape w={60} rot={-2.5} style={{ top: -9, left: "50%", marginLeft: -30 }} />
              <p>这家 live house 没找到这首曲子。</p>
              <span className="hand">换个词试试，或者去漫游随便听听。</span>
              <button className="btn btn-soft btn-sm" onClick={() => { onClose(); setPage("roam"); }}>
                去迷路漫游<IconArrowRight size={14} />
              </button>
            </div>
          ) : tab === "track" ? (
            <div className="sr-list">
              {items.map((t, i) => (
                <button key={(t.sourceId ?? "") + i} className="sr-row" onClick={() => { playRemote(source, t, items, "搜索"); onClose(); }}>
                  {t.coverUrl ? <img className="sr-row__art" src={t.coverUrl} alt="" referrerPolicy="no-referrer" /> : <span className="sr-row__art sr-row__art--art"><TrackArt id={t.sourceId ?? String(i)} size={40} radius={9} /></span>}
                  <span className="sr-row__main">
                    <span className="sr-row__title truncate"><Mark text={t.title} q={q} /></span>
                    <span className="sr-row__sub truncate"><Mark text={t.artist} q={q} /> · <Mark text={t.album} q={q} /></span>
                  </span>
                  <SourceDots />
                  <span className="sr-row__dur num">{fmt(t.durationMs)}</span>
                </button>
              ))}
            </div>
          ) : tab === "artist" ? (
            <div className="sr-artists">
              {artists.map((a) => {
                const own = items.filter((t) => t.artist === a);
                return (
                  <button key={a} className="sr-artist" onClick={() => { if (own[0]) playRemote(source, own[0], own, "搜索 · 艺人"); onClose(); }}>
                    <span className="sr-artist__avatar">{a.slice(0, 1)}</span>
                    <span className="sr-artist__name truncate"><Mark text={a} q={q} /></span>
                    <span className="meta">{own.length} 首 · {own[0]?.album ?? "—"}</span>
                  </button>
                );
              })}
            </div>
          ) : tab === "album" ? (
            <div className="sr-list">
              {albums.map((al) => (
                <button key={al.name} className="sr-row" onClick={() => { if (al.items[0]) playRemote(source, al.items[0], al.items, "搜索 · 专辑"); onClose(); }}>
                  {al.items[0]?.coverUrl ? <img className="sr-row__art" src={al.items[0].coverUrl} alt="" referrerPolicy="no-referrer" /> : <span className="sr-row__art sr-row__art--art"><TrackArt id={al.name} size={40} radius={9} /></span>}
                  <span className="sr-row__main">
                    <span className="sr-row__title truncate"><Mark text={al.name} q={q} /></span>
                    <span className="sr-row__sub truncate">{al.items[0]?.artist ?? "—"} · {al.items.length} 首</span>
                  </span>
                  <span className="sr-row__tag">{al.items.length} 首</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="sr-list">
              {lists.map((l) => (
                <button key={l.id} className="sr-row" onClick={() => { onClose(); openList(l.id); }}>
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
          <span className="meta">Esc 关闭</span>
        </div>
      </div>
    </>
  );
}

export function Topbar() {
  const { sources, source, switchSource, setPage, tryCode, toast } = useAf();
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
    <header className="topbar">
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
          <span className="searchbox__kbd">/</span>
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
          className="topbar__avatar"
          title="设置 / 账号"
          onClick={() => {
            setPage("settings");
            toast("账号与音源都在设置里。", { hand: true });
          }}
        >
          a
        </button>
      </div>
    </header>
  );
}
