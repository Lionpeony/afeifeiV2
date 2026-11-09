import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeLine,
  compareRenderers,
  currentWordIndex,
  karaokeState,
  litCount,
  minimalState,
  pressState,
  theatricalState,
} from "../dist-test/lyric-state.mjs";
import {
  LAYER_KEYS,
  PRESETS,
  STAGE_TOKEN_KEYS,
  VISUAL_MODES,
  assertPresetComplete,
  sanitizeStageConfig,
  sanitizeThemeTokens,
} from "../dist-test/stage-presets.mjs";
import { carouselItems, ringGeom } from "../dist-test/stage-visuals.mjs";
import { dispatch, getState } from "../dist-test/kernel.mjs";

/** 一份可控的测试 LyricDoc：只有 contracts/lyric.ts 一种模型（毫秒，逐字行内相对）。 */
function doc(lines) {
  return {
    trackId: "t",
    source: "local",
    hasWordTiming: lines.some((l) => l.words.length > 0),
    lines,
    segments: [],
    offsetMs: 0,
    quality: "exact",
    fetchedAt: 0,
  };
}
const line = (startMs, endMs, text, words = []) => ({ index: 0, startMs, endMs, text, words });
const word = (startMs, endMs, text) => ({ startMs, endMs, text });

const SAMPLE = doc([
  line(0, 4000, "第一句"),
  line(4000, 7000, "第二句", [word(0, 1000, "第"), word(1000, 2000, "二"), word(2000, 3000, "句")]),
  line(7000, 9000, "第三句"),
  line(12000, 17000, "第四句"), // 行间留 3000ms 空档，检验"空档时停在上一行"
]);

/* ---- 行判定（唯一的一份） ---- */

test("activeLine：t 在首行之前是 -1", () => {
  assert.equal(activeLine(SAMPLE.lines, -1), -1);
});

test("activeLine：行起点恰好在 t 上算命中（边界属于新行）", () => {
  assert.equal(activeLine(SAMPLE.lines, 4000), 1);
});

test("activeLine：行间空档停在上一个已开始的行", () => {
  assert.equal(activeLine(SAMPLE.lines, 9000), 2); // 9000 < 12000，停在第三句
  assert.equal(activeLine(SAMPLE.lines, 11999), 2);
});

test("activeLine：超过所有行停在最后一行", () => {
  assert.equal(activeLine(SAMPLE.lines, 99999), 3);
});

/* ---- 对拍（M4 判据：四渲染器同一份时间轴，diff = 0） ---- */

test("对拍：同一 t 序列下四个渲染器的活动行完全一致（diff = 0）", () => {
  const ts = [-100, 0, 1, 3999, 4000, 5000, 7000, 9000, 12000, 20000];
  for (const t of ts) {
    const diff = compareRenderers(SAMPLE, t);
    assert.equal(diff, null, `t=${t} 处四个渲染器活动行不一致：${diff}`);
  }
});

test("对拍：四渲染器状态里都带着同一个 active 字段", () => {
  const states = [pressState(SAMPLE, 5000), minimalState(SAMPLE, 5000), karaokeState(SAMPLE, 5000), theatricalState(SAMPLE, 5000)];
  assert.deepEqual(
    states.map((s) => s.active),
    [1, 1, 1, 1],
  );
});

/* ---- 各渲染器的状态形状 ---- */

test("press：offset = 活动行上方行数", () => {
  assert.deepEqual(pressState(SAMPLE, 8000), { renderer: "press", active: 2, offset: 2 });
});

test("minimal：活动行前文本为空", () => {
  assert.equal(minimalState(SAMPLE, -1).text, "");
  assert.equal(minimalState(SAMPLE, 5000).text, "第二句");
});

test("偏移：offsetMs 必须被四个渲染器一致地算进去", () => {
  const shifted = { ...SAMPLE, offsetMs: 500 };
  assert.equal(pressState(shifted, 4400).active, 0, "未到偏移后的行时间，仍是上一行");
  assert.equal(pressState(shifted, 4500).active, 1);
  assert.equal(compareRenderers(shifted, 4500), null, "偏移后四个渲染器仍须同拍");
  // 逐字进度也要跟着偏移走，否则字比行慢 500ms
  assert.ok(karaokeState(shifted, 4600).chars[0].progress > 0, "偏移后逐字进度不许比行慢半拍");
});

