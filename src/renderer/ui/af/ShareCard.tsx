/* 分享卡片：把「正在听」做成一张带包皮肤的卡（梗带出去的第一步）。
   DOM 渲染供截图，文案一键复制；封面不进卡（远程图会污染 canvas，本地也未必有）。 */
import { useState } from "react";

import { useAf } from "./context.js";
import { roamCopies } from "./copy.js";
import { PALETTES } from "./data.js";
import { IconX } from "./icons.js";

export function ShareCard({ onClose }: { onClose(): void }) {
  const af = useAf();
  const pack = PALETTES.find((p) => p.id === af.palette);
  const t = af.track;
  const lines = roamCopies(af.palette);
  const hash = Array.from(t.title).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const quote = lines[hash % lines.length];
  const eggTotal = af.eggs.length;
  const found = af.packEggs[af.palette]?.length ?? 0;
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    const text = `「${t.title}」 ${t.artist}\n${quote}\n— AFEIFEI · ${pack?.label ?? "默认"}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板不可用就算了，卡还在 */
    }
  };

  return (
    <div className="share-veil" role="dialog" aria-label="分享卡片" onClick={onClose}>
      <div className="share-card" onClick={(e) => e.stopPropagation()}>
        <span className="share-card__quote hand">{quote}</span>
        <b className="share-card__title">{t.title}</b>
        <span className="share-card__artist">{t.artist}</span>
        <span className="share-card__foot">
          <i className="share-card__dot" style={{ background: pack?.dot }}></i>
          AFEIFEI · {pack?.label ?? "默认"}
          {af.palette !== "default" ? <em>本包拨片 {found}/{eggTotal}</em> : null}
        </span>
        <div className="share-card__acts">
          <button className="btn btn-soft btn-sm" onClick={() => void copy()}>{copied ? "抄好了" : "复制分享文案"}</button>
          <button className="btn btn-soft btn-sm" onClick={onClose}><IconX size={12} />收起</button>
        </div>
        <span className="share-card__hint hand">截图就能带走</span>
      </div>
    </div>
  );
}
