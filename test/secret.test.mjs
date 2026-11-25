import { test } from "node:test";
import assert from "node:assert/strict";
import { openSecret, sealSecret } from "../dist-test/fs-secret.mjs";

/** 假后端：字节反转当"加密"，只为验证信封格式与降级分支（真实现走 safeStorage） */
const fake = {
  available: () => true,
  encrypt: (plain) => Buffer.from(plain, "utf8").reverse(),
  decrypt: (data) => Buffer.from(data).reverse().toString("utf8"),
};

test("sealSecret：密文带版本前缀、不含原文；openSecret 往返一致", () => {
  const sealed = sealSecret("MUSIC_U=abc123", fake);
  assert.ok(sealed.startsWith("enc:v1:"));
  assert.equal(sealed.includes("MUSIC_U"), false, "密文里不许出现凭据原文");
  assert.equal(openSecret(sealed, fake), "MUSIC_U=abc123");
});

test("openSecret：兼容旧明文，坏密文返回 null（按未登录）", () => {
  assert.equal(openSecret("MUSIC_U=legacy", fake), "MUSIC_U=legacy");
  const broken = { ...fake, decrypt: () => { throw new Error("dpapi failed"); } };
  assert.equal(openSecret(sealSecret("tok", fake), broken), null);
});

test("sealSecret：平台不支持加密时落明文，旧读写路径仍可用", () => {
  const sealed = sealSecret("tok", { ...fake, available: () => false });
  assert.equal(sealed, "tok");
  assert.equal(openSecret(sealed, fake), "tok");
});
