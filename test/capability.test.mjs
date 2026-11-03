import { test } from "node:test";
import assert from "node:assert/strict";
import { __resetRegistry, assertCapabilities, can, getProvider, listProviders, registerProvider } from "../dist-test/capability-registry.mjs";
import { ERROR_INFO, errorText, isRetryable, translateError } from "../dist-test/capability-errors.mjs";
import { demoProvider } from "../dist-test/capability-demo.mjs";
import { createNeteaseProvider } from "../dist-test/capability-netease.mjs";

/* ---------- 启动断言 ---------- */

test("示例源能通过断言（契约是可实现的）", () => {
  assert.doesNotThrow(() => assertCapabilities(demoProvider));
});

test("声明了 canSearch 却没实现 search → 启动即炸", () => {
  const broken = {
    ...demoProvider,
    id: "broken",
    capabilities: { ...demoProvider.capabilities },
    search: undefined,
  };
  delete broken.search;
  assert.throws(() => assertCapabilities(broken), /canSearch.*search/);
});

test("声明为 false 的能力不要求实现（可选方法）", () => {
  const minimal = {
    id: "minimal",
    name: "最小源",
    capabilities: {
      canSearch: true,
      canGetDetail: false,
      canGetUrl: false,
      canGetLyric: false,
      canLogin: false,
      canGetAlbum: false,
      canGetArtist: false,
      canGetPlaylist: false,
      canListPlaylists: false,
      canGetRadio: false,
      canFavorite: false,
      canGetToplist: false,
    },
    traits: { requiresAuth: false, qualities: ["128k"] },
    search: async () => ({ items: [] }),
  };
  assert.doesNotThrow(() => assertCapabilities(minimal));
});

test("声明了 canListPlaylists 却没实现 listPlaylists → 启动即炸（M9-5）", () => {
  const broken = {
    ...demoProvider,
    id: "broken-pl",
    capabilities: { ...demoProvider.capabilities, canListPlaylists: true },
  };
  delete broken.listPlaylists;
  assert.throws(() => assertCapabilities(broken), /canListPlaylists.*listPlaylists/);
});

test("歌单契约（M9-5）：demo 源能列歌单并取回曲目（第三家源 UI 零改动的靶子）", async () => {
  const lists = await demoProvider.listPlaylists();
  assert.equal(lists.length, 1);
  const tracks = await demoProvider.getPlaylist(lists[0].id);
  assert.equal(tracks.items.length, demoProvider.listPlaylists ? 3 : 0);
  assert.equal(tracks.items[0].sourceId, "demo-1");
});

test("声明了 canGetToplist 却没实现 listToplists → 启动即炸（A-14）", () => {
  const broken = {
    ...demoProvider,
    id: "broken-top",
    capabilities: { ...demoProvider.capabilities, canGetToplist: true },
  };
  assert.throws(() => assertCapabilities(broken), /canGetToplist.*listToplists/);
});

test("A-14 榜单：netease 走 toplist 接口，脏条目被丢掉、缺字段有兜底", async () => {
  const calls = [];
  const api = {
    call: async (ns, method) => {
      calls.push(`${ns}:${method}`);
      if (method !== "toplist") return {};
      return {
        list: [
          { id: 19723756, name: "云音乐飙升榜", trackCount: 100, coverImgUrl: "https://cdn/1.jpg" },
          { id: 2 },
          { name: "没有 id 的条目" },
        ],
      };
    },
  };
  const p = createNeteaseProvider(api);
  assert.equal(p.capabilities.canGetToplist, true);
  assert.doesNotThrow(() => assertCapabilities(p), "声明 true 就必须真的有实现");

  const lists = await p.listToplists();
  assert.equal(calls[0], "netease:toplist", "请求的方法名必须与主进程白名单登记的一致");
  assert.deepEqual(lists[0], {
    id: "19723756",
    name: "云音乐飙升榜",
    count: 100,
    coverUrl: "https://cdn/1.jpg",
  });
  assert.equal(lists.length, 2, "没有 id 的条目必须丢掉（否则下钻会 404）");
  assert.equal(lists[1].name, "未命名榜单");
  assert.equal(lists[1].count, 0);
});

