/**
 * 落盘密文信封（P1-3 / docs/ref/05 I2）。
 *
 * 只做格式与降级策略，**不 import electron**：主进程用 `safe.ts` 提供
 * `safeStorage` 后端，测试用内存假后端。这样加解密策略可以脱离 Electron 跑测试。
 *
 * 格式：
 *   `enc:v1:<base64>`  平台加密后端可用时的密文
 *   `<原文>`            后端不可用（或旧版本写下的明文）——读取时原样返回，兼容旧数据
 */

export interface SecretCipher {
  available(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

const PREFIX = "enc:v1:";

export function sealSecret(plain: string, cipher: SecretCipher): string {
  let ok = false;
  try {
    ok = cipher.available();
  } catch {
    ok = false;
  }
  if (!ok) return plain; // 没有系统密钥环就落明文：宁可弱一点，也不能退出登录
  return PREFIX + cipher.encrypt(plain).toString("base64");
}

/** 解不开一律返回 null —— 调用方按"没登录"处理，不要让坏数据把启动搞崩。 */
export function openSecret(text: string, cipher: SecretCipher): string | null {
  if (!text.startsWith(PREFIX)) return text; // 旧明文 / 未加密后端写下的值
  try {
    return cipher.decrypt(Buffer.from(text.slice(PREFIX.length), "base64"));
  } catch {
    return null;
  }
}
