/* ---------- 线性图标：2px 圆角描边，全圆角端点 ---------- */
const Ic = ({ children, size = 20, sw = 1.8, fill = "none", vb = "0 0 24 24", ...rest }) => (
  <svg viewBox={vb} width={size} height={size} fill={fill} stroke="currentColor"
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true" {...rest}>{children}</svg>
);

const IconPlay = (p) => <Ic {...p}><path d="M8 5.6c0-1 1.1-1.6 1.9-1.1l9.3 6.4c.8.5.8 1.7 0 2.2l-9.3 6.4c-.8.5-1.9-.1-1.9-1.1z" fill="currentColor" stroke="none"/></Ic>;
const IconPause = (p) => <Ic {...p}><rect x="7.2" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" stroke="none"/><rect x="13.2" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" stroke="none"/></Ic>;
const IconPrev = (p) => <Ic {...p}><path d="M18 6.6v10.8c0 .9-1 1.4-1.7.9l-7-5.4a1.2 1.2 0 0 1 0-1.8l7-5.4c.7-.5 1.7 0 1.7.9z" fill="currentColor" stroke="none"/><rect x="5" y="5.6" width="2.2" height="12.8" rx="1.1" fill="currentColor" stroke="none"/></Ic>;
const IconNext = (p) => <Ic {...p}><path d="M6 6.6v10.8c0 .9 1 1.4 1.7.9l7-5.4a1.2 1.2 0 0 0 0-1.8l-7-5.4C7 5.2 6 5.7 6 6.6z" fill="currentColor" stroke="none"/><rect x="16.8" y="5.6" width="2.2" height="12.8" rx="1.1" fill="currentColor" stroke="none"/></Ic>;
const IconShuffle = (p) => <Ic {...p}><path d="M3 6.5h3.2c1.2 0 2.3.6 3 1.6l5.6 8.4c.7 1 1.8 1.6 3 1.6H21"/><path d="M3 17.8h3.2c1.2 0 2.3-.6 3-1.6l1.2-1.8"/><path d="M14.2 8.5l1-1.4c.7-1 1.8-1.6 3-1.6H21"/><path d="M18.4 3.4 21 6.5l-2.6 3.1"/><path d="M18.4 14.7 21 17.8l-2.6 3.1"/></Ic>;
const IconRepeat = (p) => <Ic {...p}><path d="M4 9.5V8a3 3 0 0 1 3-3h13"/><path d="M17.5 2l2.5 3-2.5 3"/><path d="M20 14.5V16a3 3 0 0 1-3 3H4"/><path d="M6.5 22 4 19l2.5-3"/></Ic>;
const IconRepeatOne = (p) => <Ic {...p}><path d="M4 9.5V8a3 3 0 0 1 3-3h13"/><path d="M17.5 2l2.5 3-2.5 3"/><path d="M20 14.5V16a3 3 0 0 1-3 3H4"/><path d="M6.5 22 4 19l2.5-3"/><path d="M11.2 10.6 12.6 10v4.4" strokeWidth="1.5"/></Ic>;
const IconSearch = (p) => <Ic {...p}><circle cx="11" cy="11" r="6.4"/><path d="M15.8 15.8 20.5 20.5"/></Ic>;
const IconQueue = (p) => <Ic {...p}><path d="M4 7h11"/><path d="M4 12h11"/><path d="M4 17h7"/><path d="M18.5 14.2v6.1"/><circle cx="16.4" cy="20" r="2"/></Ic>;
const IconBell = (p) => <Ic {...p}><path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.6 17.8c-.4.7.1 1.5.9 1.5h13c.8 0 1.3-.8.9-1.5z"/><path d="M10 21.5a2.2 2.2 0 0 0 4 0"/></Ic>;
const IconArchive = (p) => <Ic {...p}><rect x="3.5" y="5" width="17" height="4.2" rx="1.6"/><path d="M5 9.2v8.3A2 2 0 0 0 7 19.5h10a2 2 0 0 0 2-2V9.2"/><path d="M10 13h4"/></Ic>;
const IconCompass = (p) => <Ic {...p}><circle cx="12" cy="12" r="8.6"/><path d="M15.2 8.8l-1.7 4.7-4.7 1.7 1.7-4.7z"/></Ic>;
const IconSettings = (p) => <Ic {...p}><circle cx="12" cy="12" r="2.7"/><path d="M12 3.2v2.2M12 18.6v2.2M20.8 12h-2.2M5.4 12H3.2M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6M18.2 18.2l-1.6-1.6M7.4 7.4 5.8 5.8"/></Ic>;
const IconMoon = (p) => <Ic {...p}><path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z"/></Ic>;
const IconSun = (p) => <Ic {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6"/></Ic>;
const IconChevronUp = (p) => <Ic {...p}><path d="M6 14.5 12 8.5l6 6"/></Ic>;
const IconChevronRight = (p) => <Ic {...p}><path d="M9.5 5.5 16 12l-6.5 6.5"/></Ic>;
const IconChevronDown = (p) => <Ic {...p}><path d="M6 9.5 12 15.5l6-6"/></Ic>;
const IconX = (p) => <Ic {...p}><path d="M6 6l12 12M18 6L6 18"/></Ic>;
const IconBack = (p) => <Ic {...p}><path d="M14.5 5.5 8 12l6.5 6.5"/></Ic>;
const IconArrowRight = (p) => <Ic {...p}><path d="M4.5 12h15"/><path d="M14 6.5 20 12l-6 5.5"/></Ic>;
const IconCheck = (p) => <Ic {...p}><path d="M4.8 12.6 9.6 17.4 19.4 6.8"/></Ic>;
const IconPlus = (p) => <Ic {...p}><path d="M12 5.2v13.6M5.2 12h13.6"/></Ic>;
const IconVolume = (p) => <Ic {...p}><path d="M4 9.5h3l4.2-3.4v11.8L7 14.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a7.6 7.6 0 0 1 0 11"/></Ic>;
const IconSkip = (p) => <Ic {...p}><path d="M18 6.6v10.8c0 .9-1 1.4-1.7.9l-7-5.4a1.2 1.2 0 0 1 0-1.8l7-5.4c.7-.5 1.7 0 1.7.9z" fill="currentColor" stroke="none"/><rect x="5" y="5.6" width="2.2" height="12.8" rx="1.1" fill="currentColor" stroke="none"/></Ic>;
const IconNote = (p) => <Ic {...p}><path d="M9 17.5V6.2l9-2v11"/><circle cx="6.6" cy="18" r="2.5"/><circle cx="15.6" cy="15.6" r="2.5"/></Ic>;
const IconSparkle = (p) => <Ic {...p}><path d="M12 3.6l1.7 4.6 4.6 1.7-4.6 1.7L12 16.2l-1.7-4.6L5.7 9.9l4.6-1.7z"/><path d="M18.4 15.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></Ic>;

/* 拨片（品牌符号 / 收藏 / 印章） */
const IconPick = ({ size = 20, ...rest }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" {...rest}>
    <path d="M12 2.6c4 0 7.8 3.3 7.8 7.4 0 4.6-4.2 8.4-6.6 10.6-.7.6-1.7.6-2.4 0C8.4 18.4 4.2 14.6 4.2 10 4.2 5.9 8 2.6 12 2.6z"/>
  </svg>
);
const IconPickOutline = ({ size = 20, ...rest }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" {...rest}>
    <path d="M12 2.9c3.8 0 7.3 3.1 7.3 7 0 4.4-4 8-6.3 10.2-.6.6-1.5.6-2.1 0C8.6 17.9 4.6 14.3 4.6 9.9c0-3.9 3.5-7 7.4-7z"/>
  </svg>
);

/* 品牌 Logo：拨片 + 音符 */
const LogoMark = ({ size = 40, tone = "var(--pink-600)" }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
    <path d="M24 4.6c8 0 15.2 6.4 15.2 14.3 0 8.8-8.2 16.4-12.9 20.7-1.3 1.2-3.3 1.2-4.6 0C17 35.3 8.8 27.7 8.8 18.9 8.8 11 16 4.6 24 4.6z"
          fill={tone}/>
    <path d="M24 4.6c8 0 15.2 6.4 15.2 14.3 0 2.2-.5 4.3-1.5 6.2C33.9 18 29.4 12.7 24 4.6z"
          fill="#fff" opacity=".22"/>
    <g fill="var(--bg)" opacity=".95">
      <rect x="26.8" y="16" width="2.4" height="10.4" rx="1.2"/>
      <circle cx="24.2" cy="26.8" r="4.1"/>
      <rect x="28.6" y="13.6" width="5.6" height="2.6" rx="1.3" transform="rotate(12 31.4 14.9)"/>
    </g>
  </svg>
);

/* 吉他剪影（启动动画用） */
const GuitarFigure = ({ w = 116, h = 60, ...rest }) => (
  <svg viewBox="0 0 116 60" width={w} height={h} fill="currentColor" aria-hidden="true" {...rest}>
    <g>
      <circle cx="34" cy="34" r="16"/>
      <circle cx="19" cy="42" r="11"/>
      <rect x="44" y="28.6" width="58" height="6.6" rx="3.3" transform="rotate(-7 44 32)"/>
      <rect x="98" y="20" width="14" height="12" rx="3.4" transform="rotate(-7 105 26)"/>
    </g>
    <circle cx="33" cy="34" r="5.6" fill="var(--bg)"/>
    <rect x="53" y="30" width="3" height="3" rx="1.2" fill="var(--bg)" opacity=".8"/>
    <rect x="62" y="30" width="3" height="3" rx="1.2" fill="var(--bg)" opacity=".8"/>
  </svg>
);

/* Q 版抱琴小剪影（无五官） */
const Silhouette = ({ w = 78, h = 96, ...rest }) => (
  <svg viewBox="0 0 84 104" width={w} height={h} fill="currentColor" aria-hidden="true" {...rest}>
    <path d="M31 5c8.6 0 14.6 6.2 14.6 14.2S39.6 33 31 33s-14.4-5.8-14.4-13.8S22.4 5 31 5z"/>
    <path d="M15.6 9.4C19 3.6 26 1.2 32.4 2.4c6.4 1.2 11 6 12 12-6 1.8-11 .8-15-1.2-4.6-2.4-9.4-2.8-13.8-3.8z"/>
    <path d="M44.8 17.4c3.4 5.6 2.4 12-2 16.4-.9.9-.2 2.4 1 2.2 5.6-1.6 9-8 8-14.4z"/>
    <path d="M29.6 34c10.4 0 16.6 6.2 17.6 16.6l3.8 26.2c.9 6-3 10.6-9 10.6H16.8c-6 0-9.9-4.6-9-10.6l3.8-26.2C12.6 40.2 18.8 34 29.6 34z"/>
    <path d="M13.4 46.4c-4 6.6-5.8 14.4-4.8 22.2.2 3 2 4.6 4.2 4.4 2-.2 3.4-2 3.2-4.4-.8-7 .4-13 3.4-18.8z"/>
    <path d="M45 48.6c4 5.4 6 12.2 6 19.4 0 3 1.8 4.6 4 4.4 2-.2 3.2-2.2 3-4.4-.4-9-3.6-17-8.6-23.4z"/>
    <path d="M24.6 84.4 21 101.6h5.4l4-15z"/>
    <path d="M36.4 84.4 33 101.6h5.4l4-15z"/>
    <g>
      <ellipse cx="50" cy="72" rx="14.6" ry="11.4" transform="rotate(-20 50 72)"/>
      <rect x="55" y="38" width="4" height="32" rx="2" transform="rotate(22 57 54)"/>
    </g>
  </svg>
);

/* 舞台乐器剪影 */
const InstGuitar = ({ size = 84 }) => (
  <svg viewBox="0 0 60 112" width={size * .54} height={size} fill="currentColor" aria-hidden="true">
    <circle cx="26" cy="86" r="16"/><circle cx="15" cy="70" r="10"/>
    <rect x="26" y="14" width="7" height="60" rx="3.5" transform="rotate(-9 29 44)"/>
    <rect x="24" y="6" width="16" height="12" rx="4" transform="rotate(-9 32 12)"/>
    <circle cx="25" cy="86" r="4" fill="var(--card)" opacity=".55"/>
  </svg>
);
const InstBass = ({ size = 84 }) => (
  <svg viewBox="0 0 60 118" width={size * .54} height={size} fill="currentColor" aria-hidden="true">
    <circle cx="24" cy="94" r="14"/><circle cx="14" cy="80" r="8.6"/>
    <rect x="25" y="6" width="6.4" height="78" rx="3.2" transform="rotate(-7 28 45)"/>
    <rect x="22" y="0" width="15" height="11" rx="4" transform="rotate(-7 29 5)"/>
    <circle cx="23" cy="94" r="3.4" fill="var(--card)" opacity=".55"/>
  </svg>
);
const InstDrum = ({ size = 84 }) => (
  <svg viewBox="0 0 84 84" width={size} height={size} fill="currentColor" aria-hidden="true">
    <ellipse cx="26" cy="20" rx="21" ry="4.4" transform="rotate(-16 26 20)"/>
    <rect x="24" y="20" width="3" height="26" rx="1.5" transform="rotate(-4 25 33)"/>
    <ellipse cx="62" cy="16" rx="19" ry="4" transform="rotate(14 62 16)"/>
    <rect x="60" y="17" width="3" height="24" rx="1.5"/>
    <circle cx="40" cy="60" r="21"/>
    <circle cx="40" cy="60" r="15" fill="var(--card)" opacity=".28"/>
    <circle cx="40" cy="60" r="4" fill="var(--card)" opacity=".5"/>
  </svg>
);
const InstKeys = ({ size = 84 }) => (
  <svg viewBox="0 0 104 78" width={size * 1.24} height={size} fill="currentColor" aria-hidden="true">
    <rect x="4" y="30" width="96" height="14" rx="3"/>
    <rect x="8" y="44" width="88" height="18" rx="3" opacity=".92"/>
    <g fill="var(--card)" opacity=".5">
      <rect x="20" y="30" width="2" height="14"/><rect x="32" y="30" width="2" height="14"/>
      <rect x="44" y="30" width="2" height="14"/><rect x="58" y="30" width="2" height="14"/>
      <rect x="70" y="30" width="2" height="14"/><rect x="82" y="30" width="2" height="14"/>
    </g>
    <rect x="10" y="18" width="4" height="14" rx="2" transform="rotate(-14 12 25)"/>
    <rect x="90" y="18" width="4" height="14" rx="2" transform="rotate(14 92 25)"/>
  </svg>
);

Object.assign(window, {
  Ic, IconPlay, IconPause, IconPrev, IconNext, IconShuffle, IconRepeat, IconRepeatOne,
  IconSearch, IconQueue, IconBell, IconArchive, IconCompass, IconSettings, IconMoon, IconSun,
  IconChevronUp, IconChevronRight, IconChevronDown, IconX, IconBack, IconArrowRight, IconCheck,
  IconPlus, IconVolume, IconSkip, IconNote, IconSparkle, IconPick, IconPickOutline,
  LogoMark, GuitarFigure, Silhouette, InstGuitar, InstBass, InstDrum, InstKeys
});
