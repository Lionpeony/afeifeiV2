/**
 * 桩：folia `components/visualizer/lucidePath2d`（lucide 图标节点 → Path2D）。
 * 上游 `resolveLucideIconNode` 恒返回 null（见 stubs/lucideIconResolver），
 * 招牌一律走文字/图形兜底，本函数永远不该被调到；真要图标时再搬 folia 的实现。
 */
export const lucideIconPath2d = (_node: unknown): Path2D => {
  throw new Error("[machi] lucideIconPath2d 未实现：resolveLucideIconNode 恒为 null，不应到达这里");
};
