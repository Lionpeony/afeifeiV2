import { NavIcon } from "./icons.js";

/** 联网数据的小刷新按钮：只发一次重新请求，不改变页面其它状态。 */
export function RefreshButton({
  onClick,
  title = "刷新",
  busy = false,
}: {
  onClick(): void;
  title?: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      className={`refresh-btn${busy ? " is-spinning" : ""}`}
      aria-label={title}
      aria-busy={busy}
      title={title}
      onClick={onClick}
    >
      <NavIcon name="refresh" />
      <span>{title}</span>
    </button>
  );
}
