#!/usr/bin/env node
/**
 * QQ 登录链路自检（交付前必跑）。
 *
 * 背景：M6.1 连续三轮把带 bug 的链路交给用户手点（http 白名单、qrimg 字段名、key 贯通），
 * 根因都是"verify 全绿 = 代码提交"，而 verify 不打 QQ 链路。本脚本把链路里
 * **除真实扫码外的每一环**都跑一遍，交付声明必须附本脚本输出。
 *
 * 需要 网络（create 要调 QQ 上游拿二维码）。跑法：node scripts/qq-selfcheck.mjs
 */
process.env.PORT = "3210";
process.env.NODE_ENV = "production";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("d:/AI/afeifei-v2/node_modules/@yakult-green-tea/qq-music-api/dist/src/app.js");

const BASE = "http://127.0.0.1:3210";
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};

const get = async (p) => {
  const r = await fetch(BASE + p);
  return { status: r.status, json: await r.json().catch(() => null), raw: r };
};

setTimeout(async () => {
  try {
    // ① 服务本体
    const ch = await get("/login/channels");
    check("服务已启动且 /login/channels 可达", ch.status === 200 && Array.isArray(ch.json?.data?.channels),
      `channels=${JSON.stringify(ch.json?.data?.channels)}`);

    // ② 扫码 key
    const keyRes = await get("/login/qr/key");
    const key = keyRes.json?.data?.unikey;
    check("/login/qr/key 返回 unikey", keyRes.status === 200 && typeof key === "string" && key.length > 10,
      `key 长度=${key?.length ?? 0}`);

    // ③ 二维码（create）——必须是 dataURL 且非空
    const create = await get(`/login/qr/create?key=${encodeURIComponent(key)}&channel=qq`);
    const qrimg = create.json?.data?.qrimg ?? "";
    check("/login/qr/create 返回非空 dataURL 二维码",
      create.status === 200 && qrimg.startsWith("data:image/"),
      `qrimg 长度=${qrimg.length}${qrimg.startsWith("data:image/") ? "" : "（不是 dataURL！）"}`);

    // ④ check 带 key：未扫码状态必须是 801
    const chk = await get(`/login/qr/check?key=${encodeURIComponent(key)}`);
    check("/login/qr/check?key= 未扫码返回 801", chk.status === 200 && chk.json?.code === 801,
      `code=${chk.json?.code} message=${chk.json?.message}`);

    // ⑤ check 不带 key 必须报错（回归：M6.1 曾把 key 丢了导致永远 801）
    const noKey = await get("/login/qr/check");
    check("check 缺 key 时不得返回 801（key 必填回归）", !(noKey.json?.code === 801),
      `code=${noKey.json?.code}`);

    // ⑥ 登录态查询（未登录 data 为空对象）
    const st = await get("/login/status");
    check("/login/status 可达（未登录 data 为空）", st.status === 200 && !!st.json?.data && typeof st.json.data === "object",
      `data keys=${JSON.stringify(Object.keys(st.json?.data ?? {}))}`);

    // ⑦ 搜索（匿名可用性回归）
    const se = await get("/search?keyword=" + encodeURIComponent("晴天") + "&limit=1");
    const items = se.json?.items;
    check("/search 匿名可用", se.status === 200 && Array.isArray(items) && items.length > 0,
      `items=${items?.length ?? 0} 首个 mid=${items?.[0]?.mid ?? "(无)"}`);

    // ⑧ 歌词
    const mid = items?.[0]?.mid;
    const ly = mid ? await get(`/getLyric?songmid=${mid}`) : null;
    check("/getLyric 返回 LRC", !!ly && ly.status === 200 && typeof ly.json?.response?.lyric === "string" && ly.json.response.lyric.includes("["),
      `lyric 长度=${ly?.json?.response?.lyric?.length ?? 0}`);

    // ⑨ 播放地址（未登录允许空 url，但结构与错误码必须明确）
    const pl = mid ? await get(`/getMusicPlay/${mid}`) : null;
    const playUrl = pl?.json?.data?.playUrl?.[mid];
    check("/getMusicPlay 结构明确（playUrl[mid] 存在）", !!pl && pl.status === 200 && !!playUrl,
      `url=${playUrl?.url ? "有" : "空(未登录预期)"} error=${playUrl?.error ?? "-"}`);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${failed.length === 0 ? "QQ SELF-CHECK PASS" : "QQ SELF-CHECK FAIL"}：${results.length - failed.length}/${results.length} 环通过`);
    process.exit(failed.length === 0 ? 0 : 1);
  } catch (e) {
    console.log("SELF-CHECK ABORT:", e.message);
    process.exit(1);
  }
}, 6000);
