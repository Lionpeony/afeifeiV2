/**
 * 命令注册表（M6 键盘纪律，00 §9.5）：新功能先进命令面板与快捷键，按钮只留主路径。
 * `filterCommands` 是纯函数——排序规则在这里，UI 只渲染结果。
 */

export interface Command {
  id: string;
  label: string;
  /** 显示用快捷键说明（非解析用）。 */
  hint?: string;
  run(): void;
}

const registry = new Map<string, Command>();

export function registerCommand(cmd: Command): () => void {
  registry.set(cmd.id, cmd);
  return () => registry.delete(cmd.id);
}

export function listCommands(): Command[] {
  return [...registry.values()];
}

export function runCommand(id: string): boolean {
  const cmd = registry.get(id);
  if (!cmd) return false;
  cmd.run();
  return true;
}

/**
 * 命令过滤（纯函数，可测）：字段开头命中 > 包含命中 > 不命中。
 * 同级按注册顺序。上限 12 条（00 §9.5）。
 */
export const COMMAND_LIMIT = 12;

export function filterCommands(cmds: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return cmds.slice(0, COMMAND_LIMIT);
  const starts: Command[] = [];
  const contains: Command[] = [];
  for (const c of cmds) {
    const label = c.label.toLowerCase();
    if (label.startsWith(q)) starts.push(c);
    else if (label.includes(q)) contains.push(c);
  }
  return [...starts, ...contains].slice(0, COMMAND_LIMIT);
}
