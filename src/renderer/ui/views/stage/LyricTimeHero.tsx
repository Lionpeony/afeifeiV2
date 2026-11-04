import { type ReactNode } from "react";
import type { LyricDoc, LyricLine } from "../../../../contracts/lyric.js";
import { fmt } from "./types.js";

const SCRIPT_ROWS = 12;

export interface LyricTimeHeroProps {
  doc: LyricDoc | null;
  note: string;
  line: LyricLine | null;
  lineIndex: number;
  wordIndex: number;
  renderer: "press" | "karaoke" | "minimal" | "theatrical";
  translationOn: boolean;
  onSeek(positionMs: number): void;
}

/**
 * 「歌词即时间」首屏（Type Is Time）：
 * 当前真实歌词是 L-d 的主视觉。有逐字数据时，活动词按词级时间切换层级；
 * 没有逐字数据就用行级呈现（一个 unit 覆盖整行），不模拟打字。
 * 预设换装只改 --stage-* token；这个组件读的是同一份 LyricDoc + 同一时刻。
 */
export function LyricTimeHero({ doc, note, line, lineIndex, wordIndex, renderer, translationOn, onSeek }: LyricTimeHeroProps) {
  if (!doc) {
    return <section className="st-lyr-hero" aria-label="歌词"><p className="st-lyric-empty">{note || "正在读取歌词…"}</p></section>;
  }
  if (!line) {
    return <section className="st-lyr-hero" aria-label="歌词"><p className="st-lyric-empty">{lineIndex < 0 ? "前奏 · 歌词即将开始" : "歌词时间轴之外"}</p></section>;
  }

  const trans = translationOn ? line.translations?.zh : undefined;
  const words = line.words;
  const timed = renderer === "karaoke" && words.length > 0 && doc.hasWordTiming;
  const active = timed ? Math.min(Math.max(0, wordIndex), words.length - 1) : -1;

  const seekWord = (index: number): void => {
    const word = words[index];
    if (word) onSeek(line.startMs + doc.offsetMs + word.startMs);
  };

  let body: ReactNode;
  if (timed) {
    body = (
      <p className="st-hline timed" aria-label={line.text}>
        {words.map((word, index) => (
          <button
            key={`${index}-${word.text}`}
            type="button"
            className={`st-kb${index < active ? " lit" : ""}${index === active ? " now" : ""}${
              /^[，。！？…；、]$/.test(word.text) ? " dot" : word.text.trim().length > 1 ? " wide" : ""
            }`}
            title={`跳到「${word.text}」`}
            onClick={() => seekWord(index)}
          >
            {word.text}
          </button>
        ))}
      </p>
    );
  } else {
    // 行级：整行是一个 unit（press 语义 = 整句落墨），不做假词级动画
    body = (
      <p className="st-hline line-only" aria-label={line.text}>
        <button
          type="button"
          className="st-kb wide lit line-unit"
          title="跳到这句"
          onClick={() => onSeek(line.startMs + doc.offsetMs)}
        >
          {line.text}
        </button>
      </p>
    );
  }

  const counter = timed ? `WORD ${String(Math.max(1, active + 1)).padStart(2, "0")} / ${String(words.length).padStart(2, "0")}` : `LINE ${String(lineIndex + 1).padStart(2, "0")} / ${String(doc.lines.length).padStart(2, "0")}`;
  return (
    <section className="st-lyr-hero">
      <div className="st-hmeta">
        <span>{counter}</span>
        <span>{fmt(line.startMs)}</span>
      </div>
      {body}
      {trans ? <p className="st-trans">{trans}</p> : null}
    </section>
  );
}
