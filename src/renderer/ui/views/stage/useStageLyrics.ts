import { useEffect, useState } from "react";
import type { LyricDoc, LyricLine } from "../../../../contracts/lyric.js";
import { onTick } from "../../compositor.js";
import { lyricState, subscribeLyric } from "../../lyric-source.js";
import { activeLine, currentWordIndex, karaokeState } from "./lyric-state.js";

const SCRIPT_ROWS = 12;

export type LyricRenderer = "press" | "karaoke" | "minimal" | "theatrical";

/**
 * 播放页唯一的歌词订阅点：doc 来自 lyric-source（装配层统一取词），
 * 行/词判定只消费合成器的同一份 t（I1）。真正的"活动词"只在
 * `currentWordIndex` 命中时更新一次状态，不做每帧重渲染。
 */
export function useStageLyrics(renderer: LyricRenderer) {
  const [doc, setDoc] = useState<LyricDoc | null>(null);
  const [note, setNote] = useState("");
  const [lineIndex, setLineIndex] = useState(-1);
  const [wordIndex, setWordIndex] = useState(-1);

  useEffect(() => {
    const update = (): void => {
      const state = lyricState();
      setDoc(state.doc);
      setNote(state.note);
      setLineIndex(-1);
      setWordIndex(-1);
    };
    update();
    return subscribeLyric(update);
  }, []);

  useEffect(() => {
    let previousLine = -999;
    let previousWord = -1;
    return onTick((time) => {
      if (!doc) {
        if (previousLine !== -1) {
          previousLine = -1;
          previousWord = -1;
          setLineIndex(-1);
          setWordIndex(-1);
        }
        return;
      }
      const nextLine = activeLine(doc.lines, time - doc.offsetMs);
      if (nextLine !== previousLine) {
        previousLine = nextLine;
        previousWord = -1;
        setLineIndex(nextLine);
      }
      const nextWord = renderer === "karaoke" && nextLine >= 0
        ? currentWordIndex(karaokeState(doc, time))
        : -1;
      if (nextWord !== previousWord) {
        previousWord = nextWord;
        setWordIndex(nextWord);
      }
    });
  }, [doc, renderer]);

  const currentLine: LyricLine | null = doc && lineIndex >= 0 ? doc.lines[lineIndex] : null;
  const scriptStart = doc ? Math.max(0, Math.min(Math.max(0, doc.lines.length - SCRIPT_ROWS), lineIndex - 4)) : 0;
  const scriptLines = doc ? doc.lines.slice(scriptStart, scriptStart + SCRIPT_ROWS) : [];

  return { doc, note, lineIndex, wordIndex, currentLine, scriptStart, scriptLines };
}
