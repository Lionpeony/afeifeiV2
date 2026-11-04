import {
  CAPABILITY_METHODS,
  type MethodCapabilities,
  type SourceProvider,
} from "../../contracts/capability.js";

/**
 * 音源注册表 + 启动断言（50 §7.1）。
 *
 * 断言的意义很实在：声明了 `canSearch: true` 却忘了写 `search()`，
 * 如果等到用户点搜索才报 `undefined is not a function`，那是三小时后的事；
 * 启动时炸，是三秒钟的事。
 */

const providers = new Map<string, SourceProvider>();

/** AccountCapability 的五件事，缺一个就在启动时炸（见 assertCapabilities）。 */
const ACCOUNT_METHODS = ["dailySongs", "likedIds", "setLiked", "listeningHistory", "personalFm"] as const;

export class CapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityError";
  }
}

/** 声明 ↔ 实现一一对应。加第三家源时它会自动被检查，不需要有人记得写测试。 */
export function assertCapabilities(provider: SourceProvider): void {
  const caps = provider.capabilities;
  if (!caps || typeof caps !== "object") {
    throw new CapabilityError(`${provider.id}: 缺少 capabilities 声明`);
  }

  for (const [flag, method] of Object.entries(CAPABILITY_METHODS)) {
    const declared = caps[flag as keyof MethodCapabilities];
    if (!declared) continue;
    const impl = (provider as unknown as Record<string, unknown>)[method];
    if (typeof impl !== "function") {
      throw new CapabilityError(`${provider.id}: 声明了 ${flag} 却没有实现 ${method}()`);
    }
  }

  if (!provider.traits || !Array.isArray(provider.traits.qualities)) {
    throw new CapabilityError(`${provider.id}: 缺少 traits.qualities`);
  }

  // account 是一个包，不是一个方法：给了就必须五样齐全，否则入口点进去才炸
  if (provider.account) {
    for (const method of ACCOUNT_METHODS) {
      const impl = (provider.account as unknown as Record<string, unknown>)[method];
      if (typeof impl !== "function") {
        throw new CapabilityError(`${provider.id}: 提供了 account 却缺少 ${method}()`);
      }
    }
  }
}

export function registerProvider(provider: SourceProvider): void {
  if (providers.has(provider.id)) {
    throw new CapabilityError(`音源 id 重复：${provider.id}`);
  }
  assertCapabilities(provider);
  providers.set(provider.id, provider);
}

export function listProviders(): SourceProvider[] {
  return [...providers.values()];
}

export function getProvider(id: string): SourceProvider | undefined {
  return providers.get(id);
}

/** UI 用：这个源到底能不能做某件事（永远读声明，不去试）。 */
export function can(providerId: string, flag: keyof MethodCapabilities): boolean {
  return providers.get(providerId)?.capabilities[flag] ?? false;
}

/** 测试用：清空注册表。生产代码不该调用。 */
export function __resetRegistry(): void {
  providers.clear();
}
