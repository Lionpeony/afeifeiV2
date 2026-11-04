import { test } from "node:test";
import assert from "node:assert/strict";
import { dropRoot, mergeRoot } from "../dist-test/library-roots.mjs";

/* ---- 曲库目录列表（M9）：只存路径，去重与移除是唯一两条规则 ---- */

test("mergeRoot：新目录加到末尾", () => {
  assert.deepEqual(mergeRoot(["D:\\Music"], "E:\\Lossless"), ["D:\\Music", "E:\\Lossless"]);
});

test("mergeRoot：Windows 路径大小写不敏感，同一个目录不重复加", () => {
  assert.deepEqual(mergeRoot(["D:\\Music"], "d:\\music"), ["D:\\Music"]);
});

test("mergeRoot：首尾空格压掉，空串直接忽略", () => {
  assert.deepEqual(mergeRoot([], "  D:\\Music  "), ["D:\\Music"]);
  assert.deepEqual(mergeRoot(["D:\\Music"], "   "), ["D:\\Music"]);
});

test("dropRoot：移除时同样忽略大小写，不在列表里不动", () => {
  assert.deepEqual(dropRoot(["D:\\Music", "E:\\Lossless"], "d:\\MUSIC"), ["E:\\Lossless"]);
  assert.deepEqual(dropRoot(["D:\\Music"], "F:\\Nope"), ["D:\\Music"]);
});
