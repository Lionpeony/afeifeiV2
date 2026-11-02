import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyOp,
  diffPaths,
  findMissing,
  parseLog,
  replay,
  serializeLog,
  shouldCompact,
} from "../dist-test/index-store.mjs";
import { fileNameOf, migrate, normalizePath, trackIdOf } from "../dist-test/schema.mjs";

const T = (id, extra = {}) => ({
  id,
  path: `C:/m/${id}.mp3`,
  title: id,
  artist: "a",
  album: "b",
  durationMs: 180000,
  size: 1000,
  mtimeMs: 1,
  hasCover: false,
  ...extra,
});

const SNAP = (tracks) => ({ v: 1, tracks, savedAt: 0 });

/* ---------- 路径规范化 ---------- */

test("normalizePath：反斜杠转正斜杠、压重复分隔符、小写", () => {
  assert.equal(normalizePath("C:\\Music\\\\A.mp3"), "c:/music/a.mp3");
});

test("trackIdOf 与 normalizePath 一致（身份走小写，路径保留原样）", () => {
  assert.equal(trackIdOf("C:\\A\\B.MP3"), "c:/a/b.mp3");
});

test("fileNameOf 取最后一段", () => {
  assert.equal(fileNameOf("C:/a/b/c.mp3"), "c.mp3");
});

/* ---------- 日志回放 ---------- */

test("replay：空日志原样返回（同一个对象，不做无谓复制）", () => {
  const snap = SNAP([T("a")]);
  assert.equal(replay(snap, []), snap);
});

test("replay：upsert 新增一条", () => {
  const out = replay(SNAP([]), [{ op: "upsert", track: T("a") }]);
  assert.equal(out.tracks.length, 1);
});

test("replay：upsert 同 id 覆盖而不是追加", () => {
  const out = replay(SNAP([T("a", { title: "旧" })]), [{ op: "upsert", track: T("a", { title: "新" }) }]);
  assert.equal(out.tracks.length, 1);
  assert.equal(out.tracks[0].title, "新");
});

test("replay：remove 删掉指定 id", () => {
  const out = replay(SNAP([T("a"), T("b")]), [{ op: "remove", id: "a" }]);
  assert.deepEqual(out.tracks.map((t) => t.id), ["b"]);
});

test("replay：多条按顺序叠加（先加后删 = 没有）", () => {
  const out = replay(SNAP([]), [
    { op: "upsert", track: T("a") },
    { op: "remove", id: "a" },
  ]);
  assert.equal(out.tracks.length, 0);
});

test("applyOp 等价于单条 replay", () => {
  const snap = SNAP([]);
  assert.deepEqual(applyOp(snap, { op: "upsert", track: T("a") }), replay(snap, [{ op: "upsert", track: T("a") }]));
});

/* ---------- 日志解析 ---------- */

test("parseLog：正常行全部解析", () => {
  const text = serializeLog([
    { op: "upsert", track: T("a") },
    { op: "remove", id: "b" },
  ]);
  assert.equal(parseLog(text).length, 2);
});

test("parseLog：坏行跳过，不连累其他行", () => {
  const text = `${JSON.stringify({ op: "remove", id: "a" })}\n{ 半截\n${JSON.stringify({ op: "remove", id: "b" })}`;
  assert.deepEqual(parseLog(text).map((o) => o.id), ["a", "b"]);
});

test("parseLog：空行与未知 op 跳过", () => {
  const text = `\n\n${JSON.stringify({ op: "explode", id: "x" })}\n`;
  assert.equal(parseLog(text).length, 0);
});

test("serializeLog ∘ parseLog 往返一致", () => {
  const ops = [{ op: "upsert", track: T("a") }, { op: "remove", id: "b" }];
  assert.deepEqual(parseLog(serializeLog(ops)), ops);
});

/* ---------- 压缩阈值 ---------- */