test("缺 capabilities 声明 → 炸", () => {
  assert.throws(() => assertCapabilities({ id: "x", name: "x", traits: { qualities: [] } }), /capabilities/);
});

test("缺 traits.qualities → 炸", () => {
  assert.throws(
    () => assertCapabilities({ ...demoProvider, id: "y", traits: { requiresAuth: false } }),
    /qualities/,
  );
});

/* ---------- 注册表 ---------- */

test("注册后能按 id 取回", () => {
  __resetRegistry();
  registerProvider(demoProvider);
  assert.equal(getProvider("demo")?.name, "示例音源");
  assert.equal(listProviders().length, 1);
});

test("重复注册同一个 id → 炸（防止两家源抢同一个 id）", () => {
  __resetRegistry();
  registerProvider(demoProvider);
  assert.throws(() => registerProvider(demoProvider), /id 重复/);
});

test("can() 读的是声明，不是去试", () => {
  __resetRegistry();
  registerProvider(demoProvider);
  assert.equal(can("demo", "canSearch"), true);
  assert.equal(can("demo", "canLogin"), false);
  assert.equal(can("nobody", "canSearch"), false);
});

/* ---------- 契约可用性 ---------- */

test("示例源：搜索能出结果", async () => {
  const result = await demoProvider.search("示例");
  assert.ok(result.items.length > 0);
  assert.ok(result.items[0].sourceId.startsWith("demo-"));
});

test("示例源：分页给出 nextPage，最后一页不给", async () => {
  const page0 = await demoProvider.search("", 0);
  assert.equal(page0.items.length, 2);
  assert.equal(page0.nextPage, 1);

  const page1 = await demoProvider.search("", 1);
  assert.equal(page1.nextPage, undefined, "最后一页不该再给 nextPage");
});

test("示例源：详情查不到就抛错（由上层翻译成 track-missing）", async () => {
  await assert.rejects(() => demoProvider.getDetail("ghost"), /404/);
});

/* ---------- 错误翻译 ---------- */

test("十二个错误码齐全，每个都有文案", () => {
  const codes = Object.keys(ERROR_INFO);
  assert.equal(codes.length, 12);
  for (const code of codes) assert.ok(ERROR_INFO[code].text.length > 0, code);
});

test("401 / 403 → auth-expired", () => {
  assert.equal(translateError({ status: 401 }), "auth-expired");
  assert.equal(translateError({ status: 403 }), "auth-expired");
});

test("404 → track-missing", () => {
  assert.equal(translateError({ status: 404 }), "track-missing");
  assert.equal(translateError(new Error("404 not found")), "track-missing");
});

test("超时 / 连接失败 → network", () => {
  assert.equal(translateError(new Error("ETIMEDOUT")), "network");
  assert.equal(translateError(new Error("fetch failed")), "network");
  assert.equal(translateError({ status: 503 }), "network");
});

test("5xx 当网络问题（服务端挂了，用户能做的是重试）", () => {
  assert.equal(translateError({ status: 500 }), "network");
});

test("取消 → aborted", () => {
  assert.equal(translateError(new Error("aborted by user")), "aborted");
});

test("自家抛的码原样透出（不重复翻译）", () => {
  assert.equal(translateError("quality-unavailable"), "quality-unavailable");
  assert.equal(translateError({ code: "auth-required" }), "auth-required");
});

test("不认识的一律 unknown，不把原始信息漏给界面", () => {
  assert.equal(translateError(new Error("something weird 0x8007")), "unknown");
  assert.equal(translateError(null), "unknown");
});

test("errorText / isRetryable 走同一张表", () => {
  assert.equal(errorText("network"), "网络有点慢");
  assert.equal(isRetryable("network"), true);
  assert.equal(isRetryable("track-missing"), false);
});
