/**
 * 全局快捷键的**重复触发放行闸**（P0-23「长按不重复触发」）。
 *
 * 系统级注册拿不到 keyup，按住方向键时 Electron 会按系统的 key repeat 反复回调，
 * 5 秒一步的 seek 会一路飙到底。这里按动作做冷却：同一条动作在 `cooldownMs` 内只放行一次。
 *
 * 为什么放在渲染层而不是主进程：主进程只做系统调用（注册 + 转发），"按一次算几次"
 * 是策略；放这儿还能被 node 直接测（`test/shortcuts.test.mjs`）。
 *
 * `ponytail:` 用固定冷却而不是"按住期间只算一次"——后者要自己监听 keyup，而系统级
 * 快捷键根本没有 keyup。代价是故意在 250ms 内连点两下只算一下；要改就换成 400ms 或
 * 每条动作独立配置，升级路径就在这个函数签名里。
 */
export function createTriggerGate(cooldownMs = 250): (id: string, now?: number) => boolean {
  const last = new Map<string, number>();
  return (id: string, now: number = Date.now()): boolean => {
    const prev = last.get(id);
    if (prev !== undefined && now - prev < cooldownMs) return false;
    last.set(id, now);
    return true;
  };
}
