export interface OpticEmptyScreenProps {
  code: string;
  title: string;
  sub: string;
  ctaLabel?: string;
  onCta?: () => void;
}

/**
 * 全站统一深黑点阵 LED 待机空态屏（docs/34 v3.0 §4 & §6）。
 * 嵌在 L1 阴刻凹槽内的精密黑屏：等宽状态码 + 呼吸 LED + 人话说明 + 倒角光学 CTA。
 */
export function OpticEmptyScreen({ code, title, sub, ctaLabel, onCta }: OpticEmptyScreenProps) {
  return (
    <div className="optic-empty" role="status">
      <div className="optic-empty__screen">
        <div className="optic-empty__bar">
          <i className="optic-led is-on" aria-hidden="true" />
          <span className="optic-empty__code">{code}</span>
        </div>
        <div className="optic-empty__grid" aria-hidden="true">
          {Array.from({ length: 15 }, (_, i) => (
            <i key={i} className={"optic-empty__dot" + (i === 7 ? " is-lit" : "")} />
          ))}
        </div>
      </div>
      <h3 className="optic-empty__title">{title}</h3>
      <p className="optic-empty__sub">{sub}</p>
      {ctaLabel && onCta ? (
        <button type="button" className="btn btn-primary" onClick={onCta}>
          {ctaLabel}
        </button>
      ) : null}
    </div>
  );
}
