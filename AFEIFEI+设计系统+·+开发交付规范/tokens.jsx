/* AFEIFEI Design System — token data
   single source: reference/design.md (v4.2) */

const LIGHT_COLORS = [
  { token: "--bg-base", value: "#FFF8F5", use: "主背景（奶油粉白）", contrast: null },
  { token: "--bg-sub", value: "#FFE8EF", use: "侧栏 / 卡片区", contrast: null },
  { token: "--bg-card", value: "#FFFFFF", use: "卡片", contrast: null },
  { token: "--text-primary", value: "#3D2B39", use: "主文字", contrast: "12.47:1 on bg-base", status: "pass" },
  { token: "--text-secondary", value: "#6B5A68", use: "次文字", contrast: "6.08:1 on bg-base", status: "pass" },
  {
    token: "--brand-pink-400", value: "#FF6B9D",
    use: "仅装饰：贴纸 / 柔光 / 渐变 / 胶带",
    contrast: "2.68:1（白字）", status: "fail",
    warn: "禁止作白字底、小图标色，故禁用为交互面"
  },
  { token: "--brand-pink-600", value: "#D63384", use: "交互主色：按钮底 / 播放键 / 选中态", contrast: "4.50:1（白字）", status: "pass" },
  { token: "--brand-pink-700", value: "#B7286C", use: "active / 按下", contrast: "5.94:1（白字）", status: "pass" },
  { token: "--lavender-600", value: "#7B5FC9", use: "链接 / MyGO 世界信号色", contrast: "4.63:1 on bg-base", status: "pass" },
  { token: "--mint-400", value: "#7EC8E3", use: "漫游 / GBC 河夜装饰色（仅装饰）", contrast: null },
  { token: "--coral-600", value: "#C62A3F", use: "点赞印记 / 警告文字", contrast: "≥4.5:1 on 白", status: "pass" },
  {
    token: "--marker-yellow", value: "#FFD166",
    use: "荧光划线底 / 马克笔图形",
    contrast: "深字 on 黄 9.09:1", status: "pass",
    warn: "禁止任何黄色文字"
  },
  {
    token: "--gradient-tri", value: "90deg, #FF9EBB → #B8A9E8 → #7EC8E3",
    use: "顶部装饰条 / 幕布渐变", contrast: null, kind: "gradient"
  },
  { token: "--shadow-pink", value: "0 4px 20px rgba(255,107,157,.15)", use: "卡片阴影（唯一常规档）", contrast: null, kind: "shadow" },
  { token: "--shadow-pop", value: "0 8px 32px rgba(61,43,57,.18)", use: "弹层加重档（第二档，禁止更多层级）", contrast: null, kind: "shadow" }
];

const DARK_COLORS = [
  { token: "--bg-base-dark", value: "#2A2438", use: "主背景（雨夜紫黑）", contrast: null },
  { token: "--bg-sub-dark", value: "#352E48", use: "侧栏 / 卡片区", contrast: null },
  { token: "--bg-card-dark", value: "#3D3554", use: "卡片", contrast: null },
  { token: "--text-primary-dark", value: "#F4EAF2", use: "主文字", contrast: "≥7:1", status: "pass" },
  { token: "--text-secondary-dark", value: "#B8ABC7", use: "次文字", contrast: "≥4.5:1", status: "pass" },
  { token: "--brand-pink-400-dark", value: "#FF85B0", use: "装饰 / 图形色", contrast: "≈4.8:1 on 卡片", status: "pass", onDark: true },
  {
    token: "--brand-pink-600-dark", value: "#E06A9E",
    use: "暗色下不作实心白字按钮", contrast: null,
    warn: "禁止低对比实心粉底白字"
  },
  { token: "--lamplet-amber", value: "#FFC66E", use: "凌晨 2:00–4:00 河灯点缀（限夜间主题）", contrast: null, onDark: true }
];

const SOURCE_COLORS = [
  { token: "--src-netease", value: "#C20C0C", use: "网易云音源徽标（红）" },
  { token: "--src-qq", value: "#31C27C", use: "QQ音乐音源徽标（绿）" },
  { token: "--tag-vip", value: "#B8860B", use: "VIP 曲目标（琥珀系）" },
  { token: "--tag-unavailable", value: "text-secondary 40%", use: "未收录行整体透明度（opacity: .4）", kind: "alpha" }
];

const STATE_COLORS = [
  { token: "--state-success", value: "#2E7D5B", use: "收藏成功类" },
  { token: "--state-warning", value: "= --coral-600", use: "警告", useToken: "--coral-600", resolve: "#C62A3F" },
  {
    token: "--focus-ring", value: "0 0 0 3px rgba(214,51,132,.35)",
    use: "focus-visible 描边环，全组件统一", kind: "ring"
  }
];

