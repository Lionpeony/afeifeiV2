/**
 * 桩：folia `services/lucideIconResolver`（主题图标名 → 已加载的 lucide 图标）。
 * 我们没有主题图标系统：`resolveLucideIconNames` 原样透传（空列表时招牌用文字），
 * `resolveLucideIconNode` 恒 null——signRaster 拿到 null 就跳过图标，不会画。
 */
export const resolveLucideIconNames = (icons?: string[]): string[] => icons ?? [];

export type LucideIconNode = readonly (readonly [string, Record<string, string>])[];

export const resolveLucideIconNode = (_name: string | null | undefined): LucideIconNode | null => null;
