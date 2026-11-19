/* 主题包文案库（copy-set）· MAIGO 先行落地
 *
 * 约定（方案见 Design Files anime-theme-packs.html §05）：
 *  - key 全局唯一，值随 <html data-palette> 切换；key 不变、值随包换。
 *  - 未落包的 key 一律回落基座文案（BELLE 粉色场刊），所以调用方只管传 key。
 *  - 37 个槽位分期接线：已落漫游轮换、我喜欢空态、红心 toast，以及 E18–E22 行为彩蛋五处。
 */

interface PackCopy {
  roam: readonly string[];
  likedEmpty: { title: string; sub: string; cta: string };
  likeToast(added: boolean): string;
  /** E18 音量拉满（egg.volumeMax）——递进池：第 n 次触发取第 n 句，超出就停在最后一句 */
  volMax: string[];
  /** E19 长按红心火焰（egg.longPressLike） */
  longPressLike: string[];
  /** E20 60 秒内连跳 3 首 */
  lostSkip: string[];
  /** E21 在线曲目播放失败 */
  goneSong: string[];
  /** E22 断网瞬间（error.network） */
  offlineNet: string[];
  /** E27 断网恢复：从墙角探个头 */
  netBack: string[];
  /* ---- 空态（A 区） ---- */
  emptyLibrary: string;
  emptySearch: string;
  emptyDownloads: string;
  historyEmpty: { title: string; sub: string };
  playlistsEmpty: string;
  emptyLoggedOut: string;
  /* ---- 引导 / 确认（B/E 区） ---- */
  guide: string;
  confirmClear: string;
  confirmDelete(name: string): string;
  /* ---- 操作 toast（D 区） ---- */
  enqueue: string;
  quality(label: string): string;
  pack(label: string): string;
  /* ---- 氛围彩蛋（F 区余量） ---- */
  lateNight: string;
  /** 点歌分享卡右下角的手写落款 */
  shareNote: string;
  repeatThree(n: number): string;
  sameArtist(n: number): string;
  /* ---- 服务层字符串的包文案对应（svcText 收敛翻译用） ---- */
  downloadStart: string;
  downloadFail: string;
  noLyric: string;
  sourceDown: string;
  sessionExpired: string;
  queueEmpty: string;
  loadingSkeleton: string;
  loadingScan: string;
  loadingDaily: string;
}

/** 基座文案（现行粉色场刊），也是未解锁包的回落值。 */
const BELLE: PackCopy = {
  roam: ["还在找今晚的那首歌？♡", "不知道听什么的话，就让它自己走。", "切歌也算一种走路方式。"],
  likedEmpty: {
    title: "还没有留下印记的歌。",
    sub: "听到喜欢的那首，点一下红心，它就住在这儿了。",
    cta: "去发现找一首",
  },
  likeToast: (added: boolean): string => (added ? "已加入账号红心" : "已从账号红心移除"),
  volMax: ["音量拉满了，耳朵是你自己的。", "又拉满了？行吧。", "……已经不想管你了。"],
  longPressLike: ["按住了——这份喜欢记两遍。", "又按住了，是很喜欢吧。", "手不酸吗？喜欢收到了。"],
  lostSkip: ["连跳三首，今晚还没遇到那首？", "还在找？慢慢来。", "今晚的月亮也没等到吗……"],
  goneSong: ["这首歌放不出来了，换下一首吧。", "又一首不见了……", "今晚的歌单有点善变。"],
  offlineNet: ["断网了。先听本地吧。", "还是断着呢。", "不急，网会回来的。"],
  netBack: ["网回来了。接着放。", "网络回来了，曲子也回来了。"],
  emptyLibrary: "曲库还是空的。点上面的「扫描本地文件夹」把硬盘里的音乐收进来。",
  emptySearch: "这家 live house 没找到这首曲子。",
  emptyDownloads: "还没有下完的歌。下载完成后会落在这里。",
  historyEmpty: { title: "还没有人开过口。", sub: "从发现页随便点一首，这里就开始记账了。" },
  playlistsEmpty: "还没有自己建的歌单。",
  emptyLoggedOut: "没登录也能逛，只是没有歌单数据。",
  guide: "幕布拉开了，今晚的自助。",
  confirmClear: "再点一次，就把记录全擦掉了。",
  confirmDelete: (name: string): string => `再点一次，「${name}」就删掉了。`,
  enqueue: "排进下一首了。",
  quality: (label: string): string => `音质切到「${label}」了。`,
  pack: (label: string): string => `主题切到「${label}」。`,
  lateNight: "还没睡？给耳朵放个假吧。",
  shareNote: "今晚也想把这首递给你。",
  repeatThree: (n: number): string => `这首已经放第 ${n} 遍了。`,
  sameArtist: (n: number): string => `连着听了 ${n} 首这位艺人。`,
  downloadStart: "已加入下载队列。",
  downloadFail: "下载失败了，再试一次吧。",
  noLyric: "没找到这首的歌词。",
  sourceDown: "这个音源暂时不可用，切一个试试。",
  sessionExpired: "登录过期了，重新登录吧。",
  queueEmpty: "把第一首丢进队列。",
  loadingSkeleton: "在翻曲库……",
  loadingScan: "正在数文件夹里的音轨……",
  loadingDaily: "正在备今天的单子…",
} as const;

