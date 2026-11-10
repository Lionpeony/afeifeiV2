/**
 * 启动加载页：装配与首屏联网预取完成前的门面。
 * 不做假百分比——只说正在做什么，数据一到就退场。
 */
export function BootSplash() {
  return (
    <div className="boot-splash" role="status" aria-live="polite">
      <div className="boot-mark">
        <span className="boot-dot" aria-hidden="true" />
        <b>afeifei</b>
      </div>
      <p>正在载入曲库…</p>
      <span className="boot-line" aria-hidden="true" />
    </div>
  );
}
