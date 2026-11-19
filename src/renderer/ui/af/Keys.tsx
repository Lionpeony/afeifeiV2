/* 键盘快捷键 · 清单弹层 + 全局键（v5.6 原型） */
import { useEffect, useRef } from "react";

import { useAf } from "./context.js";
import { IconX } from "./icons.js";

const SHORTCUT_GROUPS = [
  {
    title: "播放",
    rows: [["空格", "播放 / 暂停"], ["← →", "后退 / 前进 5 秒"], ["Shift + ← →", "上一首 / 下一首"], ["↑ ↓", "音量 ±5%"], ["M", "静音"], ["L", "喜欢这首歌"]],
  },
  {
    title: "界面",
    rows: [["P", "展开 / 收起播放页"], ["/", "聚焦搜索"], ["H", "播放历史"], ["G", "歌单"], ["D", "发现"], ["Esc", "关闭浮层"]],
  },
  {
    title: "台侧",
    rows: [["T", "定时关闭"], ["Q", "音质"], ["E", "均衡器"], ["K", "媒体键悬浮控制"], ["?", "这份清单"]],
  },
];

export function KeysSheet() {
  const { keysOpen, setKeysOpen } = useAf();
  useEffect(() => {
    const fn = (e: KeyboardEvent): void => { if (e.key === "Escape") setKeysOpen(false); };
    if (keysOpen) document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [keysOpen, setKeysOpen]);
  if (!keysOpen) return null;
  return (
    <>
      <div className="keys-mask" onClick={() => setKeysOpen(false)}></div>
      <div className="keys" role="dialog" aria-modal="true" aria-label="键盘快捷键">
        <div className="keys__head">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26 }}>键盘也弹得了</h2>
          <span className="eyebrow" style={{ marginBottom: 6 }}>KEYBOARD · 不用离开琴键</span>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={() => setKeysOpen(false)} title="关闭" aria-label="关闭快捷键面板"><IconX size={15} /></button>
        </div>
        <div className="keys__grid">
          {SHORTCUT_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="keys__group-title">{g.title}</div>
              {g.rows.map(([k, label]) => (
                <div key={k} className="keys__row"><span>{label}</span><kbd>{k}</kbd></div>
              ))}
            </div>
          ))}
        </div>
        <p className="hand" style={{ fontSize: 12, color: "var(--text-3)", marginTop: 18 }}>在输入框里打字时快捷键不生效，按 Esc 先退出输入。</p>
      </div>
    </>
  );
}

export function Hotkeys() {
  const af = useAf();
  const ref = useRef(af);
  ref.current = af;

  useEffect(() => {
    const typing = (el: Element | null): boolean =>
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable);

    const onKey = (e: KeyboardEvent): void => {
      const a = ref.current;
      const active = document.activeElement;
      if (e.key === "Escape") {
        if (typing(active)) { (active as HTMLElement).blur(); return; }
        if (a.keysOpen) { a.setKeysOpen(false); return; }
        if (a.loginSrc) { a.closeScan(); return; }
        if (a.lyricsFull) { a.setLyricsFull(false); return; }
        if (a.listEditor) { a.setListEditor(null); return; }
        if (a.studio) { a.setStudio(null); return; }
        return;
      }
      if (typing(active)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const stop = (): void => { e.preventDefault(); e.stopPropagation(); };
      const key = k.toLowerCase();
      if (key === "l") { stop(); a.toggleLike(a.track); return; }
      if (key === "p") { stop(); if (a.playerOpen) a.closePlayer(); else a.openPlayer(); return; }
      if (key === "h") { stop(); a.setPage("history"); return; }
      if (key === "g") { stop(); a.setPage("playlists"); return; }
      if (key === "d") { stop(); a.setPage("online"); return; }
      if (key === "k") { stop(); void window.api.toggleMini(); return; }
      if (key === "t") { stop(); a.setStudio({ tab: "sleep" }); return; }
      if (key === "q") { stop(); a.setStudio({ tab: "quality" }); return; }
      if (key === "e") { stop(); a.setStudio({ tab: "eq" }); return; }
      if (k === "?" || (k === "/" && e.shiftKey)) { stop(); a.setKeysOpen(true); return; }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
