/** 歌词能力的唯一出口（50 §7.1 四个扩展点之一）。 */
export { detect } from "./detect.js";
export { parseClock, parseLyrics, parseTtmlTime, type ParseOptions } from "./parse.js";
export { reflow, type ReflowOptions } from "./reflow.js";
