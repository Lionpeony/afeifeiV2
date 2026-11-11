import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";

import type { RemoteTrack } from "../../../../contracts/capability.js";
import { NightCoverArt } from "../NightCoverArt.js";
import { detectCoverTrim, type CoverTrim } from "../../views/stage/tint-client.js";
import { splitLatinRuns } from "../typography.js";

/** 唱针灯牌三态：playing 呼吸青 / paused 警示橙静止 / standby 空心。 */
export type SleeveChip = "playing" | "paused" | "standby";

/** 拉丁 run → 窄体 disp：标题混排共用（mono/sans 分工铁律 3）。 */
export function MixedTitle({ text }: { text: string }) {
  return (
    <>
      {splitLatinRuns(text).map((run, i) => (
        <span key={i} className={run.latin ? "rs-latin" : "rs-cjk"}>
          {run.text}
        </span>
      ))}
    </>
  );
}

/**
 * 封套区（SPEC-VISUAL §2.2/§3）：斜置封套 + 目录号 + 钢印 + 唱针灯牌 + 封套下 plate-meta。
 * 封面三异常（§4.3）：加载失败/无 URL/长宽比越界 [0.8, 1.25] → 生成封套；白边图走 trimScale 反制。
 * 封套叠印层统一走 --night-*（封套是「物」恒暗，不随主题翻色）。
 */
export function ReleaseSleeve({
  track,
  cat,
  seal,
  chip,
  chipText,
  stateName,
  date,
  total,
}: {
  track: RemoteTrack | null;
  /** 目录号全文（含 STEREO 后缀，超长已在上游裁剪） */
  cat: string;
  /** 钢印文字，按行给：今日发行 = [今日, 发行]；待机 = [待机] */
  seal: string[];
  chip: SleeveChip;
  chipText: string;
  /** plate-meta 左端的投影态名 */
  stateName: string;
  date: string;
  total: number;
}) {
  const url = track?.coverUrl;
  const [broken, setBroken] = useState(false);
  const [trim, setTrim] = useState<CoverTrim | null>(null);
  const detecting = useRef<Set<string>>(new Set());

  // 换曲重置检测态：新封面按自己的白边/比例重新走一遍
  useEffect(() => {
    setBroken(false);
    setTrim(null);
  }, [url]);

  const onLoad = (e: SyntheticEvent<HTMLImageElement>): void => {
    const img = e.currentTarget;
    const ratio = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
    // 比例失衡说明图不可靠，裁切必毁主体：整块换生成封套（SPEC-VISUAL §4.3）
    if (ratio < 0.8 || ratio > 1.25) {
      setBroken(true);
      return;
    }
    if (url && !detecting.current.has(url)) {
      detecting.current.add(url);
      detectCoverTrim(url, (t) => setTrim(t));
    }
  };

  // 白边反制（§4.3 原样保留）：中心对称放大，上限 1.17
  const peak = trim ? Math.max(trim.top, trim.right, trim.bottom, trim.left) : 0;
  const trimCss = peak > 0 ? { transform: `scale(${(1 + Math.min(0.15, peak) * 1.15).toFixed(3)})` } : undefined;
  const hasCover = Boolean(url) && !broken;
  const genCat = cat.replace(" · STEREO", "");

  return (
    <div className="rs-sleeve">
      {/* key=封面地址：换档时封套重挂，封面 crossfade 260ms 才播得出来 */}
      <div className="rs-sleeve-box" key={url ?? "gen"}>
        {hasCover && track ? (
          <img
            className="home-cover"
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={onLoad}
            onError={() => setBroken(true)}
            style={trimCss}
          />
        ) : (
          <div className="rs-gen" aria-hidden="true">
            <NightCoverArt cat={genCat} />
            {track ? (
              <span className={`rs-gen-title${track.title.length > 20 ? " rs-gen-title-h" : ""}`}>
                {track.title}
              </span>
            ) : null}
            {track ? <span className="rs-gen-artist">{track.artist}</span> : null}
          </div>
        )}
        {hasCover ? <span className="rs-scrim" aria-hidden="true" /> : null}
        <span className="home-cat" aria-hidden="true">
          {cat}
        </span>
        <span className="home-seal" aria-hidden="true" data-lines={seal.length > 1 ? "2" : "1"}>
          {seal.map((line) => (
            <b key={line}>{line}</b>
          ))}
        </span>
      </div>
      <span className="home-stylus" data-lamp={chip} aria-hidden="true">
        <i className="rs-lamp" />
        <b>{chipText}</b>
      </span>
      <p className="rs-plate" aria-hidden="true">
        <span>
          <b>{stateName}</b> · {date}
        </span>
        <span>{total} TRACKS</span>
      </p>
    </div>
  );
}
