import { test } from "node:test";
import assert from "node:assert/strict";
import { createPersister } from "../dist-test/persist.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeState() {
  return {
    player: { status: "playing", trackId: "C:/a.mp3", positionMs: 0, volume: 0.5, error: null },
    queue: {
      items: ["C:/a.mp3", "C:/b.mp3"],
      cursor: 0,
      context: ["C:/a.mp3", "C:/b.mp3"],
      history: ["C:/a.mp3"],
      mode: "order",
      shuffleSeed: 1,
    },
  };
}

function memoryPort(initial = null) {
  const saved = [];
  return {
    saved,
    load: async () => initial,
    save: async (json) => {
      saved.push(json);
    },
  };
}

test("节流：到期前不写盘，到点只写一次", async () => {
  const port = memoryPort();
  const p = createPersister(port, 20);

  p.schedule(fakeState, () => 1234);
  assert.equal(port.saved.length, 0, "不能立刻写");

  await sleep(60);
  assert.equal(port.saved.length, 1, "到点只写一次");
});

test("写盘内容用的是实时位置，不是 store 里那个旧 positionMs", async () => {
  const port = memoryPort();
  const p = createPersister(port, 10);

  p.schedule(fakeState, () => 4321);
  await sleep(40);

  const snap = JSON.parse(port.saved[0]);
  assert.equal(snap.positionMs, 4321);
  assert.equal(snap.trackId, "C:/a.mp3");
  assert.equal(snap.v, 1);
});

test("位置写成整数毫秒（别把浮点塞进存档）", async () => {
  const port = memoryPort();
  const p = createPersister(port, 10);

  p.schedule(fakeState, () => 1234.78);
  await sleep(40);

  assert.equal(JSON.parse(port.saved[0]).positionMs, 1235);
});

test("flush 立即写盘，不等节流", async () => {
  const port = memoryPort();
  const p = createPersister(port, 10_000);

  p.schedule(fakeState, () => 99);
  await p.flush(fakeState, () => 99);

  assert.equal(port.saved.length, 1);
  assert.equal(JSON.parse(port.saved[0]).positionMs, 99);
});

test("restore：没有存档返回 null", async () => {
  const p = createPersister(memoryPort(null), 10);
  assert.equal(await p.restore(), null);
});

test("restore：坏 JSON 返回 null，不抛错", async () => {
  const p = createPersister(memoryPort("{ 半截"), 10);
  assert.equal(await p.restore(), null, "半截文件不该让应用起不来");
});

test("restore：版本不符返回 null（M2 才补迁移器）", async () => {
  const p = createPersister(memoryPort(JSON.stringify({ v: 99 })), 10);
  assert.equal(await p.restore(), null);
});

test("restore：正常存档原样取回", async () => {
  const snap = { v: 1, trackId: "C:/a.mp3", positionMs: 500, volume: 0.3, queue: fakeState().queue };
  const p = createPersister(memoryPort(JSON.stringify(snap)), 10);

  const got = await p.restore();
  assert.equal(got.trackId, "C:/a.mp3");
  assert.equal(got.queue.items.length, 2);
});
