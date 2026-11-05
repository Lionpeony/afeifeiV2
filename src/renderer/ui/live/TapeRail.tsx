import type { RoomProgram } from "../../projection/room-program.js";

/**
 * 归档带（docs/27 C.2）：把 RoomProgram 的时间段摊成一条横向带。
 * 每格是一首，越靠前越宽（越近越显眼）；点格子播放该曲。
 * 只负责渲染，分桶与排序全在 projection/room-program。
 */
export function TapeRail({
  program,
  note,
  onPlay,
}: {
  program: RoomProgram;
  /** 口径说明（例如「按入库时间」），不写就交给页头解释 */
  note?: string;
  onPlay(id: string): void;
}) {
  const segments = program.segments.filter((segment) => segment.items.length > 0);
  if (segments.length === 0) return null;
  return (
    <div className="tape-rail">
      {segments.map((segment) => (
        <div className="tape-seg" key={segment.key}>
          <span className="tape-label">
            {segment.label} · {segment.items.length}
          </span>
          <div className="tape-row">
            {segment.items.slice(0, 16).map((item, index) => (
              <button
                type="button"
                key={item.id}
                className="tape-cell"
                style={{ flexGrow: Math.max(0.6, 2 - index * 0.09) }}
                title={`${item.title} — ${item.sub}`}
                onClick={() => onPlay(item.id)}
              >
                <b>{item.title}</b>
                <span>{item.sub}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {note ? <p className="tape-note">{note}</p> : null}
    </div>
  );
}