/** MAIGO「迷子 · 雨夜」：温柔、迷路、慢半拍。 */
const MAIGO: PackCopy = {
  roam: ["不知道听什么，就先走走看。", "走错路也是一种风景。", "迷路的时候，跟着风走。"],
  likedEmpty: {
    title: "还没有记在诗里的歌。",
    sub: "遇到喜欢的那首，就把它留下来吧。",
    cta: "去慢慢找一首",
  },
  likeToast: (added: boolean): string => (added ? "记在诗里了" : "轻轻拿出来了"),
  volMax: ["小声点，会吵到邻居的。", "又说过了呢……", "耳朵：已经麻了。"],
  longPressLike: ["用力记下来了。", "记了两遍，就不会忘了吧。", "这份喜欢，收好了。"],
  lostSkip: ["又迷路了吗？没关系，慢慢找。", "还在迷路……要停下来歇会儿吗？", "找不到也没关系的。"],
  goneSong: ["这首歌…走丢了。换条路吧。", "又走散了一个……", "没关系，歌还会再遇上的。"],
  offlineNet: ["雨太大了，没连上。等会儿再试试？", "雨还没停呢……", "就在这里躲会儿雨吧。"],
  netBack: ["雨停了。路又通了。", "信号回来了……那就，继续走吧。"],
  emptyLibrary: "还没有歌。要不，先从一张喜欢的专辑开始？",
  emptySearch: "没找到呢…换个说法试试？",
  emptyDownloads: "还没有带回来的东西。",
  historyEmpty: { title: "还没有走过的路。", sub: "第一首，从哪开始都行。去发现页走走？" },
  playlistsEmpty: "还没有整理好的心事。可以从一个名字开始。",
  emptyLoggedOut: "这扇门还没开。登录之后会更热闹一点。",
  guide: "第一次见面。慢慢来，我带你逛逛。",
  confirmClear: "要把走过的路都擦掉吗？擦掉就记不回来了。",
  confirmDelete: (_name: string): string => "把这本册子收起来？里面的歌还在曲库里。",
  enqueue: "排进接下来的路了。",
  quality: (_label: string): string => "现在的声音更清楚一点了。",
  pack: (_label: string): string => "灯光换了一种。",
  lateNight: "这个点还醒着…听点安静的。",
  shareNote: "这首歌…想交给谁呢。",
  repeatThree: (n: number): string => `又要演奏一遍吗？…好呀，第 ${n} 遍了。`,
  sameArtist: (_n: number): string => "你和 TA 很合拍呢。",
  downloadStart: "出发去取了。",
  downloadFail: "没能带回来。要不再试一次？",
  noLyric: "没找到对应的台词本。就纯听吧。",
  sourceDown: "这条路走不通，绕一条吧。",
  sessionExpired: "车票过期了。重新签到吧。",
  queueEmpty: "接下来还没有目的地。随便选一条路吧。",
  loadingSkeleton: "马上就好…再等一下下。",
  loadingScan: "正在翻你的抽屉。",
  loadingDaily: "今天的路，正在铺。",
} as const;

