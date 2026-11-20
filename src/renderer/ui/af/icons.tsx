/* AFEIFEI 线性图标集 · 从 offline_single/js/icons.jsx + icons4.jsx 移植
   2px 圆角描边，全圆角端点；尺寸通过 size 传入。 */
import type { SVGProps } from "react";

type IcProps = SVGProps<SVGSVGElement> & {
  size?: number;
  sw?: number;
  vb?: string;
};

const Ic = ({ children, size = 20, sw = 1.8, fill = "none", vb = "0 0 24 24", ...rest }: IcProps) => (
  <svg
    viewBox={vb}
    width={size}
    height={size}
    fill={fill}
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const IconPlay = (p: IcProps) => (
  <Ic {...p}>
    <path d="M8 5.6c0-1 1.1-1.6 1.9-1.1l9.3 6.4c.8.5.8 1.7 0 2.2l-9.3 6.4c-.8.5-1.9-.1-1.9-1.1z" fill="currentColor" stroke="none" />
  </Ic>
);
export const IconPause = (p: IcProps) => (
  <Ic {...p}>
    <rect x="7.2" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" stroke="none" />
    <rect x="13.2" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" stroke="none" />
  </Ic>
);
export const IconPrev = (p: IcProps) => (
  <Ic {...p}>
    <path d="M18 6.6v10.8c0 .9-1 1.4-1.7.9l-7-5.4a1.2 1.2 0 0 1 0-1.8l7-5.4c.7-.5 1.7 0 1.7.9z" fill="currentColor" stroke="none" />
    <rect x="5" y="5.6" width="2.2" height="12.8" rx="1.1" fill="currentColor" stroke="none" />
  </Ic>
);
export const IconNext = (p: IcProps) => (
  <Ic {...p}>
    <path d="M6 6.6v10.8c0 .9 1 1.4 1.7.9l7-5.4a1.2 1.2 0 0 0 0-1.8l-7-5.4C7 5.2 6 5.7 6 6.6z" fill="currentColor" stroke="none" />
    <rect x="16.8" y="5.6" width="2.2" height="12.8" rx="1.1" fill="currentColor" stroke="none" />
  </Ic>
);
export const IconShuffle = (p: IcProps) => (
  <Ic {...p}>
    <path d="M3 6.5h3.2c1.2 0 2.3.6 3 1.6l5.6 8.4c.7 1 1.8 1.6 3 1.6H21" />
    <path d="M3 17.8h3.2c1.2 0 2.3-.6 3-1.6l1.2-1.8" />
    <path d="M14.2 8.5l1-1.4c.7-1 1.8-1.6 3-1.6H21" />
    <path d="M18.4 3.4 21 6.5l-2.6 3.1" />
    <path d="M18.4 14.7 21 17.8l-2.6 3.1" />
  </Ic>
);
export const IconRepeat = (p: IcProps) => (
  <Ic {...p}>
    <path d="M4 9.5V8a3 3 0 0 1 3-3h13" />
    <path d="M17.5 2l2.5 3-2.5 3" />
    <path d="M20 14.5V16a3 3 0 0 1-3 3H4" />
    <path d="M6.5 22 4 19l2.5-3" />
  </Ic>
);
export const IconRepeatOne = (p: IcProps) => (
  <Ic {...p}>
    <path d="M4 9.5V8a3 3 0 0 1 3-3h13" />
    <path d="M17.5 2l2.5 3-2.5 3" />
    <path d="M20 14.5V16a3 3 0 0 1-3 3H4" />
    <path d="M6.5 22 4 19l2.5-3" />
    <path d="M11.2 10.6 12.6 10v4.4" strokeWidth="1.5" />
  </Ic>
);
export const IconSearch = (p: IcProps) => (
  <Ic {...p}>
    <circle cx="11" cy="11" r="6.4" />
    <path d="M15.8 15.8 20.5 20.5" />
  </Ic>
);
export const IconQueue = (p: IcProps) => (
  <Ic {...p}>
    <path d="M4 7h11" />
    <path d="M4 12h11" />
    <path d="M4 17h7" />
    <path d="M18.5 14.2v6.1" />
    <circle cx="16.4" cy="20" r="2" />
  </Ic>
);
export const IconBell = (p: IcProps) => (
  <Ic {...p}>
    <path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.6 17.8c-.4.7.1 1.5.9 1.5h13c.8 0 1.3-.8.9-1.5z" />
    <path d="M10 21.5a2.2 2.2 0 0 0 4 0" />
  </Ic>
);
export const IconArchive = (p: IcProps) => (
  <Ic {...p}>
    <rect x="3.5" y="5" width="17" height="4.2" rx="1.6" />
    <path d="M5 9.2v8.3A2 2 0 0 0 7 19.5h10a2 2 0 0 0 2-2V9.2" />
    <path d="M10 13h4" />
  </Ic>
);
export const IconCompass = (p: IcProps) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M15.2 8.8l-1.7 4.7-4.7 1.7 1.7-4.7z" />
  </Ic>
);
export const IconSettings = (p: IcProps) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="2.7" />
    <path d="M12 3.2v2.2M12 18.6v2.2M20.8 12h-2.2M5.4 12H3.2M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6M18.2 18.2l-1.6-1.6M7.4 7.4 5.8 5.8" />
  </Ic>
);
export const IconMoon = (p: IcProps) => (
  <Ic {...p}>
    <path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z" />
  </Ic>
);
export const IconSun = (p: IcProps) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" />
  </Ic>
);
export const IconChevronUp = (p: IcProps) => (
  <Ic {...p}>
    <path d="M6 14.5 12 8.5l6 6" />
  </Ic>
);
export const IconChevronRight = (p: IcProps) => (
  <Ic {...p}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Ic>
);
export const IconChevronDown = (p: IcProps) => (
  <Ic {...p}>
    <path d="M6 9.5 12 15.5l6-6" />
  </Ic>
);
export const IconX = (p: IcProps) => (
  <Ic {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Ic>
);
export const IconBack = (p: IcProps) => (
  <Ic {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Ic>
);
export const IconArrowRight = (p: IcProps) => (
  <Ic {...p}>
    <path d="M4.5 12h15" />
    <path d="M14 6.5 20 12l-6 5.5" />
  </Ic>
);
export const IconCheck = (p: IcProps) => (
  <Ic {...p}>
    <path d="M4.8 12.6 9.6 17.4 19.4 6.8" />
  </Ic>
);
export const IconPlus = (p: IcProps) => (
  <Ic {...p}>
    <path d="M12 5.2v13.6M5.2 12h13.6" />
  </Ic>
);
export const IconVolume = (p: IcProps) => (
  <Ic {...p}>
    <path d="M4 9.5h3l4.2-3.4v11.8L7 14.5H4z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
    <path d="M18 6.5a7.6 7.6 0 0 1 0 11" />
  </Ic>
);
export const IconSkip = (p: IcProps) => (
  <Ic {...p}>
    <path d="M18 6.6v10.8c0 .9-1 1.4-1.7.9l-7-5.4a1.2 1.2 0 0 1 0-1.8l7-5.4c.7-.5 1.7 0 1.7.9z" fill="currentColor" stroke="none" />
    <rect x="5" y="5.6" width="2.2" height="12.8" rx="1.1" fill="currentColor" stroke="none" />
  </Ic>
);
export const IconNote = (p: IcProps) => (
  <Ic {...p}>
    <path d="M9 17.5V6.2l9-2v11" />
    <circle cx="6.6" cy="18" r="2.5" />
    <circle cx="15.6" cy="15.6" r="2.5" />
  </Ic>
);
export const IconSparkle = (p: IcProps) => (
  <Ic {...p}>
    <path d="M12 3.6l1.7 4.6 4.6 1.7-4.6 1.7L12 16.2l-1.7-4.6L5.7 9.9l4.6-1.7z" />
    <path d="M18.4 15.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </Ic>
);

/* 拨片（品牌符号 / 收藏 / 印章） */
export const IconPick = ({ size = 20, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" {...rest}>
    <path d="M12 2.6c4 0 7.8 3.3 7.8 7.4 0 4.6-4.2 8.4-6.6 10.6-.7.6-1.7.6-2.4 0C8.4 18.4 4.2 14.6 4.2 10 4.2 5.9 8 2.6 12 2.6z" />
  </svg>
);
export const IconPickOutline = ({ size = 20, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" {...rest}>
    <path d="M12 2.9c3.8 0 7.3 3.1 7.3 7 0 4.4-4 8-6.3 10.2-.6.6-1.5.6-2.1 0C8.6 17.9 4.6 14.3 4.6 9.9c0-3.9 3.5-7 7.4-7z" />
  </svg>
);

/* 品牌 Logo：拨片 + 音符 */
export const LogoMark = ({ size = 40, tone = "var(--pink-600)" }: { size?: number; tone?: string }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
    <path d="M24 4.6c8 0 15.2 6.4 15.2 14.3 0 8.8-8.2 16.4-12.9 20.7-1.3 1.2-3.3 1.2-4.6 0C17 35.3 8.8 27.7 8.8 18.9 8.8 11 16 4.6 24 4.6z" fill={tone} />
    <path d="M24 4.6c8 0 15.2 6.4 15.2 14.3 0 2.2-.5 4.3-1.5 6.2C33.9 18 29.4 12.7 24 4.6z" fill="var(--white)" opacity=".22" />
    <g fill="var(--bg)" opacity=".95">
      <rect x="26.8" y="16" width="2.4" height="10.4" rx="1.2" />
      <circle cx="24.2" cy="26.8" r="4.1" />
      <rect x="28.6" y="13.6" width="5.6" height="2.6" rx="1.3" transform="rotate(12 31.4 14.9)" />
    </g>
  </svg>
);

/* 吉他剪影（启动动画用） */
export const GuitarFigure = ({ w = 132, h = 68, ...rest }: SVGProps<SVGSVGElement> & { w?: number; h?: number }) => (
  <svg viewBox="0 0 140 72" width={w} height={h} fill="currentColor" aria-hidden="true" {...rest}>
    {/* 琴身是单条路径（真正的凹腰轮廓），琴颈/琴头同组一起转，永不散架 */}
    <g transform="rotate(-6 60 36)">
      <path d="M 71 33 C 69 24, 60 19, 54 19.5 C 49 20, 46.5 22, 44.5 23.5 C 41.5 19.5, 35 16, 27.5 16.5 C 16.5 17, 8.5 25, 9 36 C 9.5 47, 17.5 55, 27.5 55.5 C 35 56, 41.5 52.5, 44.5 48.5 C 46.5 50, 49 52, 54 52.5 C 60 53, 69 48, 71 39 Z" />
      <rect x="68" y="33" width="46" height="6" rx="2.5" />
      <rect x="112" y="28.5" width="17" height="15" rx="3.5" />
      <rect x="115.5" y="31.5" width="2.6" height="2.6" rx="1.3" fill="var(--bg)" opacity=".85" />
      <rect x="120.5" y="31.5" width="2.6" height="2.6" rx="1.3" fill="var(--bg)" opacity=".85" />
      <rect x="76" y="35" width="3" height="2.4" rx="1.2" fill="var(--bg)" opacity=".8" />
      <rect x="85" y="35" width="3" height="2.4" rx="1.2" fill="var(--bg)" opacity=".8" />
      <rect x="94" y="35" width="3" height="2.4" rx="1.2" fill="var(--bg)" opacity=".8" />
    </g>
    <circle cx="29" cy="36" r="6.5" fill="var(--bg)" />
    <rect x="41" y="34.6" width="4" height="2.8" rx="1.2" fill="var(--bg)" opacity=".9" />
  </svg>
);

/* Q 版抱琴小剪影（无五官）。
   pose：idle=抱琴站立（启动页）；wave=举起一只手挥别（E13/E20 背影离开）；
   peek=整体前倾 + 扶边张望（E27 断网恢复探头）。 */
export const Silhouette = ({ w = 78, h = 96, pose = "idle", ...rest }: SVGProps<SVGSVGElement> & { w?: number; h?: number; pose?: "idle" | "wave" | "peek" }) => (
  <svg viewBox="0 0 84 104" width={w} height={h} fill="currentColor" aria-hidden="true" {...rest}>
    <g transform={pose === "peek" ? "rotate(-12 30 102)" : undefined}>
      <path d="M31 5c8.6 0 14.6 6.2 14.6 14.2S39.6 33 31 33s-14.4-5.8-14.4-13.8S22.4 5 31 5z" />
      <path d="M15.6 9.4C19 3.6 26 1.2 32.4 2.4c6.4 1.2 11 6 12 12-6 1.8-11 .8-15-1.2-4.6-2.4-9.4-2.8-13.8-3.8z" />
      <path d="M44.8 17.4c3.4 5.6 2.4 12-2 16.4-.9.9-.2 2.4 1 2.2 5.6-1.6 9-8 8-14.4z" />
      <path d="M29.6 34c10.4 0 16.6 6.2 17.6 16.6l3.8 26.2c.9 6-3 10.6-9 10.6H16.8c-6 0-9.9-4.6-9-10.6l3.8-26.2C12.6 40.2 18.8 34 29.6 34z" />
      <path d="M13.4 46.4c-4 6.6-5.8 14.4-4.8 22.2.2 3 2 4.6 4.2 4.4 2-.2 3.4-2 3.2-4.4-.8-7 .4-13 3.4-18.8z" />
      {pose === "idle" && <path d="M45 48.6c4 5.4 6 12.2 6 19.4 0 3 1.8 4.6 4 4.4 2-.2 3.2-2.2 3-4.4-.4-9-3.6-17-8.6-23.4z" />}
      {(pose === "wave" || pose === "peek") && (
        /* 举起的手臂：胶囊 + 手掌，wave 时由 eggs.css 绕肩摆动 */
        <g className={pose === "wave" ? "af-wave-arm" : undefined}>
          <rect x="43" y="22" width="6.4" height="28" rx="3.2" transform="rotate(16 46 50)" />
          <circle cx="56" cy="23.5" r="4" />
        </g>
      )}
      <path d="M24.6 84.4 21 101.6h5.4l4-15z" />
      <path d="M36.4 84.4 33 101.6h5.4l4-15z" />
      <g>
        <ellipse cx="50" cy="72" rx="14.6" ry="11.4" transform="rotate(-20 50 72)" />
        <rect x="55" y="38" width="4" height="32" rx="2" transform="rotate(22 57 54)" />
      </g>
    </g>
  </svg>
);

/* 舞台乐器剪影 */
export const InstGuitar = ({ size = 84 }: { size?: number }) => (
  <svg viewBox="0 0 60 112" width={size * 0.54} height={size} fill="currentColor" aria-hidden="true">
    <circle cx="26" cy="86" r="16" /><circle cx="15" cy="70" r="10" />
    <rect x="26" y="14" width="7" height="60" rx="3.5" transform="rotate(-9 29 44)" />
    <rect x="24" y="6" width="16" height="12" rx="4" transform="rotate(-9 32 12)" />
    <circle cx="25" cy="86" r="4" fill="var(--card)" opacity=".55" />
  </svg>
);
export const InstBass = ({ size = 84 }: { size?: number }) => (
  <svg viewBox="0 0 60 118" width={size * 0.54} height={size} fill="currentColor" aria-hidden="true">
    <circle cx="24" cy="94" r="14" /><circle cx="14" cy="80" r="8.6" />
    <rect x="25" y="6" width="6.4" height="78" rx="3.2" transform="rotate(-7 28 45)" />
    <rect x="22" y="0" width="15" height="11" rx="4" transform="rotate(-7 29 5)" />
    <circle cx="23" cy="94" r="3.4" fill="var(--card)" opacity=".55" />
  </svg>
);
export const InstDrum = ({ size = 84 }: { size?: number }) => (
  <svg viewBox="0 0 84 84" width={size} height={size} fill="currentColor" aria-hidden="true">
    <ellipse cx="26" cy="20" rx="21" ry="4.4" transform="rotate(-16 26 20)" />
    <rect x="24" y="20" width="3" height="26" rx="1.5" transform="rotate(-4 25 33)" />
    <ellipse cx="62" cy="16" rx="19" ry="4" transform="rotate(14 62 16)" />
    <rect x="60" y="17" width="3" height="24" rx="1.5" />
    <circle cx="40" cy="60" r="21" />
    <circle cx="40" cy="60" r="15" fill="var(--card)" opacity=".28" />
    <circle cx="40" cy="60" r="4" fill="var(--card)" opacity=".5" />
  </svg>
);
export const InstKeys = ({ size = 84 }: { size?: number }) => (
  <svg viewBox="0 0 104 78" width={size * 1.24} height={size} fill="currentColor" aria-hidden="true">
    <rect x="4" y="30" width="96" height="14" rx="3" />
    <rect x="8" y="44" width="88" height="18" rx="3" opacity=".92" />
    <g fill="var(--card)" opacity=".5">
      <rect x="20" y="30" width="2" height="14" /><rect x="32" y="30" width="2" height="14" />
      <rect x="44" y="30" width="2" height="14" /><rect x="58" y="30" width="2" height="14" />
      <rect x="70" y="30" width="2" height="14" /><rect x="82" y="30" width="2" height="14" />
    </g>
    <rect x="10" y="18" width="4" height="14" rx="2" transform="rotate(-14 12 25)" />
    <rect x="90" y="18" width="4" height="14" rx="2" transform="rotate(14 92 25)" />
  </svg>
);

/* v4 追加图标 */
export const IconHeart = (p: IcProps) => (
  <Ic {...p}><path d="M12 20.4s-7.2-4.4-7.2-9.1a4.2 4.2 0 0 1 7.2-3 4.2 4.2 0 0 1 7.2 3c0 4.7-7.2 9.1-7.2 9.1z" /></Ic>
);
export const IconHeartFill = (p: IcProps) => (
  <Ic {...p}><path d="M12 20.4s-7.2-4.4-7.2-9.1a4.2 4.2 0 0 1 7.2-3 4.2 4.2 0 0 1 7.2 3c0 4.7-7.2 9.1-7.2 9.1z" fill="currentColor" stroke="none" /></Ic>
);
export const IconFolder = (p: IcProps) => (
  <Ic {...p}><path d="M3.6 7.4c0-1.1.9-2 2-2h3.5l2 2.4h7.3c1.1 0 2 .9 2 2v7.8c0 1.1-.9 2-2 2H5.6c-1.1 0-2-.9-2-2z" /></Ic>
);
export const IconDownload = (p: IcProps) => (
  <Ic {...p}><path d="M12 4v10.4" /><path d="M8 11.2 12 15.2l4-4" /><path d="M4.6 17.4v1.2c0 1 .8 1.8 1.8 1.8h11.2c1 0 1.8-.8 1.8-1.8v-1.2" /></Ic>
);
export const IconList = (p: IcProps) => (
  <Ic {...p}><path d="M4 6.4h2.2M4 12h2.2M4 17.6h2.2" /><path d="M9.4 6.4H20M9.4 12H20M9.4 17.6H20" /></Ic>
);
export const IconRefresh = (p: IcProps) => (
  <Ic {...p}><path d="M20 11.4A8 8 0 0 0 6.3 6.6L4 8.8" /><path d="M4 4.6v4.2h4.2" /><path d="M4 12.6a8 8 0 0 0 13.7 4.8L20 15.2" /><path d="M20 19.4v-4.2h-4.2" /></Ic>
);
export const IconSwap = (p: IcProps) => (
  <Ic {...p}><path d="M4 8h13" /><path d="M14 4.5 17.5 8 14 11.5" /><path d="M20 16H7" /><path d="M10 12.5 6.5 16 10 19.5" /></Ic>
);
export const IconImport = (p: IcProps) => (
  <Ic {...p}><path d="M12 15.4V4.6" /><path d="M8 8.6 12 4.6l4 4" /><path d="M4.6 14.4v4.2c0 1 .8 1.8 1.8 1.8h11.2c1 0 1.8-.8 1.8-1.8v-4.2" /></Ic>
);
export const IconMore = (p: IcProps) => (
  <Ic {...p}><circle cx="5.4" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="18.6" cy="12" r="1.5" fill="currentColor" stroke="none" /></Ic>
);
export const IconMin = (p: IcProps) => (
  <Ic {...p}><path d="M5 12h14" /></Ic>
);
export const IconMini = (p: IcProps) => (
  <Ic {...p}>
    <rect x="4" y="5" width="16" height="14" rx="2.4" />
    <rect x="12.4" y="12.4" width="6" height="5" rx="1.2" fill="currentColor" stroke="none" />
  </Ic>
);
export const IconShare = (p: IcProps) => (
  <Ic {...p}>
    <rect x="4" y="6" width="16" height="12.4" rx="2.2" />
    <path d="M7.6 14.6l3.2-3.4 2.4 2.4 3.4-3.8" />
  </Ic>
);
export const IconKeys = (p: IcProps) => (
  <Ic {...p}>
    <rect x="3.6" y="7" width="16.8" height="10" rx="2" />
    <path d="M7 10.4h.01M10.4 10.4h.01M13.8 10.4h.01M17 10.4h.01M8.4 13.8h7.2" />
  </Ic>
);
export const IconRestore = (p: IcProps) => (
  <Ic {...p} vb="0 0 12 12" sw={1.2}>
    <rect x="3.6" y="1.6" width="6.8" height="6.8" rx="1" />
    <path d="M1.6 3.6v5.8a1 1 0 0 0 1 1h5.8" />
  </Ic>
);
export const IconExpand = (p: IcProps) => (
  <Ic {...p}>
    <path d="M9.4 4H4v5.4M14.6 4H20v5.4M14.6 20H20v-5.4M9.4 20H4v-5.4" />
  </Ic>
);
export const IconMax = (p: IcProps) => (
  <Ic {...p}><rect x="5.4" y="5.4" width="13.2" height="13.2" rx="1.6" /></Ic>
);
export const IconDisc = (p: IcProps) => (
  <Ic {...p}><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="2.2" /></Ic>
);
export const IconUser = (p: IcProps) => (
  <Ic {...p}><circle cx="12" cy="8.6" r="3.8" /><path d="M4.8 20c.6-3.6 3.6-5.8 7.2-5.8s6.6 2.2 7.2 5.8" /></Ic>
);
export const IconCloud = (p: IcProps) => (
  <Ic {...p}><path d="M7.4 18.4h9.3a3.9 3.9 0 0 0 .4-7.8 5.5 5.5 0 0 0-10.5-1 4.4 4.4 0 0 0 .8 8.8z" /></Ic>
);
export const IconQR = (p: IcProps) => (
  <Ic {...p}><rect x="4" y="4" width="6.4" height="6.4" rx="1.4" /><rect x="13.6" y="4" width="6.4" height="6.4" rx="1.4" /><rect x="4" y="13.6" width="6.4" height="6.4" rx="1.4" /><path d="M13.6 13.6h2.8v2.8h-2.8zM17.2 17.2h2.8v2.8h-2.8z" /></Ic>
);
export const IconLogout = (p: IcProps) => (
  <Ic {...p}><path d="M14.4 4.6H6.4c-1 0-1.8.8-1.8 1.8v11.2c0 1 .8 1.8 1.8 1.8h8" /><path d="M17.4 8.6 20.8 12l-3.4 3.4" /><path d="M10.6 12h10" /></Ic>
);
