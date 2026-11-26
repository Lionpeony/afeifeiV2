/* 歌曲行「更多」菜单 · 原型 .rowmenu */
import { useEffect, useRef, useState } from "react";

import { useAf } from "./context.js";
import { TrackArt } from "./art.js";
import { AddToListPanel } from "./ListEditor.js";
import { IconDisc, IconDownload, IconHeart, IconHeartFill, IconPlay, IconPlus, IconQueue, IconUser } from "./icons.js";
import { packLineCopy } from "./copy.js";

export function RowMenu() {
  const api = useAf();
  const { rowMenu, closeRowMenu, resolveTrack, isLiked, toggleLike, goTo, playNext, addDownload, toast, palette, openDiscoverDetail } = api;
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [sub, setSub] = useState(false);

  // 打开时记住触发按钮并把焦点移进菜单：Tab 到「更多」按 Enter 后能直接操作
  useEffect(() => {
    if (!rowMenu) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(".rowmenu__item")?.focus();
  }, [rowMenu]);

  useEffect(() => {
    const fn = (e: Event): void => {
      if (e.type === "pointerdown") {
        if (ref.current?.contains(e.target as Node)) return;
        closeRowMenu();
        return;
      }
      const key = (e as KeyboardEvent).key;
      if (key === "Escape") {
        if (triggerRef.current?.isConnected) triggerRef.current.focus(); // 取消后焦点还给「更多」
        closeRowMenu();
        return;
      }
      if (key === "ArrowDown" || key === "ArrowUp") {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(".rowmenu__item") ?? []);
        const idx = items.indexOf(document.activeElement as HTMLElement);
        if (idx === -1) return; // 焦点在子面板输入框里，交给输入框处理
        e.preventDefault();
        const next = key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener("keydown", fn);
    document.addEventListener("pointerdown", fn);
    return () => {
      document.removeEventListener("keydown", fn);
      document.removeEventListener("pointerdown", fn);
    };
  }, [closeRowMenu]);

  if (!rowMenu) return null;
  const t = resolveTrack(rowMenu.trackId);
  const liked = isLiked(t);

  const Item = ({ icon: Ico, children, onClick, hint }: { icon: typeof IconPlay; children: string; onClick(): void; hint?: string }) => (
    <button className="rowmenu__item" role="menuitem" onClick={onClick} title={hint}>
      <span className="rowmenu__ico"><Ico size={15} /></span>
      <span className="rowmenu__label">{children}</span>
      {hint ? <span className="rowmenu__hint">{hint}</span> : null}
    </button>
  );

  return (
    <div className="rowmenu" ref={ref} style={{ left: rowMenu.x, top: rowMenu.y }} role="menu" aria-label={t.title + " 的操作菜单"}>
      <div className="rowmenu__head">
        {t.cover ? <img src={t.cover} alt="" referrerPolicy="no-referrer" /> : <TrackArt id={t.id} size={30} radius={7} />}
        <span className="rowmenu__headtext">
          <b className="truncate">{t.title}</b>
          <span className="meta truncate">{t.artist}</span>
        </span>
      </div>

      <div className="rowmenu__group" role="none">
        <Item icon={IconPlay} onClick={() => { goTo(t.id); closeRowMenu(); }}>立即播放</Item>
        <Item icon={IconQueue} onClick={() => { playNext(t.id); toast(packLineCopy(palette, "enqueue"), { icon: "check" }); closeRowMenu(); }}>下一首播放</Item>
      </div>

      <div className="rowmenu__group" role="none">
        <Item icon={liked ? IconHeartFill : IconHeart} onClick={() => { toggleLike(t); closeRowMenu(); }}>
          {liked ? "取消收藏" : "收藏到我喜欢的音乐"}
        </Item>
        <Item icon={IconPlus} onClick={() => setSub((v) => !v)} hint={sub ? "收起" : "选择"}>收藏到歌单</Item>
        <Item icon={IconDownload} onClick={() => { addDownload(t.id); closeRowMenu(); }}>下载到本地</Item>
      </div>

      <div className="rowmenu__group" role="none">
        <Item
          icon={IconDisc}
          onClick={() => {
            closeRowMenu();
            if (t.remote?.albumId) openDiscoverDetail({ kind: "album", id: t.remote.albumId, name: t.album, coverUrl: t.cover ?? undefined });
            else toast(`《${t.album}》的专辑页还在路上。`, { hand: true });
          }}
        >查看专辑</Item>
        <Item
          icon={IconUser}
          onClick={() => {
            closeRowMenu();
            if (t.remote?.artistId) openDiscoverDetail({ kind: "artist", id: t.remote.artistId, name: t.artist, coverUrl: t.cover ?? undefined });
            else toast(`${t.artist} 的艺人页还在路上。`, { hand: true });
          }}
        >查看艺人</Item>
      </div>
      {sub ? <AddToListPanel trackId={t.id} onDone={closeRowMenu} /> : null}
    </div>
  );
}
