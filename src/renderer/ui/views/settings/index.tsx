import { useEffect, useState } from "react";
import { PageHead } from "../../PageHead.js";
import type { Theme } from "../../theme.js";
import { THEME_PRESETS } from "../../theme/presets.js";
import { ShortcutsSection } from "./shortcuts-section.js";
import type { ShortcutAction, ShortcutBinding } from "../../../domain/shortcuts/index.js";
import type { ShortcutStatus } from "../../shortcuts.js";
import { FILTER_PRESETS } from "../../../domain/lyrics/filter.js";
import {
  clearDislikes,
  getDislikes,
  removeDislike,
  subscribe as subscribeDislikes,
} from "../../../domain/dislikes/index.js";

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
  /** 曲库目录列表（M9）：只存路径，扫描按列表重扫。 */
  libraryRoots: string[];
  onAddRoot(): void;
  onRemoveRoot(dir: string): void;
  /** 开机自启（M9）：当前值读自系统，不是本地缓存。 */
  autoLaunch: boolean;
  onAutoLaunch(on: boolean): void;
  /** 歌词正则过滤（B-2）：一行一条。返回写错、已忽略的模式。 */
  lyricFilters: string;
  onSaveLyricFilters(text: string): Promise<string[]>;
  /* ---- 全局配色包（B-9） ---- */
  globalTokenCount: number;
  onImportGlobalTheme(): Promise<Record<string, string> | null>;
  onExportGlobalTheme(): Promise<boolean>;
  onClearGlobalTheme(): Promise<void>;
}

/** 目录只显示最后一段，完整路径放 title 里——盘符一长，整行就被路径吃掉了。 */
function dirName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
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
  // 歌词过滤：props 是启动后异步读回的，挂载时还是空串 → 到了要同步一次
  const [filterText, setFilterText] = useState(props.lyricFilters);
  const [filterNote, setFilterNote] = useState("");
  const [globalNote, setGlobalNote] = useState("");
  useEffect(() => setFilterText(props.lyricFilters), [props.lyricFilters]);
  const [disliked, setDisliked] = useState<string[]>([...getDislikes()]);
  useEffect(() => subscribeDislikes(() => setDisliked([...getDislikes()])), []);
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
              <b>配色</b>
              <span>四档全局配色，控制台和页面一起换；播放页配色独立不受影响</span>
            </span>
            <div className="seg">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.hint}
                  className={theme === preset.id ? "on" : ""}
                  onClick={() => onTheme(preset.id)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <span className="k">
              <b>全局配色包</b>
              <span>
                {props.globalTokenCount > 0
                  ? `已加载 ${props.globalTokenCount} 项覆盖，优先于上面的预设`
                  : "导入一份 JSON，只覆盖结构层颜色；播放页主题包请到播放页导入"}
              </span>
            </span>
            <div className="set-theme-ops">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void props.onImportGlobalTheme().catch((err: unknown) => {
                    setGlobalNote(err instanceof Error ? err.message : String(err));
                  })
                }
              >
                导入
              </button>
              <button type="button" className="btn" onClick={() => void props.onExportGlobalTheme()}>
                导出
              </button>
              {props.globalTokenCount > 0 ? (
                <button type="button" className="btn" onClick={() => void props.onClearGlobalTheme()}>
                  清除
                </button>
              ) : null}
            </div>
          </div>
          {globalNote ? <p className="set-hint">{globalNote}</p> : null}
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
              <b>曲库目录</b>
              <span>
                {props.libraryRoots.length === 0
                  ? "还没添加；第一次扫描时会让你选一个"
                  : `已添加 ${props.libraryRoots.length} 个，重扫按这些目录走`}
              </span>
            </span>
            <button type="button" className="btn" onClick={props.onAddRoot}>
              添加目录
            </button>
          </div>
          {props.libraryRoots.map((dir) => (
            <div className="set-row" key={dir}>
              <span className="k" title={dir}>
                <b>{dirName(dir)}</b>
                <span>{dir}</span>
              </span>
              <button type="button" className="btn" onClick={() => props.onRemoveRoot(dir)}>
                移除
              </button>
            </div>
          ))}
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

        <section className="set-block">
          <h3>
            推荐<span>RECOMMEND</span>
          </h3>
          <div className="set-row">
            <span className="k">
              <b>不喜欢的歌</b>
              <span>
                {disliked.length === 0
                  ? "还没标记；漫游里点「不喜欢 · 少推」就记一条"
                  : `${disliked.length} 首不再进漫游与每日推荐`}
              </span>
            </span>
            {disliked.length > 0 ? (
              <button type="button" className="btn" onClick={() => clearDislikes()}>
                清空
              </button>
            ) : null}
          </div>
          {disliked.slice(0, 20).map((key) => (
            <div className="set-row dislike-row" key={key}>
              <span className="k" title={key}>
                <b>{key.slice(key.lastIndexOf(":") + 1).split(/[\\/]/).pop() || key}</b>
              </span>
              <button type="button" className="btn" onClick={() => removeDislike(key)}>
                移除
              </button>
            </div>
          ))}
          {disliked.length > 20 ? <p className="set-hint">还有 {disliked.length - 20} 首未列出。</p> : null}
        </section>

        <section className="set-block">
          <h3>
            歌词<span>LYRICS</span>
          </h3>
          <div className="set-row">
            <span className="k">
              <b>正则过滤</b>
              <span>一行一条，命中整行不显示；保存立即生效，不用重新抓歌词</span>
            </span>
          </div>
          <textarea
            className="set-area"
            rows={4}
            value={filterText}
            aria-label="歌词过滤正则，一行一条"
            placeholder={"版权|未经许可\n歌词来源|作词|作曲"}
            onChange={(e) => setFilterText(e.target.value)}
          />
          <div className="set-filter-ops">
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="btn"
                onClick={() =>
                  setFilterText((prev) =>
                    prev.includes(preset.pattern) ? prev : `${prev.trim()}${prev.trim() ? "\n" : ""}${preset.pattern}`,
                  )
                }
              >
                加「{preset.label}」
              </button>
            ))}
            <button
              type="button"
              className="primary"
              onClick={() =>
                void props.onSaveLyricFilters(filterText).then((invalid) => {
                  const count = filterText.split(/\r?\n/).filter((x) => x.trim()).length;
                  setFilterNote(
                    invalid.length > 0
                      ? `已保存 ${count} 条；这些正则写法不对，已忽略：${invalid.join("、")}`
                      : `已保存 ${count} 条规则。`,
                  );
                })
              }
            >
              保存
            </button>
          </div>
          {filterNote ? <p className="set-hint">{filterNote}</p> : null}
        </section>

        <section className="set-block">
          <h3>
            启动<span>STARTUP</span>
          </h3>
          <div className="set-row">
            <span className="k">
              <b>开机自启</b>
              <span>跟系统设置同源：在系统里关掉，这里也会跟着变</span>
            </span>
            <div className="seg">
              {(
                [
                  [false, "关闭"],
                  [true, "开启"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  className={props.autoLaunch === value ? "on" : ""}
                  onClick={() => props.onAutoLaunch(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <p className="set-note">{notice || "所有改动即时生效；恢复备份需要重启应用。"}</p>
      </div>
    </section>
  );
}
