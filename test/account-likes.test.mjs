import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetAccountLikes,
  beginAccount,
  getAccountLikes,
  isAccountLiked,
  pressAccountLike,
  readLiked,
  shouldRefreshOnFocus,
  subscribe,
} from "../dist-test/account-likes.mjs";

/**
 * 账号红心的三条行为（照 folia handleLike / applyLikedRead / likePresses）：
 * 乐观、失败回滚、读取与点击合流。这些错都不会报错，只会让界面显示错的红心状态——
 * 所以每条都要钉住。
 */
function fakePort({ ids = [], total = 0, fail = null, delay = 0 } = {}) {
  const calls = [];
  return {
    calls,
    async likedIds() {
      calls.push({ op: "read" });
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (fail === "read") throw new Error("网络不给力");
      return [...ids];
    },
    async likedTotal() {
      calls.push({ op: "total" });
      return total;
    },
    async setLiked(songId, liked) {
      calls.push({ op: "set", songId, liked });
      if (fail === "write") throw new Error("写失败");
    },
  };
}

beforeEach(() => __resetAccountLikes());

test("读取：ids 落地，且不是 countedEmpty", async () => {
  beginAccount("netease");
  await readLiked(fakePort({ ids: ["a", "b"] }));

  assert.equal(isAccountLiked("a"), true);
  assert.equal(isAccountLiked("z"), false);
  assert.equal(getAccountLikes().countedEmpty, false);
  assert.equal(getAccountLikes().error, null);
  assert.equal(getAccountLikes().status, "ready");
});

test("countedEmpty：平台说 0 首才算「确实空」", async () => {
  beginAccount("netease");
  await readLiked(fakePort({ ids: [], total: 0 }));
  assert.equal(getAccountLikes().countedEmpty, true);
  assert.equal(getAccountLikes().error, null);
});

test("平台说有 5 首却读到 0 首 → 报错，不许显示成「还没有红心」", async () => {
  beginAccount("netease");
  await readLiked(fakePort({ ids: [], total: 5 }));
  assert.equal(getAccountLikes().countedEmpty, false);
  assert.match(getAccountLikes().error, /5 首/);
});

test("读取失败：状态为 error，旧的红心不被清空", async () => {
  beginAccount("netease");
  await readLiked(fakePort({ ids: ["a"] }));
  await readLiked(fakePort({ ids: ["a"], fail: "read" }));

  const st = getAccountLikes();
  assert.equal(st.status, "error");
  assert.match(st.error, /网络/);
  assert.equal(isAccountLiked("a"), true, "读失败不该把已知的红心清掉");
});

test("press：调用后**立刻**生效（乐观），不等网络", () => {
  beginAccount("netease");
  const port = fakePort({ ids: ["a"] });
  // 不 await：函数体的同步部分必须已经把状态改了
  const pending = pressAccountLike(port, "a", false);
  assert.equal(isAccountLiked("a"), false, "心必须马上灭，不能等请求回来");
  void pending;
});

test("press 失败：回滚到账号确认过的状态，并 reject", async () => {
  beginAccount("netease");
  await readLiked(fakePort({ ids: ["a"] }));
  await assert.rejects(() => pressAccountLike(fakePort({ fail: "write" }), "a", false), /写失败/);
  assert.equal(isAccountLiked("a"), true, "写失败必须把心放回去");
});

test("读取期间的点击不被旧快照盖掉（applyLikedRead 那一行）", async () => {
  beginAccount("netease");
  const slow = fakePort({ ids: ["a", "b"], delay: 30 });
  const reading = readLiked(slow);
  // 读还没回来，用户点了一首新的
  await pressAccountLike(fakePort({}), "c", true);
  await reading;

  assert.equal(isAccountLiked("c"), true, "读取结果不能覆盖读取期间用户点的红心");
  assert.equal(isAccountLiked("a"), true);
});

test("同一首连点两次：请求串行，最终状态 ＝ 最后一次", async () => {
  beginAccount("netease");
  await readLiked(fakePort({ ids: [] }));
  const port = fakePort({});
  const first = pressAccountLike(port, "a", true);
  const second = pressAccountLike(port, "a", false);
  await Promise.all([first, second]);

  assert.equal(isAccountLiked("a"), false);
  const writes = port.calls.filter((c) => c.op === "set");
  assert.equal(writes.length, 2, "两次点击就是两次请求，但必须一前一后");
  assert.deepEqual(
    writes.map((w) => w.liked),
    [true, false],
  );
});

test("换账号：整套清空，不把上个号的红心留在地上", async () => {
  beginAccount("netease");
  await readLiked(fakePort({ ids: ["a"] }));
  assert.equal(isAccountLiked("a"), true);

  assert.equal(beginAccount("netease"), false, "同一个账号不该清空");
  assert.equal(isAccountLiked("a"), true);

  assert.equal(beginAccount("qq"), true);
  assert.equal(isAccountLiked("a"), false);
  assert.equal(getAccountLikes().ids.size, 0);
});

test("focus 重读：60 秒内不重读，过了才重读", async () => {
  beginAccount("netease");
  assert.equal(shouldRefreshOnFocus(), false, "还没读过就不该由 focus 触发");

  await readLiked(fakePort({ ids: ["a"] }));
  assert.equal(shouldRefreshOnFocus(), false, "刚读完，切回来不该再打接口");
  assert.equal(shouldRefreshOnFocus(-1), true, "超过间隔才重读");
});

test("订阅：成功只要一次（乐观那次就够），失败要两次（乐观 + 回滚）", async () => {
  beginAccount("netease");
  await readLiked(fakePort({ ids: ["a"] }));
  let hits = 0;
  subscribe(() => {
    hits += 1;
  });

  await pressAccountLike(fakePort({}), "a", false);
  assert.equal(hits, 1, `成功路径状态已经对，落定不该再刷一次（实际 ${hits}）`);

  hits = 0;
  await assert.rejects(() => pressAccountLike(fakePort({ fail: "write" }), "a", true), /写失败/);
  assert.equal(hits, 2, `失败路径：乐观 1 次 + 回滚 1 次（实际 ${hits}）`);
});
