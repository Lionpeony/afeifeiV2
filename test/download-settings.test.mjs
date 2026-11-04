import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  getDownloadSettings,
  parseDownloadSettings,
  serializeDownloadSettings,
  setDownloadSettings,
  subscribeDownloadSettings,
} from "../dist-test/download-settings.mjs";

/* ---- 下载设置（B-10）：默认值仍是并发 2，clamp 1–6 ---- */

test("parseDownloadSettings：空值 / 坏 JSON / 坏形状都回默认", () => {
  for (const raw of [null, "{坏", "[]", '"x"', "{}"]) {
    assert.deepEqual(parseDownloadSettings(raw), DEFAULT_DOWNLOAD_SETTINGS);
  }
});

test("parseDownloadSettings：并发 clamp 到 1–6，非法值回默认 2", () => {
  assert.equal(parseDownloadSettings('{"concurrency":99}').concurrency, 6);
  assert.equal(parseDownloadSettings('{"concurrency":0}').concurrency, 1);
  assert.equal(parseDownloadSettings('{"concurrency":"5"}').concurrency, 2);
});

test("parseDownloadSettings：空模板回默认，超长模板截断", () => {
  assert.equal(parseDownloadSettings('{"template":"   "}').template, "{artist} - {title}");
  assert.equal(parseDownloadSettings(JSON.stringify({ template: "x".repeat(300) })).template.length, 120);
});

test("序列化 → 解析 往返", () => {
  const s = { template: "{title}", concurrency: 5 };
  assert.deepEqual(parseDownloadSettings(serializeDownloadSettings(s)), s);
});

test("setDownloadSettings：clamp + 通知订阅者（runner 靠这个立刻补位）", () => {
  let calls = 0;
  const stop = subscribeDownloadSettings(() => {
    calls += 1;
  });
  const saved = setDownloadSettings({ template: "{title}", concurrency: 99 });
  assert.deepEqual(saved, { template: "{title}", concurrency: 6 });
  assert.equal(getDownloadSettings().concurrency, 6);
  assert.equal(calls, 1);
  stop();
  setDownloadSettings(DEFAULT_DOWNLOAD_SETTINGS);
  assert.equal(calls, 1);
});
