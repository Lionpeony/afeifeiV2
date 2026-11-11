import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

import type { RemoteTrack } from "../../../../contracts/capability.js";
import { fmtDuration } from "../../views/library/rows.js";
import { sideLabel } from "./release-data.js";

/**
 * 曲目表（docs/29 §6.3 / SPEC-VISUAL §2.4 / SPEC-UX §2.3 §3.1）：
 * 印刷曲目单——侧标 / 曲名 / 引导点（dotted --ink-faint）/ 时长，无封面。
 * 语义 = listbox（环列，在播行恒在表首 A1）+ roving tabindex：
 * 行不进 Tab 链，↑↓ 首尾环回、Home/End、Enter/Space 激活；hover ▶ 是 aria-hidden 装饰。
 */
export function ReleaseTracklist({
  program,
  leadIndex,
  live,
  playing,
  onPlay,
  showReload,
  reloading,
  onReload,
}: {
  program: RemoteTrack[];
  /** 环列 0（在播/待播首行）在本期列表里的下标：待机 = 0，环回后归 0 */
  leadIndex: number;
  live: boolean;
  /** 暂停时律动条定格（不播假动画，SPEC-VISUAL §6） */
  playing: boolean;
  onPlay(track: RemoteTrack, ringPos: number): void;
  /** 「换一张」只在今日发行/待机投影出现（客座发行隐藏，与现版刷新语义一致） */
  showReload: boolean;
  reloading: boolean;
  onReload(): void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const lastFocus = useRef(-1);
  const total = program.length;
  // 环列起播位恒为 A1（在播行就是表首行），表头面字母由它决定
  const sideX = sideLabel(0)[0];

  // 环回一致性（SPEC-UX §6.3）：由 leadIndex 单值驱动，回 A1 时表滚动位同帧回顶
  useEffect(() => {
    if (leadIndex === 0 && listRef.current) listRef.current.scrollTop = 0;
  }, [leadIndex, total]);

  // 焦点记忆（SPEC-UX §2.3）：换曲/换源重排后，焦点原在行上就保持在同 index（变短 clamp），确已丢失才落首行
  useEffect(() => {
    const active = document.activeElement;
    if (active && (rowRefs.current.some((el) => el === active) || active === listRef.current)) return;
    if (lastFocus.current >= 0 && active === document.body) {
      rowRefs.current[Math.min(lastFocus.current, Math.max(0, total - 1))]?.focus();
    }
  }, [program, leadIndex, total]);

  const focusRow = (i: number): void => {
    rowRefs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLOListElement>): void => {
    if (total === 0) return;
    const cur = rowRefs.current.indexOf(document.activeElement as HTMLLIElement | null);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(cur < 0 ? 0 : Math.min(total - 1, cur + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusRow(cur < 0 ? 0 : Math.max(0, cur - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusRow(total - 1);
    } else if ((e.key === "Enter" || e.key === " ") && cur >= 0) {
      e.preventDefault();
      onPlay(program[(leadIndex + cur) % total], cur);
    }
  };

  return (
    <section className="rs-tracks" aria-label="本期曲目（循环列表）" data-playing={playing ? "true" : "false"}>
      <header className="rs-tracks-head">
        <h2>接下来播放</h2>
        <span className="rs-side">SIDE {sideX} · {total} TRACKS</span>
        {showReload ? (
          <button
            type="button"
            className="rs-reload"
            aria-busy={reloading}
            disabled={reloading}
            onClick={onReload}
          >
            换一张
          </button>
        ) : null}
      </header>
      {total === 1 ? <p className="rs-single">单曲发行 · 循环播放</p> : null}
      <ol
        ref={listRef}
        className="rs-list"
        role="listbox"
        aria-label="本期曲目（循环列表）"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocusCapture={(e) => {
          const target = e.target as Element;
          const i = rowRefs.current.findIndex((el) => el === target);
          if (i >= 0) lastFocus.current = i;
        }}
      >
        {program.map((_, i) => {
          const track = program[(leadIndex + i) % total];
          const isOn = live && i === 0;
          const dur = fmtDuration(track.durationMs);
          return (
            <li
              key={track.sourceId}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              role="option"
              tabIndex={-1}
              className={isOn ? "rs-row on" : "rs-row"}
              style={{ "--row-i": Math.min(i, 8) } as React.CSSProperties}
              aria-selected={isOn}
              aria-label={`播放 ${track.title}，${track.artist}，${dur}`}
              title={`${track.title} — ${track.artist}`}
              onClick={() => onPlay(track, i)}
            >
              <span className="rs-no" aria-hidden="true">
                {sideLabel(i)}
              </span>
              {isOn ? (
                <span className="rs-eq" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
              <span className="rs-name" title={track.title}>
                {track.title}
              </span>
              <i className="leader" aria-hidden="true" />
              <span className="rs-dur" aria-hidden="true">
                {dur}
              </span>
              {isOn ? (
                <span className="rs-play rs-play-pause" aria-hidden="true">
                  <i />
                  <i />
                </span>
              ) : (
                <span className="rs-play" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
