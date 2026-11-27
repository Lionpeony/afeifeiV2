import { DotMatrixDigits } from "./DotMatrix.js";

export interface OpticStatDisplayProps {
  value: string | number;
  label: string;
  unit?: string;
  sub?: string;
  active?: boolean;
  className?: string;
}

/**
 * 深黑点阵 LED 数显仪表块（docs/34 v3.0 §4）。
 * 用于演出档案、本地曲库、我喜欢的音乐、播放历史与下载管理的精密硬件数显。
 */
export function OpticStatDisplay({
  value,
  label,
  unit,
  sub,
  active = true,
  className = "",
}: OpticStatDisplayProps) {
  const digits = String(value);
  return (
    <div className={"optic-stat" + (className ? " " + className : "")}>
      <div className="optic-stat__head">
        <span className="optic-stat__label">{label}</span>
        <i className={"optic-led" + (active ? " is-on" : "")} aria-hidden="true" />
      </div>
      <div className="optic-stat__val">
        <DotMatrixDigits value={digits} dotSize={3} gap={1.5} />
        {unit ? <span className="optic-stat__unit">{unit}</span> : null}
      </div>
      {sub ? <div className="optic-stat__sub">{sub}</div> : null}
    </div>
  );
}