test("shouldCompact：未到阈值不压", () => {
  assert.equal(shouldCompact(199, 200), false);
});

test("shouldCompact：到阈值就压", () => {
  assert.equal(shouldCompact(200, 200), true);
});

/* ---------- 增量比对 ---------- */

test("diffPaths：新文件算 added", () => {
  const existing = new Map();
  const r = diffPaths(existing, [{ path: "C:/m/a.mp3", id: "a", size: 1, mtimeMs: 1 }]);
  assert.deepEqual(r.added, ["a"]);
  assert.deepEqual(r.changed, []);
});

test("diffPaths：size 变了算 changed", () => {
  const existing = new Map([["a", T("a", { size: 999 })]]);
  const r = diffPaths(existing, [{ path: "C:/m/a.mp3", id: "a", size: 1000, mtimeMs: 1 }]);
  assert.deepEqual(r.changed, ["a"]);
});

test("diffPaths：mtime 变了算 changed", () => {
  const existing = new Map([["a", T("a", { mtimeMs: 1 })]]);
  const r = diffPaths(existing, [{ path: "C:/m/a.mp3", id: "a", size: 1000, mtimeMs: 2 }]);
  assert.deepEqual(r.changed, ["a"]);
});

test("diffPaths：完全没变算 unchanged（这是二次启动快的全部原因）", () => {
  const existing = new Map([["a", T("a")]]);
  const r = diffPaths(existing, [{ path: "C:/m/a.mp3", id: "a", size: 1000, mtimeMs: 1 }]);
  assert.deepEqual(r.unchanged, ["a"]);
});

/* ---------- 缺失判定 ---------- */

test("findMissing：扫描范围内、这次没扫到的算缺失", () => {
  const existing = [T("a"), T("b")];
  const missing = findMissing(existing, new Set(["a"]), ["C:/m"]);
  assert.deepEqual(missing, ["b"]);
});

test("findMissing：扫描到的都不算缺失", () => {
  const existing = [T("a"), T("b")];
  assert.deepEqual(findMissing(existing, new Set(["a", "b"]), ["C:/m"]), []);
});

test("findMissing：扫描范围外的歌不算缺失（只扫 A 目录不能把 B 目录标灰）", () => {
  const existing = [T("a", { path: "D:/other/a.mp3" })];
  assert.deepEqual(findMissing(existing, new Set(), ["C:/m"]), []);
});

test("findMissing：没给目录就什么都不算缺失", () => {
  assert.deepEqual(findMissing([T("a")], new Set(), []), []);
});

test("findMissing：路径大小写与分隔符差异不影响判定", () => {
  const existing = [T("a", { path: "C:\\m\\a.mp3" })];
  assert.deepEqual(findMissing(existing, new Set(), ["c:/M"]), ["a"]);
});

/* ---------- 迁移器 ---------- */

test("migrate：v1 正常读入", () => {
  const snap = migrate({ v: 1, tracks: [T("a")], savedAt: 5 });
  assert.equal(snap.tracks.length, 1);
  assert.equal(snap.savedAt, 5);
});

test("migrate：未来版本当没存过（宁可从零扫，不要读错字段）", () => {
  assert.equal(migrate({ v: 99, tracks: [] }), null);
});

test("migrate：缺字段的 track 被过滤，不让坏的进索引", () => {
  const snap = migrate({ v: 1, tracks: [T("a"), { id: "b" }, null] });
  assert.deepEqual(snap.tracks.map((t) => t.id), ["a"]);
});

test("migrate：同 id 重复只留第一条（否则虚拟列表错位）", () => {
  const snap = migrate({ v: 1, tracks: [T("a", { title: "一" }), T("a", { title: "二" })] });
  assert.equal(snap.tracks.length, 1);
  assert.equal(snap.tracks[0].title, "一");
});

test("migrate：不是对象就返回 null", () => {
  assert.equal(migrate(null), null);
  assert.equal(migrate("x"), null);
});
