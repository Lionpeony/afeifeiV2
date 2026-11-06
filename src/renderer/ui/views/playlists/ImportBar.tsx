import { useEffect, useRef, useState } from "react";

interface Props {
  busy: boolean;
  /** 上一次提交的错误：变了就把焦点送回输入框，用户不用再点一次 */
  error: string;
  onSubmit(ref: string): void;
  onClose(): void;
}

/**
 * 导入条：粘分享链接是低频动作（收藏一次就够），所以从工具行撤到页头按钮后面，
 * 点开才占一行。Enter 提交、Esc 收起。
 */
export function ImportBar({ busy, error, onSubmit, onClose }: Props) {
  const [ref, setRef] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) input.current?.focus();
  }, [error]);

  const submit = (): void => {
    const text = ref.trim();
    if (!text || busy) return;
    onSubmit(text);
  };

  return (
    <div className="pl-import">
      <input
        ref={input}
        className="search"
        // 展开即聚焦：用户点「导入」就是为了粘东西，不该再点一次输入框
        autoFocus
        value={ref}
        placeholder="粘贴分享链接或歌单 id，回车导入…"
        aria-label="歌单分享链接或 id"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setRef(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onClose();
        }}
      />
      <button type="button" className="primary" onClick={submit} disabled={busy || !ref.trim()}>
        导入
      </button>
      <button type="button" className="pl-import-x" onClick={onClose} aria-label="收起导入">
        ×
      </button>
    </div>
  );
}
