import { useEffect, useRef } from "react";

type GlassToggleEl = HTMLElement & { checked?: boolean };

export interface GlassThemeSwitchProps {
  dark: boolean;
  palette: string;
  onChange: (light: boolean) => void;
  className?: string;
}

/**
 * 上游 <glass-toggle> WebGL2 光学明暗开关封装。
 * - 延迟 500ms 挂载，避开首屏 5000 首索引恢复（afeifei:restore）关键路径；
 * - 联动 dark 与 palette，默认主题呈现日（乐队粉）/夜（冷暮蓝）双色光学；
 * - 静止自动休眠（由 glass-toggle.js 内部实现），守住资源预算。
 */
export function GlassThemeSwitch({ dark, palette, onChange, className }: GlassThemeSwitchProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<GlassToggleEl | null>(null);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    let alive = true;
    let el: GlassToggleEl | null = null;
    const onCh = () => {
      if (el) cbRef.current(Boolean(el.checked));
    };
    const mount = () => {
      if (!alive || !hostRef.current) return;
      el = document.createElement("glass-toggle") as GlassToggleEl;
      el.setAttribute("theme", "auto");
      el.setAttribute("on-icon", "sun");
      el.setAttribute("off-icon", "moon");
      el.setAttribute("hint", "none");
      el.setAttribute("label", "明暗主题");
      if (!darkRef.current) el.setAttribute("checked", "");
      const cs = getComputedStyle(document.documentElement);
      const onColor = cs.getPropertyValue("--glass-on").trim() || cs.getPropertyValue("--accent").trim() || cs.getPropertyValue("--pink-600").trim();
      const offColor = cs.getPropertyValue("--glass-off").trim() || cs.getPropertyValue("--accent").trim() || cs.getPropertyValue("--pink-600").trim();
      if (onColor) el.setAttribute("on-color", onColor);
      if (offColor) el.setAttribute("off-color", offColor);
      el.addEventListener("change", onCh);
      elRef.current = el;
      hostRef.current.appendChild(el);
    };
    const timer = window.setTimeout(mount, 500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      if (el) {
        el.removeEventListener("change", onCh);
        el.remove();
      }
      elRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const cs = getComputedStyle(document.documentElement);
    const onColor = cs.getPropertyValue("--glass-on").trim() || cs.getPropertyValue("--accent").trim() || cs.getPropertyValue("--pink-600").trim();
    const offColor = cs.getPropertyValue("--glass-off").trim() || cs.getPropertyValue("--accent").trim() || cs.getPropertyValue("--pink-600").trim();
    if (onColor) el.setAttribute("on-color", onColor);
    if (offColor) el.setAttribute("off-color", offColor);
    const want = !dark;
    const apply = () => {
      if (Boolean(el.checked) !== want) {
        if (want) el.setAttribute("checked", "");
        else el.removeAttribute("checked");
      }
    };
    if (customElements.get("glass-toggle")) apply();
    else void customElements.whenDefined("glass-toggle").then(apply);
  }, [dark, palette]);

  return <div className={className ? `side-glass ${className}` : "side-glass"} ref={hostRef} />;
}
