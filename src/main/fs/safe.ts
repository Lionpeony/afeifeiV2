import { safeStorage } from "electron";
import type { SecretCipher } from "./secret.js";

/**
 * Electron `safeStorage` 后端（Windows 走 DPAPI，密文只在本机本用户下可解）。
 * 未 ready / 无系统密钥环时 `isEncryptionAvailable()` 为 false 或抛错，
 * 统一按"不可用"处理，由 `sealSecret` 降级明文。
 */
export const safeCipher: SecretCipher = {
  available(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  },
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (data) => safeStorage.decryptString(data),
};
