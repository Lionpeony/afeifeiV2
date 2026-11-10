/**
 * 四页排版截图（docs/09 B3 验收：1334×747）。
 *
 * 跑法：先 npm run build，再 npx electron scripts/page-shots.mjs
 * 产物：docs/assets/page-<id>.png（本地 / 在线 / 歌单 / 下载）
 *
 * 不 spawn 真实 app（那要 CDP），也不复用 main/index.ts（它会自己开窗口）：
 * 这里自己开窗口 + 注册 renderer 启动必需的 IPC handler，userData 指到
 * 临时目录、快照直接落盘——绝不动用户真实索引。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve("docs/assets");
const PROFILE = path.join(os.tmpdir(), `afeifei-shots-${process.pid}`);

app.setPath("userData", PROFILE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 截图 fixture：空曲库看不出表头/行的列对齐。 */
const TRACKS = [
  ["夜的第七章", "周杰伦", "依然范特西", 297000],
  ["青花瓷", "周杰伦", "我很忙", 239000],
  ["东风破", "周杰伦", "叶惠美", 315000],
  ["江南", "林俊杰", "第二天堂", 268000],
  ["她说", "林俊杰", "她说", 322000],
  ["富士山下", "陈奕迅", "What's Going On…?", 258000],
  ["浮夸", "陈奕迅", "U87", 285000],
  ["十年", "陈奕迅", "黑白灰", 205000],
].map(([title, artist, album, durationMs], i) => ({
  id: `c:/shots/${i}.mp3`,
  path: `C:/shots/${i}.mp3`,
  title,
  artist,
  album,
  durationMs,
  size: 5000 + i,
  mtimeMs: 1000 + i,
  hasCover: false,
}));

const PAGES = [
  ["本地", "local"],
  ["在线", "online"],
  ["首页", "home"],
  // 「电台」tick 已于站尺重构移除（StationRuler.TICKS 无 radio）——保留会在这里崩断整条截图链
  ["漫游", "roam"],
  ["喜欢的音乐", "liked"],
  ["最近播放", "recent"],
  ["听歌报告", "stats"],
  // 「下载」tick 同样已移除（2026-11-10 实测 click:false）——保留会让整条链 throw 后挂死
  ["设置", "settings"],
];

/** B-12 真机证据：先给账本喂几段，报告页才不是空态（空态由单测覆盖）。 */
function seedListeningLog() {
  const now = new Date();
  const at = (dayAgo, hour, ms) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayAgo, hour).getTime();
  const rows = [
    { trackId: "x1", title: "晴天", artist: "周杰伦", at: at(0, 9), playedMs: 18 * 60000 },
    { trackId: "x2", title: "富士山下", artist: "陈奕迅", at: at(0, 21), playedMs: 12 * 60000 },
    { trackId: "x3", title: "江南", artist: "林俊杰", at: at(2, 20), playedMs: 25 * 60000 },
    { trackId: "x4", title: "夜曲", artist: "周杰伦", at: at(5, 23), playedMs: 9 * 60000 },
  ];
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.writeFileSync(path.join(PROFILE, "store-listening-log.json"), JSON.stringify(rows));
}

/**
 * 只补齐 renderer 启动路径会 invoke 的几条。少一条 bootstrap 就整体 reject，
 * 页面只剩空壳——这也是为什么这几行必须和 preload 的通道名逐字对上。
 */
