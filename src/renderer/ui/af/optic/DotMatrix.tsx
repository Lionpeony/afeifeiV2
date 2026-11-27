/**
 * 精密点阵 LED 矩阵组件（docs/34 §1 #4）。
 * 与侧栏 <glass-toggle> 同源的点阵视觉语法：未点亮像素保留物理暗格底纹（--dot-off），
 * 点亮像素走 --dot-on / --accent；纯 SVG 渲染，零 WebGL 与 rAF 开销。
 */

const GLYPHS: Record<string, readonly string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

export interface DotMatrixDigitsProps {
  value: string;
  dotSize?: number;
  gap?: number;
  accent?: boolean;
  className?: string;
}

/** 5×7 点阵数字串（用于日期大数字、空态待机编号、统计仪数显）。 */
export function DotMatrixDigits({ value, dotSize = 3, gap = 1.5, accent = false, className }: DotMatrixDigitsProps) {
  const chars = Array.from(value);
  const step = dotSize + gap;
  const charW = 5 * step;
  const charGap = step;
  const w = Math.max(1, chars.length * charW + Math.max(0, chars.length - 1) * charGap);
  const h = 7 * step;
  const onFill = accent ? "var(--accent)" : "var(--dot-on)";

  return (
    <svg
      className={className ? `optic-dots ${className}` : "optic-dots"}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-label={value}
      role="img"
    >
      {chars.map((ch, ci) => {
        const grid = GLYPHS[ch] ?? GLYPHS[" "];
        const ox = ci * (charW + charGap);
        return grid.map((row, ry) =>
          Array.from(row).map((bit, cx) => (
            <rect
              key={`${ci}-${ry}-${cx}`}
              x={ox + cx * step}
              y={ry * step}
              width={dotSize}
              height={dotSize}
              rx={dotSize * 0.28}
              fill={bit === "1" ? onFill : "var(--dot-off)"}
            />
          )),
        );
      })}
    </svg>
  );
}

/** 7×7 点阵待机图标（空态待机屏专用：音符 / 唱片）。 */
const ICON_NOTE = [
  "0001111",
  "0001001",
  "0001001",
  "0001000",
  "0111000",
  "1111000",
  "0110000",
];

const ICON_DISC = [
  "0111110",
  "1100011",
  "1001001",
  "1010101",
  "1001001",
  "1100011",
  "0111110",
];

export function DotMatrixIcon({ kind = "note", dotSize = 4, gap = 2 }: { kind?: "note" | "disc"; dotSize?: number; gap?: number }) {
  const grid = kind === "disc" ? ICON_DISC : ICON_NOTE;
  const step = dotSize + gap;
  const size = 7 * step;
  return (
    <svg className="optic-dots" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {grid.map((row, ry) =>
        Array.from(row).map((bit, cx) => (
          <rect
            key={`${ry}-${cx}`}
            x={cx * step}
            y={ry * step}
            width={dotSize}
            height={dotSize}
            rx={dotSize * 0.28}
            fill={bit === "1" ? "var(--dot-on)" : "var(--dot-off)"}
          />
        )),
      )}
    </svg>
  );
}
