import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "../dist-test/redact.mjs";

test("会话与 cookie 不落包", () => {
  const text = "qqmusic_session=abc123; MUSIC_U=xyz789; NMTID=nm001";
  const out = redact(text);
  assert.ok(!out.includes("abc123"));
  assert.ok(!out.includes("xyz789"));
  assert.ok(!out.includes("nm001"));
});

test("token / password / authorization 遮罩", () => {
  const out = redact('token="abc.def" password=hunter2 Authorization: Bearer eyJhbGciOi');
  assert.ok(!out.includes("abc.def"));
  assert.ok(!out.includes("hunter2"));
  assert.ok(!out.includes("eyJhbGciOi"));
});

test("手机号只留头尾", () => {
  assert.equal(redact("用户 13812345678 登录"), "用户 138****5678 登录");
});

test("业务信息不被误伤", () => {
  const text = "[netease] song_url 无地址 code=-460 msg=网络环境存在风险";
  assert.equal(redact(text), text);
});