function registerMinimalIpc() {
  const file = (name) => path.join(PROFILE, name);
  const readFile = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
  const writeFile = (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  };

  ipcMain.handle("library:loadIndex", () => readFile(file("library.json")));
  ipcMain.handle("library:saveIndex", (_e, json) => writeFile(file("library.json"), json));
  // readLog 必须给 ""：真主进程读不到文件也返回空串，parseLog 对 null 会崩
  ipcMain.handle("library:readLog", () => "");
  ipcMain.handle("library:appendLog", () => undefined);
  ipcMain.handle("library:clearLog", () => undefined);
  ipcMain.handle("library:cover", () => null);
  ipcMain.handle("store:read", (_e, key) => readFile(file(`store-${String(key)}.json`)));
  ipcMain.handle("store:write", (_e, key, json) => writeFile(file(`store-${String(key)}.json`), json));
  ipcMain.handle("app-state:load", () => null);
  ipcMain.handle("app-state:save", () => undefined);
  ipcMain.handle("download:usage", () => 0);
  ipcMain.handle("download:dir", () => PROFILE);
  // 设置页的两行（M9）：目录列表与开机自启。给真实形状，截图才看得出排版
  ipcMain.handle("library:roots", () => ["D:\\Music\\华语", "E:\\Music\\Lossless"]);
  ipcMain.handle("app:autoLaunch", () => true);
  ipcMain.handle("notify:show", () => true);

  // 歌单页（M11）：账号歌单 + 导入一个歌单 + 取曲目，三件事都要有形状
  ipcMain.handle("netease:profile", () => ({ loggedIn: true, nick: "截图账号", uid: "12345" }));
  ipcMain.handle("netease:call", (_e, method, params) => {
    if (method === "user_playlist") {
      return {
        playlist: [
          { id: 501, name: "华语黄金年代", trackCount: 42, coverImgUrl: "" },
          { id: 502, name: "粤语经典", trackCount: 18, coverImgUrl: "" },
          { id: 503, name: "夜间循环", trackCount: 27, coverImgUrl: "" },
        ],
      };
    }
    if (method === "playlist_detail") {
      return { code: 200, playlist: { id: Number(params?.id ?? 0), name: "导入的歌单 · 测试", trackCount: 3 } };
    }
    const SONGS = [
      { id: 1, name: "晴天", ar: [{ name: "周杰伦" }], al: { name: "叶惠美" }, dt: 269000 },
      { id: 2, name: "富士山下", ar: [{ name: "陈奕迅" }], al: { name: "What's Going On…?" }, dt: 258000 },
      { id: 3, name: "江南", ar: [{ name: "林俊杰" }], al: { name: "第二天堂" }, dt: 268000 },
      { id: 4, name: "夜的第七章", ar: [{ name: "周杰伦" }], al: { name: "依然范特西" }, dt: 297000 },
      { id: 5, name: "青花瓷", ar: [{ name: "周杰伦" }], al: { name: "我很忙" }, dt: 239000 },
      { id: 6, name: "浮夸", ar: [{ name: "陈奕迅" }], al: { name: "U87" }, dt: 285000 },
      { id: 7, name: "她说", ar: [{ name: "林俊杰" }], al: { name: "她说" }, dt: 322000 },
      { id: 8, name: "东风破", ar: [{ name: "周杰伦" }], al: { name: "叶惠美" }, dt: 315000 },
      { id: 9, name: "十年", ar: [{ name: "陈奕迅" }], al: { name: "黑白灰" }, dt: 205000 },
      { id: 10, name: "修炼爱情", ar: [{ name: "林俊杰" }], al: { name: "因你而在" }, dt: 254000 },
      { id: 11, name: "七里香", ar: [{ name: "周杰伦" }], al: { name: "七里香" }, dt: 279000 },
      { id: 12, name: "红玫瑰", ar: [{ name: "陈奕迅" }], al: { name: "认了吧" }, dt: 262000 },
    ];
    if (method === "playlist_track_all") return { total: SONGS.length, songs: SONGS };
    // 榜单目录（2026-11-10 重设计验收）：8 个榜，右栏下钻走 playlist_track_all
    if (method === "toplist") {
      return {
        list: [
          { id: 19723756, name: "飙升榜", trackCount: 100 },
          { id: 3779629, name: "新歌榜", trackCount: 100 },
          { id: 3778678, name: "热歌榜", trackCount: 200 },
          { id: 10520166, name: "电音榜", trackCount: 50 },
          { id: 745956260, name: "说唱榜", trackCount: 50 },
          { id: 71384707, name: "ACG 新歌榜", trackCount: 80 },
          { id: 2713520465, name: "日本公信榜", trackCount: 60 },
          { id: 60198, name: "欧美热歌榜", trackCount: 100 },
        ],
      };
    }
    // 在线搜索（B-10 批量下载）：3 条结果刚好验「全选 → 下载选中（3）」
    if (method === "cloudsearch") return { result: { songs: SONGS.slice(0, 3), songCount: 3 } };
    return { code: 200 };
  });
}

