/* ============================================================
   AFEIFEI · 二次元表现层 v3.3
   拟声词 / 集中线 / 吉祥物 / 唱片封面程序化插画 / 歌词字幕
   ============================================================ */

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------- 程序化扁平封面插画 ---------- */
const ART_BG = [
  ["#FFE3EC", "#FFC2D6", "#D9CDF6"],
  ["#E6F0FF", "#C9DDF7", "#BFE8E0"],
  ["#FFF3D6", "#FFD9A8", "#F7C7D8"],
  ["#EBE3FF", "#CDBFF2", "#FFD3E2"],
  ["#E2F6EF", "#BFE9DB", "#CFE0FA"]
];

const ART_MOTIF = {
  guitar: (
    <g>
      <path d="M11.6 21.4c0-3.1 2.2-5.4 5.1-5.4 1.7 0 3.2.8 4.1 2.1l8.4-8.4 1.9 1.9-8.4 8.4c.3.9.5 1.8.5 2.8 0 3.1-2.3 5.4-5.2 5.4s-6.4-3.7-6.4-6.8z" />
      <rect x="27.4" y="6.2" width="4.6" height="3" rx="1.2" transform="rotate(45 29.7 7.7)" />
    </g>
  ),
  pick: (
    <path d="M20 8.5c5 0 9 4.2 9 9.2 0 5.5-5.1 10-8 12.2-.6.4-1.4.4-2 0-2.9-2.2-8-6.7-8-12.2 0-5 4-9.2 9-9.2z" />
  ),
  star: (
    <path d="M20 7l3.6 7.6 8.4 1-6.2 5.8 1.6 8.3L20 25.8l-7.4 3.9 1.6-8.3L8 15.6l8.4-1z" />
  ),
  note: (
    <g>
      <rect x="21.5" y="7" width="2.4" height="18" rx="1.2" />
      <path d="M23.9 7.4l8.2-2.6v4.4l-8.2 2.6z" />
      <ellipse cx="17.6" cy="25.4" rx="4.6" ry="3.5" transform="rotate(-18 17.6 25.4)" />
    </g>
  ),
  tape: (
    <g>
      <rect x="6" y="14" width="28" height="10" rx="2" />
      <rect x="6" y="16.4" width="28" height="1.4" opacity=".45" />
      <rect x="6" y="20.4" width="28" height="1.4" opacity=".45" />
    </g>
  )
};

const ART_KEYS = ["guitar", "pick", "star", "note", "tape"];

