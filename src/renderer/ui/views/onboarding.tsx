import { useEffect, useRef, useState } from "react";

/**
 * 首次使用引导（C-16）。只在 KV `onboarded` 缺失时出现一次，完成或跳过都写标记。
 * 三步走完核心路径：曲库 → 播放 → 播放页，每步只讲一件事。
 * 键盘：Enter = 下一步 / 完成，Esc = 跳过；卡片接管焦点，Tab 不会被帘子外的元素抓走
 * （浮层下没有可聚焦的自动行为，Esc/Enter 两条快捷键已覆盖键盘路径）。
 */
const STEPS = [
  {
    hint: "LOCAL",
    title: "先把歌放进来",
    body: "「本地」页点「添加目录」选择存放音乐的文件夹，或到 设置 → 曲库 管理；扫描完首页就有推荐。",
  },
  {
    hint: "PLAYBAR",
    title: "底栏是全局播放条",
    body: "任何页面都能播放 / 暂停 / 切歌 / 调音量；点右侧「正在播放」进入播放页。",
  },
  {
    hint: "STAGE",
    title: "播放页随便换看法",
    body: "「视图」浮层里换预设、视觉模式（频谱 / 声纹 / 环形）、封面 3D 轮播；「沉浸」全屏播放，按 Esc 退出。",
  },
];

export function Onboarding({ onDone }: { onDone(): void }) {
  const [step, setStep] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const last = step === STEPS.length - 1;

  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onDone();
      else if (e.key === "Enter" && !e.repeat) {
        if (last) onDone();
        else setStep((s) => s + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, onDone]);

  const s = STEPS[step];
  return (
    <div className="dialog-mask ob-veil" role="dialog" aria-modal="true" aria-label="使用引导">
      {/* key=step：每换一步重放入场动画（一张卡片反复用不重播 keyframes） */}
      <div className="ob-card" key={step} ref={cardRef} tabIndex={-1}>
        <p className="ob-hint">
          {s.hint} · {step + 1} / {STEPS.length}
        </p>
        <h2>{s.title}</h2>
        <p className="ob-body">{s.body}</p>
        <div className="ob-foot">
          <button type="button" className="ob-skip" onClick={onDone}>
            跳过引导
          </button>
          <span className="ob-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <i key={i} className={i === step ? "on" : i < step ? "past" : ""} />
            ))}
          </span>
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)}>
              上一步
            </button>
          ) : null}
          <button type="button" className="ob-next" onClick={() => (last ? onDone() : setStep(step + 1))}>
            {last ? "开始用" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}
