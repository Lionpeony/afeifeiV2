/**
 * 生成封套（SPEC-VISUAL §4.3.1，封面缺失/比例越界时的兜底）：
 * 网格底纹 + 黑胶盘 + 青瓷标 + 扫描线 + 外框，色全走 --live-* token。
 * 2026-11-11 按发行页规格收编：电台字样（NS-1106 · SIDE A / AFEIFEI BROADCAST · STEREO）
 * 退役，右上改挂本期目录号（mono 8 / --live-signal 62%）——无目录号就不印。
 */
export function NightCoverArt({ className, cat }: { className?: string; cat?: string }) {
  const bgTop = "var(--live-panel)";
  const bgMid = "var(--live-bg)";
  return (
    <svg
      className={className}
      viewBox="0 0 591 596"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ns-bg" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={bgTop} />
          <stop offset="0.55" stopColor={bgMid} />
          <stop offset="1" stopColor="var(--live-ink)" />
        </linearGradient>
        <radialGradient id="ns-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--live-accent)" stopOpacity="0.24" />
          <stop offset="0.6" stopColor="var(--live-accent)" stopOpacity="0.07" />
          <stop offset="1" stopColor="var(--live-accent)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ns-vinyl" cx="0.38" cy="0.32" r="0.86">
          <stop offset="0" stopColor={bgTop} />
          <stop offset="0.55" stopColor={bgMid} />
          <stop offset="1" stopColor="var(--live-ink)" />
        </radialGradient>
        <radialGradient id="ns-label" cx="0.38" cy="0.3" r="0.92">
          <stop offset="0" stopColor="var(--live-accent)" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="var(--live-accent)" />
          <stop offset="1" stopColor="var(--live-accent)" stopOpacity="0.55" />
        </radialGradient>
        <pattern id="ns-scan" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1.1" fill="var(--live-ink)" opacity="0.3" />
        </pattern>
        <clipPath id="ns-disc">
          <circle cx="424" cy="226" r="244" />
        </clipPath>
      </defs>

      <rect width="591" height="596" fill="url(#ns-bg)" />
      <circle cx="476" cy="198" r="330" fill="url(#ns-glow)" />

      <g stroke="var(--live-signal)" strokeOpacity="0.05">
        <line x1="74" y1="0" x2="74" y2="596" />
        <line x1="148" y1="0" x2="148" y2="596" />
        <line x1="222" y1="0" x2="222" y2="596" />
        <line x1="296" y1="0" x2="296" y2="596" />
        <line x1="370" y1="0" x2="370" y2="596" />
        <line x1="444" y1="0" x2="444" y2="596" />
        <line x1="518" y1="0" x2="518" y2="596" />
        <line x1="0" y1="74" x2="591" y2="74" />
        <line x1="0" y1="148" x2="591" y2="148" />
        <line x1="0" y1="222" x2="591" y2="222" />
        <line x1="0" y1="296" x2="591" y2="296" />
        <line x1="0" y1="370" x2="591" y2="370" />
        <line x1="0" y1="444" x2="591" y2="444" />
        <line x1="0" y1="518" x2="591" y2="518" />
      </g>

      <circle cx="424" cy="226" r="244" fill="url(#ns-vinyl)" stroke="var(--live-fg)" strokeOpacity="0.14" />
      <g fill="none" stroke="var(--live-fg)">
        {[232, 224, 216, 208, 200, 192, 184, 176, 168, 160, 152, 144, 136, 128, 120, 112, 104, 96].map((r, i) => (
          <circle key={r} cx="424" cy="226" r={r} strokeOpacity={i % 2 === 0 ? 0.06 : 0.045} />
        ))}
      </g>
      <path
        d="M 248 100 A 244 244 0 0 1 576 330"
        fill="none"
        stroke="var(--live-signal)"
        strokeOpacity="0.16"
        strokeWidth="1.4"
        clipPath="url(#ns-disc)"
      />

      <circle cx="424" cy="226" r="86" fill="url(#ns-label)" />
      <circle cx="424" cy="226" r="86" fill="none" stroke="var(--live-ink)" strokeOpacity="0.45" />
      <circle cx="424" cy="226" r="76" fill="none" stroke="var(--live-ink)" strokeOpacity="0.26" />
      <text
        x="424"
        y="214"
        textAnchor="middle"
        fill="var(--live-ink)"
        fontFamily="Cascadia Mono, Consolas, monospace"
        fontSize="8"
        letterSpacing="2"
      >
        AFEIFEI
      </text>
      <circle cx="424" cy="226" r="7" fill="var(--live-bg)" />
      <circle cx="424" cy="226" r="7" fill="none" stroke="var(--live-fg)" strokeOpacity="0.3" />

      <text
        x="552"
        y="36"
        textAnchor="end"
        fill="var(--live-signal)"
        fillOpacity="0.62"
        fontFamily="Cascadia Mono, Consolas, monospace"
        fontSize="8"
        letterSpacing="1.6"
      >
        {cat ?? ""}
      </text>

      <g stroke="var(--live-accent)" strokeOpacity="0.5">
        <line x1="34" y1="340" x2="250" y2="340" strokeOpacity="0.38" />
        {[34, 61, 88, 115, 142, 169, 196, 223, 250].map((x) => (
          <line key={x} x1={x} y1="336" x2={x} y2="344" />
        ))}
      </g>

      <rect width="591" height="596" fill="url(#ns-scan)" opacity="0.5" />
      <rect x="0.5" y="0.5" width="590" height="595" fill="none" stroke="var(--live-fg)" strokeOpacity="0.12" />
    </svg>
  );
}