const FONT_STACKS = [
  {
    token: "--font-display",
    label: "标题 / 歌名",
    sample: "凌晨两点的排练室",
    sampleStyle: { fontFamily: "var(--font-display)", fontSize: 26 },
    code: '"ZCOOL XiaoWei", "Yozai", "PingFang SC", "Microsoft YaHei", sans-serif'
  },
  {
    token: "--font-body",
    label: "正文",
    sample: "共 12 首曲目 · 来自两个音源",
    sampleStyle: { fontFamily: "var(--font-body)", fontSize: 15 },
    code: '"PingFang SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif'
  },
  {
    token: "--font-hand",
    label: "拟声词 / 便签 / 批注 / 印章",
    sample: "今天也要好好练琴",
    sampleStyle: { fontFamily: "var(--font-hand)", fontSize: 16 },
    code: '"ZCOOL KuaiLe", "Long Cang", cursive',
    note: "使用边界：≤16px，歌名正文一律用 --font-body"
  }
];

const TYPE_SCALE = [
  { token: "--fs-display", size: "28/36", weight: 700, px: 28, lh: 36, use: "每日推荐标题、日期大字", sample: "今晚的排练室只留一盏灯" },
  { token: "--fs-title", size: "20/28", weight: 600, px: 20, lh: 28, use: "页面主标题、歌单名", sample: "曲目表 · 第一幕" },
  { token: "--fs-heading", size: "16/24", weight: 600, px: 16, lh: 24, use: "模块标题", sample: "音源聚合" },
  { token: "--fs-body", size: "14/22", weight: 400, px: 14, lh: 22, use: "曲目表、正文", sample: "共 12 首曲目，来自网易云与 QQ 音乐两个音源" },
  { token: "--fs-caption", size: "12/18", weight: 400, px: 12, lh: 18, use: "次级说明、表头（另加 letter-spacing .08em）", sample: "表头 · TRACK / ARTIST / TIME", caps: true },
  { token: "--fs-micro", size: "11/16", weight: 500, px: 11, lh: 16, use: "徽标、音源标签、角标", sample: "VIP · 网易云 · HI-RES" }
];

const SPACING = [
  { token: "--space-1", px: 8, use: "行内间隙" },
  { token: "--space-2", px: 16, use: "卡片内距" },
  { token: "--space-3", px: 24, use: "区块内距" },
  { token: "--space-4", px: 32, use: "模块纵向统一" }
];

const BREAKPOINTS = [
  { range: "≥ 1280", text: "桌面优先基准，侧栏 200 + 内容区 + 播放栏 72 的完整三区布局" },
  { range: "768 – 1280", text: "收窄列宽，栅格降级；侧栏与播放栏保留" },
  { range: "≤ 768", text: "只保证不横向溢出。桌面端产品，移动不是目标场景" }
];

const EASINGS = [
  {
    token: "--ease-out-soft",
    value: "cubic-bezier(0.22, 0.61, 0.36, 1)",
    note: "默认",
    points: [0.22, 0.61, 0.36, 1]
  },
  {
    token: "--ease-spring",
    value: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    note: "果冻回弹 · 要更稳可降为 1.2",
    points: [0.34, 1.56, 0.64, 1]
  },
  {
    token: "--ease-curtain",
    value: "cubic-bezier(0.65, 0, 0.35, 1)",
    note: "幕布 / 转场",
    points: [0.65, 0, 0.35, 1]
  }
];

const DURATIONS = [
  { token: "--dur-tap", ms: 120, use: "按下 / 弹起" },
  { token: "--dur-fast", ms: 220, use: "hover / 图标切换 / 颜色" },
  { token: "--dur-base", ms: 380, use: "展开 / 位移 / 印章" },
  { token: "--dur-curtain", ms: 500, use: "幕布 / 切页（收起为镜像 400ms）" },
  { token: "--dur-ambient", ms: 2000, use: "主题切换 / 氛围过渡" }
];

const RHYTHM_RULES = [
  { b: "列表入场", t: "stagger 间隔 40–60ms，仅前 6 项，其余直接就位。" },
  { b: "同屏预算", t: "最多 1 个吸睛级动画（幕布 > 印章 > 其它）。" },
  { b: "可中断", t: "所有动画可中断可逆；循环动画（封面呼吸 6s / 柔光环 3s / 便签摆动 4s）页面不可见时暂停，单屏 ≤2 个。" },
  { b: "页面转场", t: "内容区 translateY(8px) + opacity，300ms --ease-out-soft；侧栏与播放栏不动。" }
];

const MOTION_LEVELS = [
  { key: "full", label: "完整（默认）", desc: "全部动效，含循环呼吸类" },
  { key: "light", label: "轻动效", desc: "去循环呼吸类，保留反馈动效" },
  { key: "off", label: "关闭装饰动效", desc: "仅保留 ≤150ms 纯 opacity 切换" },
  { key: "reduce", label: "reduced-motion", desc: "系统偏好为 reduce 时自动按关闭档处理" }
];