test("karaoke：逐字进度单调推进，clamp 到 0–1", () => {
  const early = karaokeState(SAMPLE, 4100);
  assert.equal(early.chars.length, 3);
  assert.ok(early.chars[0].progress > 0 && early.chars[0].progress < 1);
  const bound = karaokeState(SAMPLE, 6999);
  assert.ok(bound.chars[2].progress > 0.99, "行末最后一字接近满进度");
  assert.ok(bound.chars.every((c) => c.progress > 0 && c.progress <= 1));
  assert.deepEqual(
    karaokeState(SAMPLE, 5000).chars.map((c) => c.char),
    ["第", "二", "句"],
  );
});

test("karaoke：无逐字数据的行回落整行进度", () => {
  const st = karaokeState(SAMPLE, 8000); // 第三句没有 words
  assert.equal(st.chars.length, 0);
  assert.ok(st.progress > 0 && st.progress < 1);
});

test("theatrical：distances 是各行到活动行的距离", () => {
  const st = theatricalState(SAMPLE, 8000);
  assert.deepEqual(st.distances, [2, 1, 0, 1]);
});

test("currentWordIndex：只在真实逐字时序中选择当前词，边界归属下一个词", () => {
  const state = karaokeState(SAMPLE, 4750);
  assert.equal(currentWordIndex(state), 0);
  assert.equal(currentWordIndex(karaokeState(SAMPLE, 5000)), 1);
  assert.equal(currentWordIndex(karaokeState(SAMPLE, 6000)), 2);
});

test("currentWordIndex：无逐字数据、空行或行未开始时不伪造活动词", () => {
  assert.equal(currentWordIndex(karaokeState(SAMPLE, 8000)), -1, "只有行级时间时不能假装有词级同步");
  assert.equal(currentWordIndex(karaokeState(SAMPLE, 3000)), -1, "当前行尚未开始");
  assert.equal(currentWordIndex({ renderer: "karaoke", active: 0, text: "", progress: 0, chars: [] }), -1);
});

/* ---- 预设数据完整性（M4：缺 token 必须明确报错） ---- */

test("四套预设齐全、id 唯一、token 键完整无多余", () => {
  assert.equal(PRESETS.length, 4);
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, 4);
  for (const p of PRESETS) assertPresetComplete(p); // 缺 token 会 throw
});

test("assertPresetComplete：缺 token / 多 token 都报错", () => {
  const bad = { ...PRESETS[0], tokens: { ...PRESETS[0].tokens } };
  delete bad.tokens["--stage-dur"];
  assert.throws(() => assertPresetComplete(bad), /缺少 token/);
  const extra = { ...PRESETS[0], tokens: { ...PRESETS[0].tokens, "--bogus": "1" } };
  assert.throws(() => assertPresetComplete(extra), /未登记的 token/);
});

test("每个预设声明了一个歌词渲染器，且四套各不相同", () => {
  const renderers = PRESETS.map((p) => p.lyricRenderer);
  assert.equal(new Set(renderers).size, 4);
});

test("STAGE_TOKEN_KEYS 有 20 个场景层键（含 A-10 的 line/line-soft/raised/accent 与 b2 的 disc）", () => {
  // 数量只是索引：真正的对账（键集合 ↔ tokens.css 声明）在 stage-theme.test.mjs 里做，
  // 那边扫源码，改成只数数字就退化成"改一处改两处"的复读
  assert.equal(STAGE_TOKEN_KEYS.length, 20);
});

/* ---- A-04 逐字点亮：有数据按字，没数据按渲染器降级 ---- */

test("litCount：有逐字数据 → 按字点亮，唱过一个亮一个", () => {
  const k = {
    renderer: "karaoke",
    active: 0,
    text: "马林鱼",
    progress: 0,
    chars: [
      { char: "马", progress: 1 },
      { char: "林", progress: 1 },
      { char: "鱼", progress: 0.4 },
    ],
  };
  assert.equal(litCount("karaoke", k, 3), 2, "前两个字唱完，第三个还在唱");
  assert.equal(litCount("press", k, 3), 2, "press 有逐字数据时也不许整句先落墨");
});

test("litCount：无逐字数据 + press → 整句一次落墨", () => {
  const k = { renderer: "karaoke", active: 0, text: "马林鱼", progress: 0.2, chars: [] };
  assert.equal(litCount("press", k, 3), 3, "press 的语义是整句，不假装逐字");
});

