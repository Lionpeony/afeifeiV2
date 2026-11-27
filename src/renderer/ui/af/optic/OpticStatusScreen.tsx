import { DotMatrixDigits } from "./DotMatrix.js";
import { OpticVuMeter } from "./OpticVuMeter.js";

export interface OpticStatusScreenProps {
  day: string;
  month: string;
  weekday: string;
  linked: number;
  totalSources: number;
  eggsFound: number;
  eggsTotal: number;
  playing: boolean;
}

const WEEK_EN: Record<string, string> = {
  周日: "SUN",
  周一: "MON",
  周二: "TUE",
  周三: "WED",
  周四: "THU",
  周五: "FRI",
  周六: "SAT",
};

const MON_EN: Record<string, string> = {
  一月: "JAN",
  二月: "FEB",
  三月: "MAR",
  四月: "APR",
  五月: "MAY",
  六月: "JUN",
  七月: "JUL",
  八月: "AUG",
  九月: "SEP",
  十月: "OCT",
  十一月: "NOV",
  十二月: "DEC",
};

/**
 * 侧栏深黑点阵 LED 仪表屏（docs/34 §4.2 #3，仅 palette="default" 渲染）。
 * 嵌在 L1 阴刻框中的高对比光学黑屏：点阵日期 + 5 柱状态指示 + 音源/彩蛋数显。
 * 暂停时诚实落回静态暗格（不画假频谱，守 00 §5.2）。
 */
export function OpticStatusScreen({
  day,
  month,
  weekday,
  linked,
  totalSources,
  eggsFound,
  eggsTotal,
  playing,
}: OpticStatusScreenProps) {
  const wk = WEEK_EN[weekday] ?? weekday;
  const mn = MON_EN[month] ?? month;

  return (
    <div className={"optic-screen" + (playing ? " is-live" : "")} aria-label={`日期 ${day} · 音源 ${linked}/${totalSources}`}>
      <div className="optic-screen__top">
        <div className="optic-screen__date">
          <DotMatrixDigits value={day} dotSize={3} gap={1.5} />
          <span className="optic-screen__cal">
            <b>{wk}</b>
            <span>{mn}</span>
          </span>
        </div>
        <OpticVuMeter bins={5} rows={6} playing={playing} />
      </div>
      <div className="optic-screen__foot">
        <span className="optic-screen__src">
          <i className={"optic-led" + (linked > 0 ? " is-on" : "")} aria-hidden="true" />
          {linked}/{totalSources} SRC
        </span>
        <span className="optic-screen__egg">EGG {eggsFound}/{eggsTotal}</span>
      </div>
    </div>
  );
}
