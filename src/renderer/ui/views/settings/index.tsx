import { PageHead } from "../../PageHead.js";
import type { Theme } from "../../theme.js";

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
}

/**
 * 设置：v11 稿子里没有这一页，按同套排版自己排——
 * 三段（外观 / 播放 / 数据），一行一个开关，右侧永远是"当前值 + 一个动作"。
 * 只摆真实存在的开关：不写死快捷键、不摆未接线的选项。
 */
export function SettingsView(props: SettingsViewProps) {
  const { theme, onTheme, trackCount, scanning, notice } = props;

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
        </section>

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
