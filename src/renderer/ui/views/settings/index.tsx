import { useEffect, useState } from "react";
import { PageHead } from "../../PageHead.js";
import type { Theme } from "../../theme.js";
import { ShortcutsSection } from "./shortcuts-section.js";
import type { ShortcutAction, ShortcutBinding } from "../../../domain/shortcuts/index.js";
import type { ShortcutStatus } from "../../shortcuts.js";

export interface SettingsViewProps {
  theme: Theme;
  onTheme(theme: Theme): void;
  trackCount: number;
  scanning: boolean;
  notice: string;
  onScan(): void;
  onOpenFx(): void;
  onOpenLyric(): void;
  onOpenMini(): void;
  onExportBackup(): void;
  onImportBackup(): void;
  /** 失败策略（P0-15）：跳过下一首 / 停下等用户。 */
  playOnError: "skip" | "pause";
  onPlayOnError(value: "skip" | "pause"): void;
  /** 输出设备（P0-09）：`""` = 跟随系统默认。 */
  outputId: string;
  onOutput(id: string): void;
  /** 全局快捷键（A-24 可配置那半）。 */
  shortcutBindings: ShortcutBinding[];
  shortcutStatus: ShortcutStatus[];
  onShortcutChange(action: ShortcutAction, accelerator: string): Promise<string | null>;
  onShortcutReset(): Promise<void>;
}

/**
 * 设置：v11 稿子里没有这一页，按同套排版自己排——
 * 三段（外观 / 播放 / 数据），一行一个开关，右侧永远是"当前值 + 一个动作"。
 * 只摆真实存在的开关：不写死快捷键、不摆未接线的选项。
 */
export function SettingsView(props: SettingsViewProps) {
  const { theme, onTheme, trackCount, scanning, notice } = props;

  // 输出设备列表（P0-09）。浏览器 API 直接拿，不走 IPC —— sinkId 本来就只在渲染进程有意义。
  // 拿不到（浏览器拒绝/无权限）就只剩"跟随系统默认"一项，不摆空下拉。
  const [outputs, setOutputs] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!alive) return;
        setOutputs(
          list
            .filter((d) => d.kind === "audiooutput")
            .map((d, i) => ({ id: d.deviceId, label: d.label || `输出设备 ${i + 1}` })),
        );
      } catch {
        if (alive) setOutputs([]);
      }
    };
    void load();
    // 插拔耳机/切蓝牙：列表要跟着变，否则用户得重进设置页
    navigator.mediaDevices.addEventListener("devicechange", load);
    return () => {
      alive = false;
      navigator.mediaDevices.removeEventListener("devicechange", load);
    };
  }, []);

  return (
    <section className="settings">
      <PageHead title="设置" desc="所有开关都在本机生效，不上传任何东西。" meta="LOCAL ONLY" />

      <div className="set-body">
        <section className="set-block">
          <h3>
            外观<span>APPEARANCE</span>
          </h3>
          <div className="set-row">
            <span className="k">
              <b>主题</b>
              <span>纸色 / 墨色两套，控制台和页面一起换</span>
            </span>
            <div className="seg">
              {(["light", "dark"] as Theme[]).map((t) => (
                <button key={t} type="button" className={theme === t ? "on" : ""} onClick={() => onTheme(t)}>
                  {t === "light" ? "纸色" : "墨色"}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="set-block">
          <h3>
            播放<span>PLAYBACK</span>
          </h3>
          <div className="set-row">
            <span className="k">
              <b>音效</b>
              <span>均衡器、增益、声道——面板就在控制台右端</span>
            </span>
            <button type="button" className="btn" onClick={props.onOpenFx}>
              打开面板
            </button>
          </div>
          <div className="set-row">
            <span className="k">
              <b>桌面歌词</b>
              <span>独立窗口，可穿透 / 解锁</span>
            </span>
            <button type="button" className="btn" onClick={props.onOpenLyric}>
              打开
            </button>
          </div>
          <div className="set-row">
            <span className="k">
              <b>迷你窗</b>
              <span>贴边常驻的小控制条</span>
            </span>
            <button type="button" className="btn" onClick={props.onOpenMini}>
              打开
            </button>
          </div>
          <div className="set-row">
            <span className="k">
              <b>输出设备</b>
              <span>换声卡 / 蓝牙耳机后立刻生效；拔掉会自动回默认</span>
            </span>
            <select
              className="set-pick"
              value={props.outputId}
              onChange={(e) => props.onOutput(e.target.value)}
              aria-label="输出设备"
            >
              <option value="">跟随系统默认</option>
              {/* 存档里的设备当前不在场时也要能显示：否则下拉会静默跳回"默认"，用户以为设置丢了 */}
              {props.outputId && !outputs.some((d) => d.id === props.outputId) ? (
                <option value={props.outputId}>上次选的设备（当前不可用）</option>
              ) : null}
              {outputs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="set-row">
            <span className="k">
              <b>播放失败时</b>
              <span>先重试两次，仍失败才按这里处理；连跳三首会停下</span>
            </span>
            <div className="seg">
              {(
                [
                  ["skip", "跳过下一首"],
                  ["pause", "停下等我"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={props.playOnError === value ? "on" : ""}
                  onClick={() => props.onPlayOnError(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <ShortcutsSection
          bindings={props.shortcutBindings}
          status={props.shortcutStatus}
          onChange={props.onShortcutChange}
          onResetDefaults={props.onShortcutReset}
        />

        <section className="set-block">
          <h3>
            曲库与数据<span>LIBRARY</span>
          </h3>
          <div className="set-row">
            <span className="k">
              <b>曲库</b>
              <span>当前收录 {trackCount} 首，索引存在本机</span>
            </span>
            <button type="button" className="btn" onClick={props.onScan} disabled={scanning}>
              {scanning ? "扫描中…" : "扫描文件夹"}
            </button>
          </div>
          <div className="set-row">
            <span className="k">
              <b>备份</b>
              <span>曲库索引、红心、歌单、设置打成一份，换机器直接带走</span>
            </span>
            <div className="pair">
              <button type="button" className="btn" onClick={props.onExportBackup}>
                导出
              </button>
              <button type="button" className="btn" onClick={props.onImportBackup}>
                恢复
              </button>
            </div>
          </div>
        </section>

        <p className="set-note">{notice || "所有改动即时生效；恢复备份需要重启应用。"}</p>
      </div>
    </section>
  );
}
