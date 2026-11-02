import { useEffect, useMemo, useRef, useState } from "react";
import { filterCommands, listCommands, runCommand, type Command } from "./commands.js";
import { pushPanel } from "./panels.js";

/**
 * Ctrl+K 命令面板（00 §9.5）：结果上限 12 条，全键盘可用。
 * ↑/↓ 选择、Enter 执行、Esc 关闭（Esc 走全局 resolveEsc，本组件只注册为面板）。
 * 命令之外还能搜本地歌（searchSongs 提供，命中即播）——「Ctrl+K 搜索 → 播放」验收行。
 */
export function CommandPalette({
  onClose,
  searchSongs,
}: {
  onClose(): void;
  searchSongs?: (query: string) => Command[];
}) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const cmds: Command[] = useMemo(
    () => filterCommands([...listCommands(), ...(searchSongs?.(query) ?? [])], query),
    [query, searchSongs],
  );

  useEffect(() => pushPanel("command-palette", "modal", onClose), [onClose]);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setSel(0), [query]);

  const exec = (cmd: Command | undefined): void => {
    if (!cmd) return;
    runCommand(cmd.id);
    onClose();
  };

  return (
    <div
      className="dialog-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-label="命令面板">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="输入命令或歌名…（↑↓ 选择，Enter 执行）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, cmds.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              exec(cmds[sel]);
            }
          }}
        />
        <div className="palette-list">
          {cmds.map((c, i) => (
            <div
              key={c.id}
              className={`palette-row${i === sel ? " on" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => exec(c)}
            >
              <span>{c.label}</span>
              {c.hint ? <span className="palette-hint">{c.hint}</span> : null}
            </div>
          ))}
          {cmds.length === 0 ? <div className="palette-row">没有匹配的命令</div> : null}
        </div>
      </div>
    </div>
  );
}