test("litCount：无逐字数据 + karaoke → 按行进度折算", () => {
  const k = { renderer: "karaoke", active: 0, text: "马林鱼", progress: 0.34, chars: [] };
  assert.equal(litCount("karaoke", k, 3), 1);
  assert.equal(litCount("karaoke", { ...k, progress: 0.9 }, 3), 3);
  assert.equal(litCount("karaoke", { ...k, progress: 0 }, 3), 0);
});

test("litCount：字数与格子数不一致时退回整行语义（不越界）", () => {
  const k = {
    renderer: "karaoke",
    active: 0,
    text: "ab",
    progress: 1,
    chars: [{ char: "a", progress: 1 }],
  };
  assert.equal(litCount("press", k, 5), 5);
  assert.equal(litCount("karaoke", k, 5), 5);
  assert.equal(litCount("press", k, 0), 0, "没有格子就是 0");
});

/* ---- store 的 stage 域 ---- */

test("stage/setPreset：切换生效", () => {
  dispatch({ type: "stage/setPreset", preset: "cinema" });
  assert.equal(getState().stage.preset, "cinema");
  dispatch({ type: "stage/setPreset", preset: "paper" });
});

test("stage/toggleLayer：cover / controls 不可关", () => {
  dispatch({ type: "stage/toggleLayer", layer: "cover" });
  assert.equal(getState().stage.layers.cover, true);
  dispatch({ type: "stage/toggleLayer", layer: "controls" });
  assert.equal(getState().stage.layers.controls, true);
  dispatch({ type: "stage/toggleLayer", layer: "wallpaper" });
  assert.equal(getState().stage.layers.wallpaper, false);
  dispatch({ type: "stage/toggleLayer", layer: "wallpaper" });
  assert.equal(getState().stage.layers.wallpaper, true);
});

test("sanitizeStageConfig：坏数据回落默认，cover/controls 强制 true", () => {
  assert.deepEqual(sanitizeStageConfig(null).preset, "paper");
  const bad = sanitizeStageConfig({ preset: "hacker", intensity: 99, layers: { wallpaper: false, cover: false, controls: false } });
  assert.equal(bad.preset, "paper");
  assert.equal(bad.intensity, 1);
  assert.equal(bad.layers.cover, true, "cover 不可关");
  assert.equal(bad.layers.controls, true, "controls 不可关");
  assert.equal(bad.layers.wallpaper, false, "可关的层尊重存档");
});

test("译文开关（A-03）：老存档缺字段按开，显式 false 才关", () => {
  assert.equal(sanitizeStageConfig(null).translation, true, "默认双语并排");
  assert.equal(sanitizeStageConfig({ preset: "paper" }).translation, true, "老存档没有这个字段=当时译文常显");
  assert.equal(sanitizeStageConfig({ translation: false }).translation, false);
  assert.equal(sanitizeStageConfig({ translation: "no" }).translation, true, "非布尔值不当成 false");
});

test("toneAuto（2026-11-10 用户实测 BUG）：缺字段=跟随全局主题，只有显式 false 才锁手动", () => {
  assert.equal(sanitizeStageConfig(null).toneAuto, true, "默认跟随全局主题");
  assert.equal(sanitizeStageConfig({}).toneAuto, true, "老存档没有字段=跟随（迁移即生效）");
  assert.equal(sanitizeStageConfig({ toneAuto: true }).toneAuto, true);
  assert.equal(sanitizeStageConfig({ toneAuto: false }).toneAuto, false, "用户点过明暗=手动档");
  assert.equal(sanitizeStageConfig({ toneAuto: 1 }).toneAuto, true, "非布尔值不当成 false");
});

/* ---- C-13 视觉模式与封面轮播 ---- */

test("C-13 visualMode：白名单外的回落 bars，老存档缺字段也是 bars", () => {
  assert.deepEqual(VISUAL_MODES, ["bars", "wave", "ring"]);
  assert.equal(sanitizeStageConfig(null).visualMode, "bars");
  assert.equal(sanitizeStageConfig({ visualMode: "cube" }).visualMode, "bars", "不在白名单回落");
  assert.equal(sanitizeStageConfig({ visualMode: "wave" }).visualMode, "wave");
  assert.equal(sanitizeStageConfig({ visualMode: 1 }).visualMode, "bars", "非字符串回落");
});

