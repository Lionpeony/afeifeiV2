/**
 * 页头三件套（docs/09 B1，旧仓 .rs-head 的还原）：
 * 33px 大标 + 朱砂句号（每页唯一一处红）+ 右侧 mono 大写注 + 1px 墨底线。
 * meta 用 mono 10px 大写 0.16em 字距——印刷品的排版习惯。
 */
export function PageHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <header className="page-head">
      <h1>
        {title}
        <em>.</em>
      </h1>
      {meta ? <span className="page-meta">{meta}</span> : null}
    </header>
  );
}
