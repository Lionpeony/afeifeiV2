import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * P0-14 补充判据：`resolveSrc` 是异步 IPC，load 回来时可能已经过时。
 * 慢的那次不许覆盖后来者（否则界面显示 B、声音是 A），`reload()` 重试期间用户切歌同理。
 */

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// 构造 AudioEngine 要 `new Audio()`；这里只用 load / seek / play，不建真图
class FakeAudio {
  constructor() {
    this.preload = "";
    this.src = "";
    this.readyState = 0;
    this.paused = true;
    this.ended = false;
    this.duration = Number.NaN;
    this.currentTime = 0;
    this.volume = 1;
    this.muted = false;
    this.loop = false;
    this.listeners = new Map();
  }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  fire(type) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  load() {}
  pause() {
    this.paused = true;
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
}
globalThis.Audio = FakeAudio;

const { AudioEngine } = await import("../dist-test/audio-engine.mjs");

const makeMedia = (delays) => ({
  grant: (track) => delay(delays[track] ?? 0).then(() => `token-${track}`),
  urlOf: (token) => `appmedia://${token}`,
});

/** 绕过 AudioContext：play() 只用到图上的两条增益与 ctx 状态。 */
const fakeParam = () => ({
  value: 1,
  cancelScheduledValues() {},
  setValueAtTime() {},
  setValueCurveAtTime() {},
  linearRampToValueAtTime() {},
});
const fakeGraph = () => ({
  ctx: { currentTime: 0, state: "running" },
  fadeA: { gain: fakeParam() },
  fadeB: { gain: fakeParam() },
  preamp: { gain: fakeParam() },
  eq: [],
  analyser: {},
});

test("load 代际：慢的旧请求回来时不许覆盖新的那首", async () => {
  const engine = new AudioEngine(makeMedia({ a: 40, b: 1 }));
  const slow = engine.load("a");
  await delay(1);
  const fast = engine.load("b");

  assert.equal(await fast, true);
  assert.equal(await slow, false, "旧请求应作废");
  assert.equal(engine.el.src, "appmedia://token-b");
});

test("load 代际：单次正常 load 不受影响（守卫不能把功能关掉）", async () => {
  const engine = new AudioEngine(makeMedia({ c: 1 }));
  assert.equal(await engine.load("c"), true);
  assert.equal(engine.el.src, "appmedia://token-c");
});

test("resolver：remote 曲目靠解析器换直链，本地路径仍走 grant", async () => {
  let granted = 0;
  const media = {
    grant: (track) => {
      granted += 1;
      return delay(1).then(() => `token-${track}`);
    },
    urlOf: (token) => `appmedia://${token}`,
  };
  const engine = new AudioEngine(media);
  engine.setResolver(async (track) => (track.startsWith("remote:") ? "https://cdn.example/x.mp3" : null));

  assert.equal(await engine.load("remote:netease:1"), true);
  assert.ok(engine.el.src.startsWith("appstream://"), "远端要走 appstream 代理，直链会被 CORS 消音");
  assert.equal(granted, 0, "远端曲目不该去申请本地文件令牌");

  assert.equal(await engine.load("/local/a.mp3"), true);
  assert.equal(granted, 1, "本地路径仍走 grant");
});

test("resolver：解析失败（未登录/无版权）按取源失败处理，不抛出", async () => {
  const engine = new AudioEngine(makeMedia({}));
  engine.setResolver(async () => {
    throw new Error("not logged in");
  });
  assert.equal(await engine.load("remote:netease:1"), false);
});

test("load 代际：reload 重试期间用户切歌，重试结果不许顶回来", async () => {
  const engine = new AudioEngine(makeMedia({ a: 40, b: 1 }));
  assert.equal(await engine.load("a"), true);

  const reload = engine.reload(); // 清 currentSrc 后重取 a（慢）
  await delay(1);
  assert.equal(await engine.load("b"), true);

  assert.equal(await reload, false, "被后来者顶掉的重试应作废");
  assert.equal(engine.el.src, "appmedia://token-b");
});

test("末尾点播放：先归零再 play，不许原地立刻再触发结束", async () => {
  const engine = new AudioEngine(makeMedia({ a: 1 }));
  engine.graph = fakeGraph(); // 图是唯一实例，这里不建真的
  await engine.load("a");
  const el = engine.el;
  el.duration = 100;
  el.currentTime = 100;
  el.ended = true;

  await engine.play();
  assert.equal(el.currentTime, 0, "停在末尾点播放必须从头放");
});

test("seek 早于元数据：记住目标，loadedmetadata 到了再落", async () => {
  const engine = new AudioEngine(makeMedia({ b: 1 }));
  await engine.load("b"); // readyState 还是 0
  engine.seek(42_000);
  assert.equal(engine.el.currentTime, 0, "元数据没到，不能假装跳成功");

  engine.el.readyState = 1;
  engine.el.fire("loadedmetadata");
  assert.equal(engine.el.currentTime, 42, "恢复上次播放位置要真的落到元素上");
});

test("换曲作废上一首没落地的 seek", async () => {
  const engine = new AudioEngine(makeMedia({ c: 1, d: 1 }));
  await engine.load("c");
  engine.seek(30_000); // 元数据没到，挂起
  await engine.load("d");

  engine.el.readyState = 1;
  engine.el.fire("loadedmetadata");
  assert.equal(engine.el.currentTime, 0, "c 的定位不能落到 d 头上");
});

test("淡出途中暂停：先把 crossfade 收场，残余定时器不许再换主曲", async () => {
  const engine = new AudioEngine(makeMedia({ x: 1, y: 1 }));
  engine.setCrossfade(3);
  engine.graph = fakeGraph();
  await engine.load("x");
  engine.el.paused = false; // 假装在播，才可能进 crossfade
  engine.el.duration = 100;
  await engine.load("y");
  assert.equal(engine.isFading(), true, "前提：确实进了 crossfade");

  engine.pause();
  assert.equal(engine.isFading(), false, "暂停必须先把 crossfade 收场");
  assert.equal(engine.el.src, "appmedia://token-y", "待命曲转正，暂停在用户看到的那首上");
});
