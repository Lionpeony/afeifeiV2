import type { RoomProgram } from "../../projection/room-program.js";

/**
 * 状态看板（docs/27 C.2）：下载房间的首屏。
 * 只做状态可视化，不放操作按钮——暂停 / 重试 / 删除仍留在下面的表格里，避免两套入口。
 */
export function RoomBoard({ program, note }: { program: RoomProgram; note?: string }) {
  if (program.meta.count === 0) return null;
  return (
    <div className="room-board">
      {program.segments.map((segment) => (
        <div className="board-col" key={segment.key} data-state={segment.key}>
          <div className="board-head">
            <span>{segment.label}</span>
            <b>{segment.items.length}</b>
          </div>
          <div className="board-items">
            {segment.items.map((item) => (
              <span className="board-cell" key={item.id} title={item.title}>
                {item.title}
              </span>
            ))}
            {segment.items.length === 0 ? <span className="board-cell empty">—</span> : null}
          </div>
        </div>
      ))}
      {note ? <p className="board-note">{note}</p> : null}
    </div>
  );
}
