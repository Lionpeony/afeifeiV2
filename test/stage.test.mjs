import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeLine,
  compareRenderers,
  karaokeState,
  minimalState,
  pressState,
  theatricalState,
} from "../dist-test/lyric-state.mjs";
import {
  LAYER_KEYS,
  PRESETS,
  STAGE_TOKEN_KEYS,
  assertPresetComplete,
  sanitizeStageConfig,
  sanitizeThemeTokens,
} from "../dist-test/stage-presets.mjs";
import { dispatch, getState } from "../dist-test/kernel.mjs";

/** 一份可控的测试 LyricDoc（毫秒，与 clock 同单位）。 */
function doc(lines, words = []) {
  return { format: "lrc", plain: "", lines, words, translations: [] };
}
const line = (at, dur, text) => ({ at, dur, text });

const SAMPLE = doc(
  [
    line(0, 4000, "第一句"),
    line(4000, 3000, "第二句"),
    line(7000, 2000, "第三句"),
    line(12000, 5000, "第四句"), // 行间留 3000ms 空档，检验"空档时停在上一行"
  ],
  [
    { line: 1, at: 4000, dur: 1000, char: "第" },
    { line: 1, at: 5000, dur: 1000, char: "二" },
    { line: 1, at: 6000, dur: 1000, char: "句" },
  ],
);

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

test("karaoke：逐字进度单调推进，clamp 到 0–1", () => {
  const early = karaokeState(SAMPLE, 4100);
  assert.equal(early.chars.length, 3);
  assert.ok(early.chars[0].progress > 0 && early.chars[0].progress < 1);
  const late = karaokeState(SAMPLE, 7000);
  assert.ok(late.chars.every((c) => c.progress === 1), "行末所有字进度必须是 1");
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

test("STAGE_TOKEN_KEYS 与 tokens.css 的场景层对得上（数量一致）", () => {
  // tokens.css 场景层：bg/fg/fg-dim/tint/wallpaper + cover×5 + lyric×2 + dur/ease = 14
  assert.equal(STAGE_TOKEN_KEYS.length, 14);
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
