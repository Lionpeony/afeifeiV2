/**
 * 封面：有 coverUrl 用真实图；没有就画一张「厂牌封套」。
 * 生成式封套不是占位灰块——它是首页的一部分，必须有可看的排版。
 */
const hashOf = (text: string): number => {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
};

export function SleeveCover({
  title,
  artist,
  coverUrl,
  index,
  className,
}: {
  title: string;
  artist: string;
  coverUrl?: string | null;
  index?: string;
  className?: string;
}) {
  const cls = `hs-cover${className ? ` ${className}` : ""}`;
  if (coverUrl) {
    return (
      <figure className={cls}>
        <img src={coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      </figure>
    );
  }
  const variant = hashOf(title) % 3;
  return (
    <figure className={`${cls} hs-sleeve hs-sleeve-${variant}`} aria-hidden="true">
      <span className="hs-sleeve-lines" />
      <b className="hs-sleeve-title">{title}</b>
      <span className="hs-sleeve-artist">{artist}</span>
      {index ? <span className="hs-sleeve-no">{index}</span> : null}
      <i className="hs-sleeve-seal">夜航</i>
    </figure>
  );
}