/** RAW「无滤镜」（GBC 气质）：短句、命令式、不卖萌。 */
const RAW: PackCopy = {
  roam: ["没想法就让它自己走。", "跳歌不丢人。", "想听什么直说，不然我决定。"],
  likedEmpty: {
    title: "还没记下任何一首。",
    sub: "听到好的就按，别犹豫。",
    cta: "去挖点真的",
  },
  likeToast: (added: boolean): string => (added ? "记下了" : "删了"),
  volMax: ["耳朵是你的。", "又拉满了。行。", "聋了别怪我。"],
  longPressLike: ["长按也算收藏。", "记第二次了。", "是粉丝行为。认证了。"],
  lostSkip: ["连跳三首。有目标吗。", "还在跳。没有吧。", "找到想说的话了吗。"],
  goneSong: ["这首没了。下一首。", "又没了一首。", "音源比观众还不稳定。"],
  offlineNet: ["网络烂了。重试。", "还连不上。", "没网也能唱。清唱。"],
  netBack: ["连上了。继续。", "恢复。刚才断得莫名其妙。"],
  emptyLibrary: "一首都没有。先扔几张专辑进来。",
  emptySearch: "没有。换个词再搜。",
  emptyDownloads: "没有下载任务。",
  historyEmpty: { title: "还没放过。", sub: "放一首就有记录了。去发现页点一首。" },
  playlistsEmpty: "没有歌单。建一个。",
  emptyLoggedOut: "未登录。歌单和推荐要登录才有。",
  guide: "这是 AFEIFEI。先扫本地，或登录拉云端。",
  confirmClear: "清空全部记录？不后悔就点。",
  confirmDelete: (name: string): string => `删歌单「${name}」？里面的歌不删。`,
  enqueue: "排上了。",
  quality: (label: string): string => `音质切到 ${label}。`,
  pack: (label: string): string => `主题切到 ${label}。`,
  lateNight: "还没睡？音量自觉。",
  shareNote: "拿去。别弄丢了。",
  repeatThree: (n: number): string => `这首播了 ${n} 遍。真喜欢还是懒得切。`,
  sameArtist: (n: number): string => `连着听了 ${n} 首这个艺人。`,
  downloadStart: "开始下。",
  downloadFail: "下载失败。重试或换档。",
  noLyric: "没有歌词。自己听。",
  sourceDown: "这个源挂了。切一个。",
  sessionExpired: "登录过期。重新登。",
  queueEmpty: "队列空的。点歌。",
  loadingSkeleton: "载入中，别催。",
  loadingScan: "正在扫文件夹。",
  loadingDaily: "正在翻今天的单子。",
} as const;

/** KADO「墙角英雄」（孤独摇滚气质）：社恐独白，感叹号只给成功反馈。 */
const KADO: PackCopy = {
  roam: ["不知道听什么的话…交给它吧。", "切歌也算一种说话方式。", "墙角视角，别有一番风景。"],
  likedEmpty: {
    title: "这里还空着…",
    sub: "等一首值得按下去的歌。",
    cta: "先去转转",
  },
  likeToast: (added: boolean): string => (added ? "收、收到了！放进最喜欢里了。" : "从最喜欢里…放回去了。"),
  volMax: ["今天豁出去了！！", "又、又拉满了…！", "震得墙角都在响…对不起楼下。"],
  longPressLike: ["记住了！！", "又记了一遍！！", "喜欢就要……大声说出来……（小声）"],
  lostSkip: ["切了三首了…在找什么吗？", "还在找吗……要不要一起听？", "找不到的话……就留在墙角也行。"],
  goneSong: ["已经不在了…那就唱下一首吧。", "又走了一个……", "今天也想装成吉他英雄……唱得动就行。"],
  offlineNet: ["断网了…先在墙角待一会儿？", "还、还连不上……", "那就……自己哼吧。"],
  netBack: ["连、连上了……那我从墙角出来一下。", "回来了……我、我也就回来了。"],
  emptyLibrary: "墙角空空的…先丢一首进来吧。",
  emptySearch: "英雄也找不到这个。换个词？",
  emptyDownloads: "还没有要带回家的歌。",
  historyEmpty: { title: "还没有演出记录。", sub: "第一次…会紧张吗。从发现页挑一首吧。" },
  playlistsEmpty: "想建一个就建吧…我帮你看着。",
  emptyLoggedOut: "还没登录…一个人的话，也能听的。",
  guide: "啊，你好…我是这的驻场（自封的）。",
  confirmClear: "要把演出记录都烧掉吗？！想好了吗。",
  confirmDelete: (_name: string): string => "要拆掉这个歌单吗…歌们没事的。",
  enqueue: "加进队伍里了，不会孤单了。",
  quality: (_label: string): string => "声音变好了…耳朵好幸福。",
  pack: (_label: string): string => "换了身衣服…好看吗。",
  lateNight: "深夜的 live，观众只有你。",
  shareNote: "给、给你……要听完哦。",
  repeatThree: (n: number): string => `被发现了，这是第 ${n} 遍了吧。`,
  sameArtist: (_n: number): string => "呜…你们感情真好。",
  downloadStart: "出门去带了！",
  downloadFail: "呜…没抓住。再试一次就好。",
  noLyric: "歌词在别的地方丢了…不过音乐还在。",
  sourceDown: "这扇门锁住了…换别的门？",
  sessionExpired: "那个…好像被请出去了。再登一次？",
  queueEmpty: "接下来…还没想好。要不让它自己走？",
  loadingSkeleton: "正在准备…（在墙角努力中）",
  loadingScan: "正在一首首问歌，愿不愿意搬进来…",
  loadingDaily: "今天的 setlist…让我想想。",
} as const;