app.whenReady().then(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.writeFileSync(path.join(PROFILE, "library.json"), JSON.stringify({ v: 1, tracks: TRACKS, savedAt: Date.now() }));
  seedListeningLog();
  // 喜欢页（2026-11-10 重设计验收）：给前 5 首点红心，登记簿/印鉴/墨条才有形状
  fs.writeFileSync(
    path.join(PROFILE, "store-likes.json"),
    JSON.stringify(TRACKS.slice(0, 5).map((t) => t.id)),
  );
  registerMinimalIpc();

  const [shotW, shotH] = (process.env.SHOTS_SIZE ?? "1334x747").split("x").map(Number);
  const suffix = process.env.SHOTS_SUFFIX ?? "";

  const win = new BrowserWindow({
    width: shotW,
    height: shotH,
    useContentSize: true, // 尺寸指可绘制区，不含窗口边框
    show: true,
    webPreferences: {
      preload: path.resolve("dist/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.resolve("dist/renderer/index.html"));
  await sleep(900); // 曲库恢复 + 首帧

  // 渲染进程崩了会让 capturePage() 返回空图（写出 0 字节 PNG，肉眼看不出来）——把它说出来
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`✗ 渲染进程结束：${details.reason}（exitCode ${details.exitCode}）`);
  });
  win.webContents.on("console-message", (_e, level, message, lineNo, sourceId) => {
    if (level >= 2) console.error(`  renderer: ${message} @ ${sourceId}:${lineNo}`);
  });

  fs.mkdirSync(OUT, { recursive: true });

  /**
   * 拍一张图。空图**不写盘**：`capturePage()` 偶尔返回空 NativeImage，
   * 直接写会产出 0 字节 PNG —— 它长得像"证据"，review 时完全看不出来（`page-stage.png`
   * 在 HEAD 里就是一张 0 字节的图）。返回是否真的拍到了。
   */
  const shoot = async (name) => {
    // 先逼一帧：DOM 改完但没合成时，capturePage 会返回上一帧（弹窗关掉了图里还开着）
    await win.webContents.executeJavaScript(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`,
      true,
    );
    let img = await win.webContents.capturePage();
    if (img.isEmpty()) {
      await sleep(500);
      img = await win.webContents.capturePage();
    }
    if (img.isEmpty()) {
      console.error(`✗ ${name} 截到空图，跳过（渲染进程没绘制）`);
      return false;
    }
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log(`shot → docs/assets/${name}`);
    return true;
  };

  // 首次使用引导（C-16）已下线（2026-11-05 用户要求去掉启动弹窗）：
  // 原三步引导的截图与 KV 判据一并移除，page-onboarding*.png 不再产出。

  for (const [label, id] of PAGES) {
    const ok = await win.webContents.executeJavaScript(
      `(() => {
        const b = document.querySelector('.ruler-tick[data-page="${id}"]');
        if (!b) return false;
        b.click();
        return true;
      })()`,
      true,
    );
    if (!ok) throw new Error(`找不到导航项「${label}」`);
    await sleep(400); // 切页后一帧
    await shoot(`page-${id}${suffix}.png`);
  }

  // 设置页下半（M9：曲库目录 / 开机自启）——不滚到底一行都看不到
  await win.webContents.executeJavaScript(`document.querySelector(".set-body")?.scrollTo(0, 1e6)`, true);
  await sleep(200);
  await shoot(`page-settings-m9${suffix}.png`);

  // 歌词正则过滤（B-2）：滚到歌词块 → 写一条坏正则 + 一条好正则 → 保存
  await win.webContents.executeJavaScript(
    `document.querySelector(".set-area")?.closest(".set-block")?.scrollIntoView({ block: "center" })`,
    true,
  );
  await sleep(200);
  await shoot(`page-settings-lyrics${suffix}.png`);
  const setFilterText = async (text) => {
    await win.webContents.executeJavaScript(
      `(() => {
        const area = document.querySelector(".set-area");
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(area, ${JSON.stringify(text)});
        area.dispatchEvent(new Event("input", { bubbles: true }));
      })()`,
      true,
    );
    await sleep(120);
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll(".set-filter-ops button")].find((b) => b.textContent === "保存")?.click()`,
      true,
    );
    await sleep(300);
  };
  await setFilterText("[\n版权");
  const filterHint = await win.webContents.executeJavaScript(
    `document.querySelector(".set-hint")?.textContent ?? ""`,
    true,
  );
  if (!filterHint.includes("写法不对")) throw new Error(`坏正则没有提示：${filterHint}`);
  const filterFile = path.join(PROFILE, "store-lyric-filters.json");
  if (!fs.existsSync(filterFile) || !fs.readFileSync(filterFile, "utf8").includes("版权")) {
    throw new Error("歌词过滤规则没写进 KV");
  }
  await setFilterText("版权");
  const cleanHint = await win.webContents.executeJavaScript(
    `document.querySelector(".set-hint")?.textContent ?? ""`,
    true,
  );
  if (!cleanHint.includes("已保存 1 条")) throw new Error(`改回合法规则后没生效：${cleanHint}`);

  // 全局配色（B-9）：四档里切到「旧档」，DOM 属性与结构层颜色都要变
  // 先滚回设置页顶部，截图才拍得到「配色」那一行（上一步滚到歌词块了）
  await win.webContents.executeJavaScript(`document.querySelector(".set-body")?.scrollTo(0, 0)`, true);
  await sleep(200);
  const bgBefore = await win.webContents.executeJavaScript(
    `getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()`,
    true,
  );
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".seg button")].find((b) => b.textContent === "旧档")?.click()`,
    true,
  );
  await sleep(250);
  const themed = await win.webContents.executeJavaScript(
    `(() => ({
      id: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
      buttons: [...document.querySelectorAll(".seg button")].length,
    }))()`,
    true,
  );
  if (themed.id !== "sepia" || themed.bg === bgBefore) {
    throw new Error(`配色没生效：${JSON.stringify(themed)} / 之前是 ${bgBefore}`);
  }
  await shoot(`page-settings-sepia${suffix}.png`);
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".seg button")].find((b) => b.textContent === "纸色")?.click()`,
    true,
  );
  await sleep(200);

  // 听歌报告（B-12）：账本在启动前注入，四个数字卡 + 7 根柱要有内容
  await win.webContents.executeJavaScript(
    `document.querySelector('.ruler-tick[data-page="stats"]')?.click()`,
    true,
  );
  await sleep(300);
  const stats = await win.webContents.executeJavaScript(
    `(() => ({
      cards: document.querySelectorAll(".stats-card").length,
      bars: document.querySelectorAll(".stats-bar-col").length,
      // 旧版是 .stats-hour 一列列，2026-11 改热力格 .stats-heat-cell（24 格）
      hours: document.querySelectorAll(".stats-heat-cell").length,
      ranks: document.querySelectorAll(".stats-rank").length,
    }))()`,
    true,
  );
  if (stats.cards !== 4 || stats.bars !== 7 || stats.hours !== 24 || stats.ranks === 0) {
    throw new Error(`听歌报告没渲染：${JSON.stringify(stats)}`);
  }

  // 不喜欢（B-11）：漫游抽一张 → 点少推 → 名单落盘 → 设置页清单出现
  await win.webContents.executeJavaScript(
    `document.querySelector('.ruler-tick[data-page="roam"]')?.click()`,
    true,
  );
  await sleep(300);
  await win.webContents.executeJavaScript(
    `(() => {
      const b = [...document.querySelectorAll(".roam .acts button")]
        .find((x) => x.textContent === "抽第一张" || x.textContent === "换一首");
      if (b) b.click();
      return !!b;
    })()`,
    true,
  );
  await sleep(250);
  // click() 返回 undefined；不能拿它的返回值当「点到了」，要显式返回布尔
  const disliked = await win.webContents.executeJavaScript(
    `(() => {
      const b = [...document.querySelectorAll(".roam .acts button")].find((x) => x.textContent.includes("不喜欢"));
      if (!b) return false;
      b.click();
      return true;
    })()`,
    true,
  );
  if (!disliked) throw new Error("漫游里找不到「不喜欢 · 少推」按钮");
  await sleep(400);
  const dislikeFile = path.join(PROFILE, "store-dislikes.json");
  if (!fs.existsSync(dislikeFile) || fs.readFileSync(dislikeFile, "utf8").length < 3) {
    throw new Error("不喜欢名单没写进 KV");
  }
  await shoot(`page-roam-dislike${suffix}.png`);
  await win.webContents.executeJavaScript(
    `document.querySelector('.ruler-tick[data-page="settings"]')?.click()`,
    true,
  );
  await sleep(300);
  const dislikeRows = await win.webContents.executeJavaScript(
    `document.querySelectorAll(".dislike-row").length`,
    true,
  );
  if (dislikeRows < 1) throw new Error("设置页没列出不喜欢名单");

  // 榜单页（2026-11-10 重设计验收）：在线页默认就是榜单分支。
  // 齐装满员的样子 = 左栏 8 个榜 + 冠军位 1 张 + 2/3 名双卡 + 跑马灯在滚。
  // 注意别插在 PAGES 循环后面：设置页的专项步骤依赖循环最后停在「设置」。
  await win.webContents.executeJavaScript(
    `document.querySelector('.ruler-tick[data-page="online"]')?.click()`,
    true,
  );
  await sleep(900);
  const chartProbe = await win.webContents.executeJavaScript(
    `(() => {
      const rows = [...document.querySelectorAll(".online-row")];
      const after = (el) => parseFloat(getComputedStyle(el, "::after").width) || 0;
      const cover = document.querySelector(".champ-cover");
      return {
        dirs: document.querySelectorAll(".pl-item.chart-item").length,
        champ: document.querySelectorAll(".chart-champ").length,
        hero: document.querySelectorAll(".chart-hero-cell").length,
        rows: rows.length,
        top10: document.querySelectorAll(".online-row.top10").length,
        ticker: Boolean(document.querySelector(".chart-ticker")),
        // 热度墨条坡：第 4 名的墨线必须比第 10 名长（判据可红可绿）
        w4: rows[0] ? Math.round(after(rows[0])) : 0,
        w10: rows[6] ? Math.round(after(rows[6])) : 0,
        // 冠军封面要真的是大图（148px 档），缩水成普通 cell 就是版式退化
        champCover: cover ? Math.round(cover.getBoundingClientRect().width) : 0,
      };
    })()`,
    true,
  );
  if (
    chartProbe.dirs < 5 ||
    chartProbe.champ !== 1 ||
    chartProbe.hero !== 2 ||
    chartProbe.rows < 5 ||
    chartProbe.top10 < 3 ||
    !chartProbe.ticker ||
    chartProbe.w4 <= chartProbe.w10 ||
    chartProbe.champCover < 140
  ) {
    throw new Error(`榜单页没长齐：${JSON.stringify(chartProbe)}`);
  }
  await shoot(`page-charts${suffix}.png`);

  // 歌单页（M11）：账号歌单 → 一键收藏 → 粘链接导入 → 点开取曲目
  await win.webContents.executeJavaScript(
    `document.querySelector('.ruler-tick[data-page="playlists"]')?.click()`,
    true,
  );
  await sleep(500);
  // 「示例音源」也声明了歌单能力，默认会选它；截图要用带账号歌单的网易云
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".seg button")].find((b) => b.textContent === "网易云音乐")?.click()`,
    true,
  );
  await sleep(500);
  const accountRows = await win.webContents.executeJavaScript(
    `document.querySelectorAll(".pl-line-item").length`,
    true,
  );
  if (accountRows < 3) {
    const diag = await win.webContents.executeJavaScript(
      `(() => ({
        head: document.querySelector(".page-head h1, h1")?.textContent ?? "",
        note: document.querySelector(".lib-note")?.textContent ?? "",
        empty: [...document.querySelectorAll(".lib-empty")].map((n) => n.textContent).join(" | "),
        sect: [...document.querySelectorAll(".pl-sect")].map((n) => n.textContent).join(" | "),
        items: document.querySelectorAll(".pl-item").length,
      }))()`,
      true,
    );
    throw new Error(`账号歌单没渲染：${accountRows} 行；${JSON.stringify(diag)}`);
  }
  await shoot(`page-playlists${suffix}.png`);

  const imported = await win.webContents.executeJavaScript(
    `(() => {
      // 2026-11 版导入收在展开条里：先点页头「导入」展开，再填输入条
      document.querySelector(".pl-import-open")?.click();
      return true;
    })()`,
    true,
  );
  await sleep(400);
  const imported2 = await win.webContents.executeJavaScript(
    `(() => {
      const input = document.querySelector(".pl-import .search");
      if (!input) return { ok: false, why: "找不到导入输入框" };
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "https://music.163.com/playlist?id=24381616");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const btn = document.querySelector(".pl-import .primary");
      if (!btn) return { ok: false, why: "找不到导入提交按钮" };
      btn.click();
      return { ok: true };
    })()`,
    true,
  );
  if (!imported2.ok) throw new Error(`导入失败：${imported2.why}`);
  await sleep(400);
  const savedText = await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".pl-sect")].map((n) => n.textContent).join("|")`,
    true,
  );
  if (!savedText.includes("我收藏的")) throw new Error(`收藏区没出现：${savedText}`);
  const savedFile = path.join(PROFILE, "store-online-playlists.json");
  if (!fs.existsSync(savedFile) || !fs.readFileSync(savedFile, "utf8").includes("导入的歌单")) {
    throw new Error("收藏的歌单没写进 KV");
  }

  // 点收藏的那条取曲目：能拿到 12 首即视为链路通（在线播放地址在截图里取不到，不在这里验）
  await win.webContents.executeJavaScript(
    `document.querySelector(".pl-item.pl-line-item")?.click()`,
    true,
  );
  await sleep(500);
  const trackRows = await win.webContents.executeJavaScript(
    `document.querySelectorAll(".online-row").length`,
    true,
  );
  if (trackRows !== 12) throw new Error(`歌单曲目没取到：${trackRows} 行`);
  await shoot(`page-playlists-imported${suffix}.png`);

  // 下载增强（B-10）：在线搜索 3 首 → 全选 → 批量下载 → 下载页出现 3 个任务
  await win.webContents.executeJavaScript(
    `document.querySelector('.ruler-tick[data-page="online"]')?.click()`,
    true,
  );
  await sleep(300);
  // 默认音源是「示例音源」，要显式切到网易云才走我们 stub 的 cloudsearch
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".seg button")].find((b) => b.textContent === "网易云音乐")?.click()`,
    true,
  );
  await sleep(300);
  // 搜索入口已上移到站尺右端的 form（页内搜索按钮已删）：填词 + 提交
  await win.webContents.executeJavaScript(
    `(() => {
      const input = document.querySelector(".ruler-search input");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "晴天");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.closest("form").requestSubmit();
      return true;
    })()`,
    true,
  );
  await sleep(1200);
  const searchState = await win.webContents.executeJavaScript(
    `(() => ({
      rows: document.querySelectorAll(".online-row").length,
      note: document.querySelector(".lib-note")?.textContent ?? "",
      source: document.querySelector(".seg button.on")?.textContent ?? "",
    }))()`,
    true,
  );
  if (searchState.rows !== 3) throw new Error(`在线搜索没出 3 条：${JSON.stringify(searchState)}`);
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".lib-head button")].find((b) => b.textContent === "全选")?.click()`,
    true,
  );
  await sleep(200);
  const manyBtn = await win.webContents.executeJavaScript(
    `(() => {
      const b = [...document.querySelectorAll(".lib-head button")].find((x) => x.textContent.startsWith("下载选中"));
      if (!b) return false;
      b.click();
      return true;
    })()`,
    true,
  );
  if (!manyBtn) throw new Error("找不到「下载选中」按钮");
  await sleep(500);

  // 「下载」tick 已从站尺移除：下载视图挂在本地页的 tab 上（曲库 / 下载 / 电台）
  await win.webContents.executeJavaScript(
    `document.querySelector('.ruler-tick[data-page="local"]')?.click()`,
    true,
  );
  await sleep(400);
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".lib-tabs button")].find((b) => b.textContent === "下载")?.click()`,
    true,
  );
  await sleep(400);
  const dlRows = await win.webContents.executeJavaScript(
    `document.querySelectorAll(".dl-row").length`,
    true,
  );
  if (dlRows < 3) throw new Error(`批量下载没进队列：${dlRows} 行`);

  // 命名模板 + 并发上限：改完保存，断言 KV 落盘
  await win.webContents.executeJavaScript(
    `(() => {
      const input = document.querySelector(".dl-template");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "{index} {title} - {artist}");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const select = document.querySelector('.dl-settings select[aria-label="同时下载数"]');
      const setSel = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setSel.call(select, "4");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    })()`,
    true,
  );
  await sleep(200);
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".dl-settings button")].find((b) => b.textContent === "保存设置")?.click()`,
    true,
  );
  await sleep(400);
  const dlSettingsFile = path.join(PROFILE, "store-download-settings.json");
  const dlSettings = fs.existsSync(dlSettingsFile) ? fs.readFileSync(dlSettingsFile, "utf8") : "";
  if (!dlSettings.includes("{index}") || !dlSettings.includes('"concurrency":4')) {
    throw new Error(`下载设置没写进 KV：${dlSettings}`);
  }
  await shoot(`page-downloads-settings${suffix}.png`);

  // 歌手详情（M11）：本地页「艺人」→ 第一个歌手。验专辑条 + 行内歌手链接没把行点崩
  await win.webContents.executeJavaScript(
    `document.querySelector('.ruler-tick[data-page="local"]')?.click()`,
    true,
  );
  await sleep(200);
  // 上一段停在「下载」tab；站尺对当前页重复点击是 no-op，必须显式点回「曲库」，
  // 否则「艺人」按钮根本没渲染（它只在 tab === "library" 时出现）
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".lib-tabs button")].find((x) => x.textContent === "曲库")?.click()`,
    true,
  );
  await sleep(200);
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".lib-tabs button")].find((x) => x.textContent === "艺人")?.click()`,
    true,
  );
  await sleep(250);
  const artistOk = await win.webContents.executeJavaScript(
    `(() => { const b = document.querySelector(".artist-item"); if (!b) return false; b.click(); return true; })()`,
    true,
  );
  if (!artistOk) throw new Error("找不到歌手列表项");
  await sleep(300);
  await shoot(`page-library-artist${suffix}.png`);

  // 行内歌手链接（M11）：曲目视图里点第一行的歌手名，必须落到同名歌手详情
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".lib-tabs button")].find((x) => x.textContent === "曲目")?.click()`,
    true,
  );
  await sleep(250);
  const linked = await win.webContents.executeJavaScript(
    `(() => {
      const link = document.querySelector(".lib-list .lib-row .lib-artist");
      if (!link) return { ok: false, why: "找不到行内歌手链接" };
      const want = link.textContent.trim();
      link.click();
      return { ok: true, want };
    })()`,
    true,
  );
  await sleep(300);
  const got = await win.webContents.executeJavaScript(
    `document.querySelector(".group-title")?.textContent?.trim() ?? ""`,
    true,
  );
  if (!linked.ok || !got.startsWith(linked.want)) {
    throw new Error(`行内歌手链接没跳到「${linked.want}」，实际是「${got}」`);
  }
  await shoot(`page-library-artist-from-row${suffix}.png`);

  // 元数据编辑（M11）：改第一行歌名 → 行上立刻变，覆盖表落进 KV。
  // 先回「曲目」视图：上一步停在歌手详情，那里没有编辑入口
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(".lib-tabs button")].find((x) => x.textContent === "曲目")?.click()`,
    true,
  );
  await sleep(250);
  const metaOk = await win.webContents.executeJavaScript(
    `(() => {
      const edit = [...document.querySelectorAll(".lib-list .lib-row button")].find((b) =>
        (b.getAttribute("aria-label") || "").startsWith("编辑"),
      );
      if (!edit) return { ok: false, why: "找不到编辑按钮" };
      edit.click();
      return { ok: true };
    })()`,
    true,
  );
  if (!metaOk.ok) throw new Error(`元数据编辑打不开：${metaOk.why}`);
  await sleep(250);
  await shoot(`page-library-meta-dialog${suffix}.png`);
  const metaDone = await win.webContents.executeJavaScript(
    `(() => {
      const input = document.querySelector(".meta-edit-row input");
      if (!input) return { ok: false, why: "弹窗没渲染" };
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "测试改名");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const save = [...document.querySelectorAll(".meta-edit-ops button")].find((b) => b.textContent === "保存");
      if (!save) return { ok: false, why: "找不到保存" };
      save.click();
      return { ok: true };
    })()`,
    true,
  );
  if (!metaDone.ok) throw new Error(`元数据保存失败：${metaDone.why}`);
  await sleep(400);
  const firstTitle = await win.webContents.executeJavaScript(
    `document.querySelector(".lib-list .lib-row .lib-title")?.textContent?.trim() ?? ""`,
    true,
  );
  if (!firstTitle.startsWith("测试改名")) throw new Error(`行上没变：${firstTitle}`);
  const metaFile = path.join(PROFILE, "store-library-meta.json");
  if (!fs.existsSync(metaFile) || !fs.readFileSync(metaFile, "utf8").includes("测试改名")) {
    throw new Error("覆盖表没写进 KV");
  }
  await shoot(`page-library-meta${suffix}.png`);

  // 夜间一版（docs/09 B4 证据）：同一进程切主题，不重启、不重排
  await win.webContents.executeJavaScript(
    `document.querySelector('.ruler-tick[data-page="local"]')?.click()`,
    true,
  );
  await win.webContents.executeJavaScript(`document.querySelector(".theme-toggle")?.click()`, true);
  await sleep(300);
  await shoot(`page-local-dark${suffix}.png`);

  // 音效面板（A-06 证据）：10 段竖排滑杆 + 预设。点了「人声」才拍，曲线要跟着变
  await win.webContents.executeJavaScript(`document.querySelector(".theme-toggle")?.click()`, true);
  await sleep(200);
  const fxOk = await win.webContents.executeJavaScript(
    `(() => {
      const b = [...document.querySelectorAll(".tools button")].find(
        (x) => x.getAttribute("aria-label") === "音效",
      );
      if (!b) return false;
      b.click();
      return true;
    })()`,
    true,
  );
  if (!fxOk) throw new Error("找不到控制台的「音效」按钮");
  await sleep(300);
  const presetOk = await win.webContents.executeJavaScript(
    `(() => {
      const b = [...document.querySelectorAll(".fx-presets button")].find((x) => x.textContent === "人声");
      if (!b) return false;
      b.click();
      return true;
    })()`,
    true,
  );
  if (!presetOk) throw new Error("找不到 EQ 预设「人声」");
  await sleep(350);
  await shoot("console-eq.png");

  /* ---- 队列面板（P0-10/11/16 证据）：三张——空态 / 有内容 / 失败标记 ---- */
  const clickText = (scope, text) =>
    win.webContents.executeJavaScript(
      `(() => {
        const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find((x) => x.textContent === ${JSON.stringify(text)});
        if (!b) return false;
        b.click();
        return true;
      })()`,
      true,
    );
  // 控制台面板区已图标化，只能认 aria-label（音效/播放队列/桌面歌词/迷你窗）
  const clickLabel = (label) =>
    win.webContents.executeJavaScript(
      `(() => {
        const b = [...document.querySelectorAll(".tools button")].find((x) => x.getAttribute("aria-label") === ${JSON.stringify(label)});
        if (!b) return false;
        b.click();
        return true;
      })()`,
      true,
    );

  await clickLabel("音效"); // 关掉音效弹层，别挡
  await sleep(200);

  // ① 空队列态：真实置空时该说的话（不是留白）
  await clickLabel("播放队列");
  await sleep(300);
  await shoot("queue-empty.png");
  await win.webContents.executeJavaScript(`document.querySelector(".qp-x")?.click()`, true);
  await sleep(200);

  // ② 有内容：用「加入队列」造 8 首（不点播 → 不会有错误态干扰这张）
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('[aria-label^="加入队列"]')].slice(0, 8).forEach((b) => b.click())`,
    true,
  );
  await sleep(300);
  await clickLabel("播放队列");
  await sleep(300);
  await shoot("queue.png");

  // 失败标记（P0-16）的视觉证据不在这里拍：fixture 的路径是假的但元素不报 error
  // （没有 media:grant handler 时音频静默失败），拍出来是一张"看起来正常"的假图。
  // 它的判据放在 smoke 阶段 3：真删一个文件 → 断言 `.qp-row` 里有「播不了」。

  // 歌词时间轴（B-1）：播放页「视图」浮层里必须有 250ms 步进与滑杆。
  // 放在最后：舞台是全屏视图，拍完就退出，不干扰前面的页面截图。
  await win.webContents.executeJavaScript(`document.querySelector(".qp-x")?.click()`, true);
  await sleep(200);
  await win.webContents.executeJavaScript(`document.querySelector(".np")?.click()`, true);
  await sleep(400);
  // 「视图」按钮：顶栏导播条 .sk-top-b（三套皮肤同一出口）
  const clickView = () =>
    win.webContents.executeJavaScript(
      `(() => {
        const b = [...document.querySelectorAll(".sk-top-b")].find((x) => x.textContent.trim() === "视图");
        if (!b) return false;
        b.click();
        return true;
      })()`,
      true,
    );
  await clickView();
  await sleep(300);
  const timeline = await win.webContents.executeJavaScript(
    `(() => {
      const slider = document.querySelector('input[type="range"][aria-label="歌词时间轴整体偏移"]');
      const labels = [...document.querySelectorAll(".st-menu button")].map((b) => b.textContent.trim());
      return {
        slider: !!slider,
        step: slider?.getAttribute("step"),
        min: slider?.getAttribute("min"),
        max: slider?.getAttribute("max"),
        minus: labels.includes("−0.25s"),
        plus: labels.includes("+0.25s"),
      };
    })()`,
    true,
  );
  if (!timeline.slider || timeline.step !== "250" || timeline.min !== "-10000" || timeline.max !== "10000" || !timeline.minus || !timeline.plus) {
    const diag = await win.webContents.executeJavaScript(
      `(() => ({
        np: !!document.querySelector(".np"),
        topbtns: [...document.querySelectorAll(".sk-top-b")].map((b) => b.textContent.trim()),
        menu: !!document.querySelector(".st-menu"),
        bodyCls: document.body.className,
        page: document.querySelector("[data-page].on")?.getAttribute("data-page") ?? null,
      }))()`,
      true,
    );
    throw new Error(`歌词时间轴控件不对：${JSON.stringify(timeline)} diag=${JSON.stringify(diag)}`);
  }
  await shoot("page-stage-timeline.png");


  app.quit();
});
