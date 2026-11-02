/**
 * 面板/模态栈（M6 键盘纪律）：Esc 要关"最上层"，就得有人记得开闭顺序。
 * 面板开关是组件局部 UI 状态（不进 store——I2 管业务状态），这里只登记
 * "谁开着、怎么关"。后注册的在栈顶。
 */

export type PanelKind = "modal" | "panel";

interface PanelEntry {
  id: string;
  kind: PanelKind;
  close: () => void;
}

const stack: PanelEntry[] = [];

/** 组件挂载/打开面板时调用；返回反注册函数。同 id 重复登记以最后一次为准。 */
export function pushPanel(id: string, kind: PanelKind, close: () => void): () => void {
  unregisterPanel(id);
  stack.push({ id, kind, close });
  return () => unregisterPanel(id);
}

export function unregisterPanel(id: string): void {
  const i = stack.findIndex((p) => p.id === id);
  if (i >= 0) stack.splice(i, 1);
}

/** 只读快照：给 resolveEsc 用（末尾 = 最上层）。 */
export function idsOf(kind: PanelKind): string[] {
  return stack.filter((p) => p.kind === kind).map((p) => p.id);
}

/** 关最上层（模态优先于面板）。有被关的返回其 id。 */
export function closeTop(): string | null {
  const top = [...stack].reverse().find((p) => p.kind === "modal") ?? stack[stack.length - 1];
  if (!top) return null;
  top.close();
  unregisterPanel(top.id);
  return top.id;
}

export function clearPanels(): void {
  stack.length = 0;
}
