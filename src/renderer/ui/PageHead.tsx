import type { ReactNode } from "react";

/**
 * 页头（2026-11-16 整站换装，design: index.html）：
 * 小标（eyebrow） + 衬线大标题 + 可选说明；右端放计数与操作。
 * 旧版的「朱砂句号」已随整套视觉退役。
 */
export function PageHead({
  title,
  meta,
  desc,
  eyebrow,
  extra,
}: {
  title: string;
  meta?: string;
  desc?: string;
  /** 标题上方的小标：DISCOVER · AFEIFEI MUSIC */
  eyebrow?: string;
  extra?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        {eyebrow ? (
          <p className="eyebrow">
            <span className="dot" />
            {eyebrow}
          </p>
        ) : null}
        <h1>{title}</h1>
        {desc ? <p className="page-desc">{desc}</p> : null}
      </div>
      <span className="sp" />
      {meta ? <span className="page-meta">{meta}</span> : null}
      {extra}
    </header>
  );
}