test("C-13 coverCarousel：缺字段按关，只有显式 true 才开", () => {
  assert.equal(sanitizeStageConfig(null).coverCarousel, false);
  assert.equal(sanitizeStageConfig({ coverCarousel: true }).coverCarousel, true);
  assert.equal(sanitizeStageConfig({ coverCarousel: "yes" }).coverCarousel, false);
});

test("C-13 stage/setVisualMode / setCarousel：切换生效且幂等", () => {
  const s0 = getState().stage;
  dispatch({ type: "stage/setVisualMode", mode: s0.visualMode });
  assert.equal(getState().stage, s0, "值没变不产生新状态");
  dispatch({ type: "stage/setVisualMode", mode: "ring" });
  assert.equal(getState().stage.visualMode, "ring");
  dispatch({ type: "stage/setCarousel", on: !s0.coverCarousel });
  assert.equal(getState().stage.coverCarousel, !s0.coverCarousel);
  dispatch({ type: "stage/setCarousel", on: s0.coverCarousel });
  dispatch({ type: "stage/setVisualMode", mode: s0.visualMode });
});

test("C-13 carouselItems：去重、上限 6、无封面保留（占位盘）、不足两张给空数组", () => {
  const it = (id, url = null) => ({ id, url });
  assert.deepEqual(carouselItems([]), [], "空队列不硬转");
  assert.deepEqual(carouselItems([it("a")]), [], "只有一张不硬转");
  assert.deepEqual(carouselItems([it("a", "u1"), it("b"), it("a")]), [it("a", "u1"), it("b")], "同 id 去重（先到先得）");
  assert.deepEqual(carouselItems([null, it("a"), it("b"), it("a"), it("c")]), [it("a"), it("b"), it("c")], "null 项与重复剔除");
  const many = ["1", "2", "3", "4", "5", "6", "7", "8"].map((x) => it(x));
  assert.equal(carouselItems(many).length, 6, "上限 6");
  assert.deepEqual(carouselItems([it("cur", "u"), it("b")]), [it("cur", "u"), it("b")], "当前曲目排第一");
  assert.equal(carouselItems([it("a"), it("b", null)])[1].url, null, "无封面条目保留，渲染层画占位盘");
});

test("C-13 ringGeom：内半径与柱长上限，画布太扁 lenMax=0", () => {
  const g = ringGeom(480, 120);
  assert.equal(g.cx, 240);
  assert.equal(g.cy, 60);
  assert.equal(g.r0, 60 * 0.35);
  assert.ok(g.lenMax > 0, "120px 高画得出环形");
  const tiny = ringGeom(480, 4);
  assert.equal(tiny.lenMax, 0, "太扁就整圈不画");
});

test("stage/setTranslation：切换生效且幂等", () => {
  const before = getState().stage;
  dispatch({ type: "stage/setTranslation", on: before.translation });
  assert.equal(getState().stage, before, "值没变不产生新状态");
  dispatch({ type: "stage/setTranslation", on: !before.translation });
  assert.equal(getState().stage.translation, !before.translation);
  dispatch({ type: "stage/setTranslation", on: before.translation });
});

test("LAYER_KEYS 与契约五层一致", () => {
  assert.deepEqual(LAYER_KEYS, ["wallpaper", "visual", "cover", "lyric", "controls"]);
});

/* ---- 主题包（M5） ---- */

test("sanitizeThemeTokens：未登记的键丢弃、坏值丢弃", () => {
  const out = sanitizeThemeTokens({
    "--stage-bg": "red",
    "--bogus": "x",
    "--stage-dur": 123,
    "--stage-ease": "",
  });
  assert.deepEqual(out, { "--stage-bg": "red" });
});

test("sanitizeThemeTokens：非对象 / 空集 → null", () => {
  assert.equal(sanitizeThemeTokens(null), null);
  assert.equal(sanitizeThemeTokens([1]), null);
  assert.equal(sanitizeThemeTokens({ "--bogus": "x" }), null);
});

test("stage/setTheme：覆盖生效，null 清除", () => {
  dispatch({ type: "stage/setTheme", tokens: { "--stage-tint": "teal" } });
  assert.deepEqual(getState().stage.customTokens, { "--stage-tint": "teal" });
  dispatch({ type: "stage/setTheme", tokens: null });
  assert.equal(getState().stage.customTokens, null);
});
