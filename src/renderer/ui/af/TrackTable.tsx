/* 通用曲目表 · 原型 .tbl（# / TITLE / ARTIST / ALBUM / TIME + 心 + 更多） */
import { useState, type ReactNode } from "react";

import { useAf } from "./context.js";
import type { AfTrack } from "./context.js";
import { TrackArt } from "./art.js";
import { Bars, Strike } from "./ui.js";
import { IconHeart, IconHeartFill, IconMore, IconPick, IconX } from "./icons.js";

const pad = (n: number): string => String(n).padStart(2, "0");
const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function AfTrackTable({
  items,
  onPlay,
  sourceLabel,
  dense,
  onRemove,
  footer,
}: {
  items: AfTrack[];
  onPlay(i: number): void;
  sourceLabel?: string;
  dense?: boolean;
  onRemove?(id: string): void;
  footer?: ReactNode;
}) {
  const af = useAf();
  /* E05 拨片印记：点红心（点亮方向）的那一下，按钮上盖一枚拨片——
     单一 stamp 槽位即可：印记 420ms 自己淡出（stampDown both），换行盖章自然顶替。 */
  const [stampId, setStampId] = useState<string | null>(null);
  return (
    <div className={"tbl" + (dense ? " tbl--dense" : "")}>
      <div className="tbl__head">
        <span className="tbl__c-no">#</span>
        <span className="tbl__c-title">TITLE</span>
        <span className="tbl__c-artist">ARTIST</span>
        <span className="tbl__c-album">ALBUM</span>
        <span className="tbl__c-time">TIME</span>
      </div>
      {items.map((t, i) => {
        const isCur = t.id === af.currentId;
        const isOn = af.isLiked(t);
        return (
          <div
            key={t.id + i}
            className={"tbl__row" + (isCur ? " is-current" : "") + (af.struckId === t.id ? " is-struck" : "")}
            role="button"
            tabIndex={0}
            aria-label={t.title}
            onClick={() => {
              onPlay(i);
              af.openPlayer();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onPlay(i);
                af.openPlayer();
              }
            }}
          >
            <span className="tbl__c-no">{isCur && af.playing ? <Bars /> : <span className="num">{pad(i + 1)}</span>}</span>
            <span className="tbl__c-title">
              {t.cover ? <img className="tbl__cover" src={t.cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <TrackArt id={t.id} size={34} radius={4} />}
              <span className="tbl__title-text">
                <span className="tbl__name truncate" title={t.title}>{t.title}</span>
                <span className="tbl__sub truncate" title={t.artist}>{t.artist}{sourceLabel ? " · " + sourceLabel : ""}</span>
              </span>
            </span>
            <span className="tbl__c-artist truncate" title={t.artist}>{t.artist}</span>
            <span className="tbl__c-album truncate" title={t.album}>{t.album}</span>
            <span className="tbl__c-time">
              <button
                className={"tbl__heart" + (isOn ? " is-on" : "")}
                title="喜欢"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isOn) {
                    setStampId(t.id);
                    af.onomaAt(e.currentTarget, "ペタッ", "coral");
                  }
                  af.toggleLike(t);
                }}
              >
                {isOn ? <IconHeartFill size={14} /> : <IconHeart size={14} />}
                {stampId === t.id ? (
                  <span className="stamp-mark" aria-hidden="true"><IconPick size={22} /></span>
                ) : null}
              </button>
              {onRemove ? (
                <button className="tbl__more tbl__rm" title="从歌单里拿掉" onClick={(e) => { e.stopPropagation(); onRemove(t.id); }}>
                  <IconX size={13} />
                </button>
              ) : null}
              <button className="tbl__more" title="更多操作" onClick={(e) => { e.stopPropagation(); af.openRowMenu(t.id, e.currentTarget.parentElement!.getBoundingClientRect()); }}>
                <IconMore size={15} />
              </button>
              <span className="num">{fmt(t.dur)}</span>
            </span>
            {af.struckId === t.id ? <Strike /> : null}
          </div>
        );
      })}
      {footer}
    </div>
  );
}
