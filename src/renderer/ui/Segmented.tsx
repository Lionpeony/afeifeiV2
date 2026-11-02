export interface SegmentedItem {
  id: string;
  name: string;
}

/**
 * 分段 chip（docs/09 B3）：音源这类"少而固定"的选项摊开成按钮组，
 * 不用折叠下拉——一眼看见所有源，切一次单击。选中态沿用 ref/20 §2④：
 * 字重 700 + 墨边，不用朱砂（朱砂只给"正在播放"）。
 */
export function Segmented({
  items,
  value,
  onChange,
  label,
}: {
  items: SegmentedItem[];
  value: string;
  onChange(id: string): void;
  label: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={it.id === value}
          className={it.id === value ? "on" : ""}
          onClick={() => onChange(it.id)}
        >
          {it.name}
        </button>
      ))}
    </div>
  );
}