const COMPONENT_STATES = [
  { key: "default", label: "Default", def: "底 #D63384，白字" },
  { key: "hover", label: "Hover", def: "底 #C72D78，加深不提亮，保白字对比" },
  { key: "active", label: "Active", def: "底 #B7286C + translateY(2px)" },
  { key: "disabled", label: "Disabled", def: "35% 透明 + cursor:not-allowed" },
  { key: "focus", label: "Focus-visible", def: "3px rgba(214,51,132,.35) 描边环" }
];

const KEY_MOTIONS = [
  { name: "播放键按下", spec: "scale(.92) → 回弹过冲 1.03 → 1", curve: "--ease-spring" },
  { name: "拨片盖章", spec: "1.6 → 0.95 撞击帧 → 1，ink 扩散环 450ms", curve: "--ease-out-soft" },
  { name: "幕布", spec: "scaleX 收拢 500ms + 流苏虚线；收起为镜像 400ms", curve: "--ease-curtain" },
  { name: "setlist 划线", spec: "SVG stroke-dashoffset 320ms，笔宽 3 → 4.5 → 3", curve: "--ease-out-soft" },
  { name: "切歌纱帘", spec: "150ms，左扫 = 上一首 / 右扫 = 下一首", curve: "linear" },
  { name: "Toast 队列", spec: "垂直堆叠，220ms", curve: "--ease-out-soft" },
  { name: "时间数字滚入", spec: "180ms", curve: "--ease-out-soft" },
  { name: "进度条", spec: "双层：莓粉进度 + 12% 暖黄缓冲层", curve: "—" }
];

const ANIME_LAYER = {
  onomatopoeia: [
    { word: "ポンッ", mean: "点赞" },
    { word: "シュッ", mean: "切歌" },
    { word: "シャッ", mean: "随机" },
    { word: "ザッ…", mean: "幕布" },
    { word: "タッタッ…", mean: "连跳" }
  ]
};

const EGGS = [
  { id: "E01", name: "吉他滑过加载", note: "" },
  { id: "E02", name: "空态便签", note: "" },
  { id: "E03", name: "深莓播放键", note: "" },
  { id: "E04", name: "副歌提示", note: "长按进度条标记后生效" },
  { id: "E05", name: "拨片盖章", note: "" },
  { id: "E06", name: "切歌划线", note: "文案 5 首冷却" },
  { id: "E07", name: "随机绕路", note: "" },
  { id: "E08", name: "幕布", note: "" },
  { id: "E09", name: "凌晨河灯", note: "限夜间主题" },
  { id: "E10", name: "十遍写词", note: "" },
  { id: "E11", name: "五连点 Logo", note: "" },
  { id: "E12", name: "暗号色板", note: "迷子 / 深夜の練習室 / アンコール" },
  { id: "E13", name: "连跳自嘲", note: "" },
  { id: "E14", name: "待机熄灯", note: "" },
  { id: "E15", name: "安可集章卡", note: "入口在设置页" },
  { id: "E16", name: "分幕队列", note: "" },
  { id: "E17", name: "吉祥物路过", note: "" }
];

const A11Y = [
  { title: "对比度", text: "正文 ≥4.5:1，大字与图形 ≥3:1。本文档所有交互面 Token 均已实算达标，未达标项已在色卡标注。" },
  { title: "键盘可用", text: "/ 聚焦搜索，Esc 全局关闭浮层，focus-visible 全组件可见描边环。" },
  { title: "动画安全", text: "仅走 transform / opacity / filter / stroke-dashoffset；reduced-motion 全局降级。" },
  { title: "红线约束", text: "无角色脸、无官方 Logo、无原作截图、无台词曲名原文外露；暖黄与薄荷蓝永不作小文字色。" }
];

const LIMITS = [
  { n: "01", b: "原型无真实音频内核", t: "播放进度、歌词、下载均为模拟态。" },
  { n: "02", b: "登录 / 扫描 / 跨音源", t: "均为模拟流程，需接真实 API 后回归。" },
  { n: "03", b: "焦点顺序", t: "整页走查建议在真实前端框架落地时做。" },
  { n: "04", b: "插画与页面", t: "正式 Q 版吉祥物插画、视频 / 播客页未定稿（占位态）。" },
  { n: "05", b: "字体授权", t: "ZCOOL XiaoWei / ZCOOL KuaiLe 为站酷开源字体，商用需核对当时授权条款。" }
];

Object.assign(window, {
  LIGHT_COLORS, DARK_COLORS, SOURCE_COLORS, STATE_COLORS,
  FONT_STACKS, TYPE_SCALE, SPACING, BREAKPOINTS,
  EASINGS, DURATIONS, RHYTHM_RULES, MOTION_LEVELS,
  COMPONENT_STATES, KEY_MOTIONS, ANIME_LAYER, EGGS, A11Y, LIMITS
});
