import { useEffect, useState, type ReactNode } from "react";
import { PageHead } from "../../PageHead.js";
import { Segmented } from "../../Segmented.js";
import { useActiveSource } from "../../use-active-source.js";
import { toast } from "../../toast.js";
import type { RemoteTrack } from "../../../../contracts/capability.js";
import { LoginDialog } from "./LoginDialog.js";

export interface SourceOption {
  id: string;
  name: string;
  canAuth: boolean;
  /** 能力驱动（00 §7.2）：canGetUrl 才有下载按钮，UI 不做特判 */
  canDownload: boolean;
  /** 能力驱动（M9-5）：canListPlaylists 才进歌单页 */
  canPlaylists: boolean;
  /** 能力驱动（A-14）：canGetToplist 才进榜单页 */
  canToplists: boolean;
}

export interface OnlineViewProps {
  sources: SourceOption[];
  onSearch(sourceId: string, keyword: string): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  /** 抛错时由本组件把错误文案显示出来 —— 界面只认人话，不认错误码。list = 本批搜索结果。origin = 搜索 · 关键词。 */
  onPlay(sourceId: string, track: RemoteTrack, list?: RemoteTrack[], origin?: string): Promise<void>;
  /** 加入下载队列（M7）。返回给用户看的一句话。 */
  onDownload(sourceId: string, track: RemoteTrack): Promise<string>;
  /** 批量下载（B-10）：一次 toast 汇总，不逐首弹小票。 */
  onDownloadMany(sourceId: string, tracks: RemoteTrack[]): Promise<string>;
  /** 查某音源的登录态（登录按钮/退出按钮随源切换，不再网易云专属）。 */
  loginStatus(sourceId: string): Promise<{ loggedIn: boolean; nick: string | null }>;
  /** 开始登录：网易云弹扫码窗，QQ 按通道出码（channel 可选）。 */
  startLogin(sourceId: string, channel?: string): Promise<{ key?: string; qrImage?: string; loggedIn?: boolean }>;
  pollLogin(key: string): Promise<{ code: number; loggedIn: boolean; message: string }>;
  sendCaptcha(phone: string): Promise<{ ok: boolean; message: string }>;
  loginByCaptcha(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>;
  logout(sourceId: string): Promise<void>;
  /** 页头右侧的模式切换（在线 / 榜单合并后由宿主提供） */
  tabs?: ReactNode;
  /** 顶栏搜索提交：at 变化即用 text 发起一次搜索 */
  seekQuery?: { text: string; at: number } | null;
}

const pad = (n: number): string => String(n).padStart(2, "0");

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/**
 * 在线页（M3）：音源选择 + 搜索结果。
 *
 * **搜索入口只有顶栏那一个**（站尺右端的搜索槽）——页内再放一个输入框是功能重复，
 * 两个入口迟早出现"上面搜了、下面还是旧结果"的错位。本页只负责：选音源、显示关键词、
 * 列结果、登录、批量下载。关键词改了只能回顶栏改，这里用 ✕ 清空。
 *
 * 音源列表来自注册表，**不写死** —— 加第三家源时这个下拉框自动多一项。
 * 登录走"真实浏览器窗口"而不是扫码接口：后者对请求频率敏感，
 * 多申请几次 key 就会开始返回非标准码（实测 8821，风控按 IP 记）。
 */
export function OnlineView({
  sources,
  onSearch,
  onPlay,
  onDownload,
  onDownloadMany,
  loginStatus,
  startLogin,
  pollLogin,
  sendCaptcha,
  loginByCaptcha,
  logout,
  tabs,
  seekQuery,
}: OnlineViewProps) {
  const [sourceId, setSourceId] = useActiveSource(sources);
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<RemoteTrack[]>([]);
  /** 批量下载的多选（B-10）：存 sourceId，换一批搜索结果后自动清空 */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /* QQ 搜索实测要 20–45s：5s 后把「还在搜」说出来，别让人对着空白区猜死活 */
  const [slow, setSlow] = useState(false);
  const [nick, setNick] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const currentSource = sources.find((s) => s.id === sourceId);
  const canLogin = currentSource?.canAuth === true;
  const sourceName = currentSource?.name ?? sourceId;


  const refreshLogin = (): void => {
    if (!sourceId) return;
    void loginStatus(sourceId)
      .then((s) => {
        setLoggedIn(s.loggedIn);
        setNick(s.loggedIn ? (s.nick ?? "") : null);
      })
      .catch(() => {
        setLoggedIn(false);
        setNick(null);
      });
  };

  useEffect(() => {
    refreshLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const run = async (query = keyword): Promise<void> => {
    if (!sourceId) return;
    setBusy(true);
    setSlow(false);
    setNote("");
    const slowTimer = setTimeout(() => setSlow(true), 5000);
    try {
      const result = await onSearch(sourceId, query);
      setRows(result.items);
      setSelected(new Set());
      if (result.items.length === 0) setNote("没搜到。换个词试试。");
    } catch (err) {
      setRows([]);
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setBusy(false);
    }
  };

  /** 顶栏提交的搜索：进入在线页时自动填入并发起 */
  useEffect(() => {
    if (!seekQuery?.text) return;
    setKeyword(seekQuery.text);
    void run(seekQuery.text);
    // 只认 at：同一关键词再次提交也要重新搜
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekQuery?.at]);

  /** 清空关键词格：回到「还没搜过」——结果、多选、提示一起收掉，不留半截状态 */
  const clearQuery = (): void => {
    setKeyword("");
    setRows([]);
    setSelected(new Set());
    setNote("");
  };

  /* 换音源：带着同一个词在新源上重搜。
     页内没有搜索按钮之后，不这么做就会「换了源还挂着上一个源的结果」——
     表格上写着 QQ 音乐，行却是网易云搜出来的。 */
  useEffect(() => {
    if (!keyword) return;
    void run(keyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const play = async (track: RemoteTrack): Promise<void> => {
    setNote("");
    try {
      // 来源标签截到 16 字：首页「来自 …」那句话吃的是它，太长会把文案顶破
      const short = keyword.length > 16 ? `${keyword.slice(0, 16)}…` : keyword;
      await onPlay(sourceId, track, rows, keyword ? `搜索 · ${short}` : undefined);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const download = async (track: RemoteTrack): Promise<void> => {
    setNote("");
    try {
      toast(await onDownload(sourceId, track)); // 成功是瞬态通知，走小票不占 note
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadMany = async (): Promise<void> => {
    const picked = rows.filter((t) => selected.has(t.sourceId));
    if (picked.length === 0) return;
    setNote("");
    try {
      toast(await onDownloadMany(sourceId, picked));
      setSelected(new Set());
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  /**
   * 登录统一走 LoginDialog 扫码（网易云 = 应用内二维码；QQ = 隐藏页提取的应用内二维码）。
   * startLogin 返回的 { key, qrImage } 两个源形状一致，poll 按 key 前缀分流。
   */
  const openLogin = async (): Promise<void> => {
    setNote("");
    if (loggedIn) {
      setNote(`已登录${nick ? `：${nick}` : ""}。`);
      return;
    }
    try {
      const status = await loginStatus(sourceId);
      if (status.loggedIn) {
        setLoggedIn(true);
        setNick(status.nick ?? "");
        setNote(`已登录${status.nick ? `：${status.nick}` : ""}，直接点歌就能播。`);
        return;
      }
    } catch {
      /* 查不到状态就当未登录，继续弹二维码 */
    }
    setLoginOpen(true);
  };

  const doLogout = async (): Promise<void> => {
    setNote("");
    try {
      await logout(sourceId);
      setLoggedIn(false);
      setNick(null);
      setNote(`已退出${sourceName}登录。`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="library">
      <PageHead title="在线" meta={`ONLINE · ${sources.length} SOURCES`} extra={tabs} />
      <div className="lib-head">
        {sources.length > 0 ? (
          <Segmented
            label="音源"
            items={sources.map((s) => ({ id: s.id, name: s.name }))}
            value={sourceId}
            onChange={setSourceId}
          />
        ) : null}
        {currentSource && !canLogin ? <span className="badge">免登录</span> : null}
        {canLogin && !loggedIn ? (
          <button type="button" onClick={() => void openLogin()}>
            登录{sourceName}
          </button>
        ) : null}
        {canLogin && loggedIn ? (
          <>
            <span className="badge badge--on" title={nick ? `已登录：${nick}` : "已登录"}>
              {nick ? nick : "已登录"}
            </span>
            <button type="button" onClick={() => void doLogout()}>
              退出
            </button>
          </>
        ) : null}
        {/* 右端只放「这一批结果的批量操作」：跟音源/账号不是一类东西，靠右顶开 */}
        <div className="lib-head-end">
          {currentSource?.canDownload && rows.length > 0 ? (
            <>
              <button type="button" onClick={() => setSelected(new Set(rows.map((t) => t.sourceId)))}>
                全选
              </button>
              <button
                type="button"
                className="primary"
                disabled={selected.size === 0}
                onClick={() => void downloadMany()}
              >
                下载选中{selected.size > 0 ? `（${selected.size}）` : ""}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {loginOpen ? (
        <LoginDialog
          start={async (ch) => {
            // 两个源的 startLogin 返回同形状 { key, qrImage }；pollLogin 按 key 前缀分流
            const r = await startLogin(sourceId, ch);
            if (typeof r.key !== "string" || typeof r.qrImage !== "string") {
              throw new Error("获取二维码失败");
            }
            return { key: r.key, qrImage: r.qrImage };
          }}
          poll={pollLogin}
          // Folia 同款：一张码三种 App 都能扫（qqmusic 通道换凭证按 App 实报类型适配，见 qqClient）
          scanHint={sourceId === "qq" ? "使用 QQ、微信、QQ 音乐任一 App 扫一扫" : "请打开网易云音乐 App → 扫一扫"}
          sendCaptcha={sourceId === "netease" ? sendCaptcha : undefined}
          loginByCaptcha={sourceId === "netease" ? loginByCaptcha : undefined}
          onSuccess={() => {
            setLoginOpen(false);
            refreshLogin();
            setNote("登录成功，直接点歌就能播。");
          }}
          onClose={() => setLoginOpen(false)}
        />
      ) : null}

      {/* 异步结果（搜到没有 / 报错 / 上游慢）要能读屏播报，不然只有看得见的人知道出了事 */}
      {note ? (
        <p className="lib-note" role="status">
          {note}
        </p>
      ) : null}
      {slow ? (
        <p className="lib-note dim" role="status">
          还在搜——这个音源的上游响应比较慢，再等几秒。
        </p>
      ) : null}

      <div className="lib-list">
        {/* 结果抬头：关键词贴着结果走（和榜单页右栏同一行式），工具行只留音源与账号。
            搜索入口仍然只有顶栏那一个，这里只交代「现在看的是哪一批」。 */}
        {keyword ? (
          <p className="list-now">
            <b>{keyword}</b>
            <span>{busy ? "搜索中…" : rows.length > 0 ? `${rows.length} 条` : "没有结果"}</span>
            <button type="button" className="list-now-x" onClick={clearQuery}>
              清空
            </button>
          </p>
        ) : null}
        {/* 表头只在有结果（或正在搜）时出现：空着的时候一列表头压在空态上，像页面坏了 */}
        {rows.length > 0 || busy ? (
          <div className={`lib-thead online-thead${currentSource?.canDownload ? " with-btn" : ""}`}>
            <span className="th-cover" aria-hidden="true" />
            <span className="th-title">TITLE</span>
            <span className="th-a">ARTIST</span>
            <span className="th-b">ALBUM</span>
            <span className="th-dur">TIME</span>
          </div>
        ) : null}
        {busy ? (
          /* 骨架行：搜索期间结果区不再是空白一片（QQ 上游实测要几十秒） */
          <div className="online-skel" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div className="sk-row" key={i} style={{ "--i": i } as React.CSSProperties}>
                <span className="sk-bar t" />
                <span className="sk-bar a" />
                <span className="sk-bar d" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {rows.map((track) => (
              <div
                key={track.sourceId}
                className="lib-row online-row"
                role="button"
                tabIndex={0}
                onClick={() => void play(track)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  void play(track);
                }}
                title={`${track.title} — ${track.artist}`}
              >
                <span className="row-cover">
                  {track.coverUrl ? (
                    <img src={track.coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                  ) : (
                    <i aria-hidden="true" />
                  )}
                </span>
                <span className="lib-title">
                  {currentSource?.canDownload ? (
                    <input
                      type="checkbox"
                      className="online-pick"
                      checked={selected.has(track.sourceId)}
                      aria-label={`选择 ${track.title}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggle(track.sourceId)}
                    />
                  ) : null}
                  {track.title}
                </span>
                <span className="lib-artist">{track.artist}</span>
                <span className="lib-artist">{track.album}</span>
                <span className="lib-dur">{fmtDuration(track.durationMs)}</span>
                {currentSource?.canDownload ? (
                  <button
                    type="button"
                    className="dl-btn"
                    title="下载到本地"
                    onClick={(e) => {
                      e.stopPropagation();
                      void download(track);
                    }}
                  >
                    下载
                  </button>
                ) : null}
              </div>
            ))}
            {rows.length === 0 && !note ? (
              <p className="lib-empty lib-empty--inline">用顶栏的搜索框搜歌，结果会落在这里。</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
