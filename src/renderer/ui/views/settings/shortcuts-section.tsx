/**
 * 设置页 · 全局快捷键区块（A-24 可配置那半）。
 *
 * 录键交互抄 Twilight_Echo 的 `ShortcutsSettingsSection.vue`：
 * 按钮上 **keydown 捕获**、Esc 取消、裸键不收、重复组合不写入。
 * 冲突判定用 `domain/shortcuts` 的纯函数（与主进程注册前同一份规则，
 * 抄 folia-major 的做法：设置页与注册流程共用同一份规则层）。
 */
import { useEffect, useRef, useState } from "react";
import {
  formatAccelerator,
  SHORTCUT_ACTIONS,
  type ShortcutAction,
  type ShortcutBinding,
} from "../../../domain/shortcuts/index.js";
import type { ShortcutStatus } from "../../shortcuts.js";

export interface ShortcutsSectionProps {
  bindings: ShortcutBinding[];
  status: ShortcutStatus[];
  onChange(action: ShortcutAction, accelerator: string): Promise<string | null>;
  onResetDefaults(): Promise<void>;
}

/** KeyboardEvent → Electron accelerator。裸键（无 Ctrl/Alt/Shift）不收。 */
export function acceleratorFromEvent(e: KeyboardEvent): string | null {
  if (e.key === "Escape") return null; // Esc 是取消，不是绑定
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null; // 纯修饰键
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("CommandOrControl");
  if (e.metaKey && !e.ctrlKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null; // 裸键不收（会跟打字冲突）
  let main = e.key;
  if (main === " ") main = "Space";
  else if (main.length === 1) main = main.toUpperCase();
  else if (main.startsWith("Arrow")) main = main.slice(5);
  else if (main === "Enter" || main === "Tab" || main === "Backspace") return null;
  return [...parts, main].join("+");
}

export function ShortcutsSection(props: ShortcutsSectionProps): React.ReactElement {
  const { bindings, status, onChange, onResetDefaults } = props;
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [note, setNote] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);

  // 录键时聚焦按钮：keydown 绑在按钮上，焦点不在就收不到
  useEffect(() => {
    if (recording) btnRef.current?.focus();
  }, [recording]);

  const accOf = (action: ShortcutAction): string => {
    const b = bindings.find((x) => x.action === action);
    return b ? b.accelerator : "";
  };
  const failed = (action: ShortcutAction): boolean =>
    status.some((s) => s.action === action && !s.registered);

  const onKeyDown = (action: ShortcutAction, e: React.KeyboardEvent): void => {
    if (recording !== action) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecording(null);
      setNote("");
      return;
    }
    const acc = acceleratorFromEvent(e.nativeEvent);
    if (!acc) return;
    void onChange(action, acc).then((err) => {
      setRecording(null);
      setNote(err ?? "");
    });
  };

  return (
    <section className="set-block">
      <h3>
        全局快捷键<span>GLOBAL</span>
      </h3>
      <p className="set-sub">应用在后台也能用这些键控制播放（键位存在本机，不上传）。</p>
      {SHORTCUT_ACTIONS.map((a) => {
        const recordingNow = recording === a.action;
        return (
          <div className="set-row" key={a.action}>
            <span className="k">
              <b>{a.label}</b>
              <span>{a.hint}</span>
            </span>
            <span className="pair">
              <button
                ref={recordingNow ? btnRef : undefined}
                type="button"
                className={`btn keycap${recordingNow ? " recording" : ""}${failed(a.action) ? " bad" : ""}`}
                title={failed(a.action) ? "注册失败：可能被其他应用占用" : "点一下再按新键位（Esc 取消）"}
                onClick={() => {
                  setNote("");
                  setRecording(recordingNow ? null : a.action);
                }}
                onKeyDown={(e) => onKeyDown(a.action, e)}
              >
                {recordingNow ? "按下新键位…" : formatAccelerator(accOf(a.action)) || "未设置"}
              </button>
            </span>
          </div>
        );
      })}
      <div className="set-row">
        <span className="k">
          <b>恢复默认</b>
          <span>把上面所有键位换回出厂设置</span>
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void onResetDefaults().then(() => setNote("已恢复默认键位"));
          }}
        >
          全部恢复
        </button>
      </div>
      {note ? <p className="set-note warn">{note}</p> : null}
    </section>
  );
}