const TrackArt = ({ id, size = 40, radius = 6, className = "" }) => {
  const h = hashStr(id || "x");
  const bg = ART_BG[h % ART_BG.length];
  const gid = "ag" + (h % 9973);
  /* 注意：h 是 uint32，必须用无符号右移，否则取模为负、图案整块丢失 */
  const a = ART_KEYS[(h >>> 3) % 5];
  const b = ART_KEYS[(h >>> 7) % 5];
  const rot = ((h >> 5) % 40) - 20;
  return (
    <svg className={"trk-art " + className} width={size} height={size} viewBox="0 0 40 40"
      style={{ borderRadius: radius }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bg[0]} />
          <stop offset="58%" stopColor={bg[1]} />
          <stop offset="100%" stopColor={bg[2]} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" fill={"url(#" + gid + ")"} />
      <g transform={"translate(20 20) rotate(" + rot + ") scale(.92) translate(-20 -20)"} fill="#3D2B39" opacity=".58">
        {ART_MOTIF[a]}
      </g>
      <g transform={"translate(9 26) scale(.34)"} fill="#3D2B39" opacity=".34">
        {ART_MOTIF[b]}
      </g>
      <circle cx="33" cy="9" r="3.4" fill="#fff" opacity=".5" />
    </svg>
  );
};

/* ---------- 拟声词层 ---------- */
const OnomaLayer = ({ items }) => (
  <div className="onoma-layer" aria-hidden="true">
    {items.map(o => (
      <span key={o.id} className={"onoma onoma--" + o.tone}
        style={{ left: o.x + "px", top: o.y + "px", "--rot": o.rot + "deg" }}>{o.text}</span>
    ))}
  </div>
);

/* ---------- 集中线 ---------- */
const FocusLines = () => <div className="focus-lines" aria-hidden="true"></div>;

/* ---------- E17 抱琴小剪影 ---------- */
const MascotWalk = ({ onEnd, cover }) => {
  React.useEffect(() => {
    const t = setTimeout(onEnd, 9000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="mascot" aria-hidden="true">
      <div className="mascot__fig" title="好像有人路过">
        <svg viewBox="0 0 130 132" width="130" height="132">
          <ellipse className="mascot__shadow" cx="64" cy="124" rx="30" ry="5" />
          <g className="mascot__legs">
            <rect className="mascot__leg mascot__leg--a" x="54" y="96" width="7" height="24" rx="3.5" />
            <rect className="mascot__leg mascot__leg--b" x="66" y="96" width="7" height="24" rx="3.5" />
          </g>
          <path className="mascot__body" d="M48 76c0-8 7-14 16-14s16 6 16 14v16c0 6-5 10-11 10H59c-6 0-11-4-11-10z" />
          <g className="mascot__arm">
            <rect x="41" y="80" width="6" height="20" rx="3" transform="rotate(14 44 90)" />
          </g>
          <g className="mascot__head">
            <circle cx="65" cy="46" r="19" />
            <path d="M46 43c1-11 9-18 19-18s18 7 19 18c-4-4-9-6-14-6-6 0-10 2-14 6-3 3-6 4-10 3z" />
            <path d="M47 40c-4 1-7 6-8 12 3 1 6 0 8-2z" />
          </g>
          <g className="mascot__guitar">
            <path d="M92 62c7 0 12 5 12 11s-5 11-12 11-12-5-12-11 5-11 12-11z" />
            <rect x="96" y="34" width="5" height="30" rx="2.5" transform="rotate(17 98 49)" />
            <rect x="100" y="28" width="9" height="7" rx="2" transform="rotate(17 104 31)" />
          </g>
        </svg>
      </div>
      <span className="mascot__tag hand">…路过</span>
    </div>
  );
};

/* ---------- 歌词（原创占位 · 虚构演示） ---------- */
const LYRIC_SETS = [
  [
    "副歌还没写，先哼着吧",
    "和弦绕了三圈才敢落下",
    "第三排有人跟着打拍子",
    "麦克风把我的呼吸也收进去",
    "散场以后再算今天的账"
  ],
  [
    "雨点比鼓点快了半拍",
    "拨片掉进音箱缝里没找到",
    "走廊尽头的和声还亮着",
    "先把这一段唱完再说",
    "便利店的门铃替我数拍"
  ],
  [
    "排练室的灯熄了第三次",
    "台词写到一半又划掉",
    "台下没有人也照常开场",
    "反正明天还要再来一趟",
    "这一小节先空着吧"
  ],
  [
    "自动贩卖机亮着不肯睡",
    "河堤的风把和弦吹散",
    "没写完的那句留给今晚",
    "灯灭之前再说一次",
    "安可之后记得关灯"
  ]
];

/* 逐行翻译（虚构演示，与 LYRIC_SETS 同序） */
const LYRIC_EN = [
  [
    "Chorus isn't written yet — humming it first",
    "The chord circled three times before it landed",
    "Someone in the third row keeps the beat",
    "The mic picks up my breathing too",
    "We'll settle today's tab after the lights"
  ],
  [
    "The rain runs half a beat ahead of the drums",
    "A pick slipped into the amp and never came back",
    "The harmony at the end of the hall is still lit",
    "Let's finish this section first",
    "The convenience-store chime counts for me"
  ],
  [
    "The practice-room lights went out a third time",
    "Half a line written, then crossed out",
    "No one in the seats, we open anyway",
    "We'll be back tomorrow regardless",
    "Leave this bar empty for now"
  ],
  [
    "The vending machine stays lit, refusing sleep",
    "The river wind scatters the chords",
    "The unfinished line is saved for tonight",
    "Say it once more before the lights die",
    "Remember to turn off after the encore"
  ]
];

function lyricsFor(track) {
  return LYRIC_SETS[hashStr(track.title + track.band) % LYRIC_SETS.length];
}

function lyricEnFor(track) {
  return LYRIC_EN[hashStr(track.title + track.band) % LYRIC_EN.length];
}

Object.assign(window, { hashStr, TrackArt, OnomaLayer, FocusLines, MascotWalk, lyricsFor, lyricEnFor });