type Pack = PackCopy;

const PACKS: Record<string, Pack> = { BELLE, mygo: MAIGO, gbc: RAW, btr: KADO };

/** 按 palette 取文案包；未登记的 palette 回落基座。 */
export function packCopy(palette: string): Pack {
  return PACKS[palette] ?? BELLE;
}

/** 漫游页轮换文案：按队列序号轮换。 */
export function roamCopies(palette: string): readonly string[] {
  return packCopy(palette).roam;
}

/** 我喜欢空态。 */
export function likedEmptyCopy(palette: string): { title: string; sub: string; cta: string } {
  return packCopy(palette).likedEmpty;
}

/** 播放历史空态（title/sub 随包，cta 共用）。 */
export function historyEmptyCopy(palette: string): { title: string; sub: string } {
  return packCopy(palette).historyEmpty;
}

/** 红心操作 toast（账号红心路径）。 */
export function likeToastCopy(palette: string, added: boolean): string {
  return packCopy(palette).likeToast(added);
}

/** 行为彩蛋文案（E18–E22/E27）：volMax / longPressLike / lostSkip / goneSong / offlineNet / netBack / lateNight。 */
export function eggText(
  palette: string,
  key: "volMax" | "longPressLike" | "lostSkip" | "goneSong" | "offlineNet" | "netBack" | "lateNight",
  n = 1,
): string {
  const v = packCopy(palette)[key];
  if (!Array.isArray(v)) return v; // lateNight 等单句
  return v[Math.min(Math.max(n, 1), v.length) - 1];
}

/** 带次数的事件彩蛋文案（E25/E26）。 */
export function packEventCopy(
  palette: string,
  key: "repeatThree" | "sameArtist",
  n: number,
): string {
  return packCopy(palette)[key](n);
}

/* ---------- 服务层字符串的收敛翻译点 ----------
 * 服务层（bootstrap）不认识包文案；它在 notify/toast 边界抛上来的字符串
 * 在这里认一遍：命基座句式就换成当前包的口气，认不出原样放行。
 * palette 由 use-af 的偏好同步（setActivePalette），服务层零改动。 */
let activePalette = "default";

export function setActivePalette(p: string): void {
  activePalette = p;
}

const SVC_RULES: { match: RegExp; key: "downloadStart" | "downloadFail" | "noLyric" | "sourceDown" | "sessionExpired" | "goneSong" }[] = [
  { match: /已加入下载队列|这首已经在下载队列/, key: "downloadStart" },
  { match: /^已加入 \d+ 首/, key: "downloadStart" },
  { match: /下载失败|下载出错|没能带回来/, key: "downloadFail" },
  { match: /这版歌词是空的|没有歌词|没找到歌词/, key: "noLyric" },
  { match: /登录已过期|登录过期|请先登录/, key: "sessionExpired" },
  { match: /当前音源不支持|音源暂时不可用|这个源挂了/, key: "sourceDown" },
  { match: /这首歌找不到了|已经不在了/, key: "goneSong" },
];

export function svcText(raw: string): string {
  if (activePalette === "default" || !raw) return raw;
  for (const r of SVC_RULES) {
    if (!r.match.test(raw)) continue;
    const v: string | string[] = packCopy(activePalette)[r.key];
    return Array.isArray(v) ? v[0] : v;
  }
  return raw;
}

/** 换包 toast（toast.pack，带包名）。 */
export function packToastCopy(palette: string, label: string): string {
  return packCopy(palette).pack(label);
}

/** 带占位的确认 / toast 类文案统一取用。 */
export function packSlotCopy(
  palette: string,
  key: "confirmDelete" | "quality",
  arg: string,
): string {
  return packCopy(palette)[key](arg);
}

/** 单句类槽位统一取用（空态 / 引导 / 确认 / enqueue / loading）。 */
export function packLineCopy(
  palette: string,
  key:
    | "emptyLibrary" | "emptySearch" | "emptyDownloads" | "playlistsEmpty" | "emptyLoggedOut"
    | "guide" | "confirmClear" | "enqueue" | "queueEmpty"
    | "loadingSkeleton" | "loadingScan" | "loadingDaily" | "shareNote",
): string {
  return packCopy(palette)[key];
}
