import { useEffect, useState } from "react";
import type { RemoteTrack } from "../../../../contracts/capability.js";
import { LoginDialog } from "./LoginDialog.js";

export interface SourceOption {
  id: string;
  name: string;
  canAuth: boolean;
}

export interface OnlineViewProps {
  sources: SourceOption[];
  onSearch(sourceId: string, keyword: string): Promise<{ items: RemoteTrack[]; nextPage?: number }>;
  /** 抛错时由本组件把错误文案显示出来 —— 界面只认人话，不认错误码。 */
  onPlay(sourceId: string, track: RemoteTrack): Promise<void>;
  loginStatus(): Promise<{ loggedIn: boolean; nick: string | null }>;
  startLogin(): Promise<{ key: string; qrImage: string }>;
  pollLogin(key: string): Promise<{ code: number; loggedIn: boolean; message: string }>;
  sendCaptcha(phone: string): Promise<{ ok: boolean; message: string }>;
  loginByCaptcha(phone: string, captcha: string): Promise<{ ok: boolean; message: string }>;
}

const pad = (n: number): string => String(n).padStart(2, "0");

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/**
 * 在线页（M3）：音源选择 + 搜索 + 结果。
 *
 * 音源列表来自注册表，**不写死** —— 加第三家源时这个下拉框自动多一项。
 * 登录走"真实浏览器窗口"而不是扫码接口：后者对请求频率敏感，
 * 多申请几次 key 就会开始返回非标准码（实测 8821，风控按 IP 记）。
 */
export function OnlineView({
  sources,
  onSearch,
  onPlay,
  loginStatus,
  startLogin,
  pollLogin,
  sendCaptcha,
  loginByCaptcha,
}: OnlineViewProps) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<RemoteTrack[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [nick, setNick] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (!sourceId && sources[0]) setSourceId(sources[0].id);
  }, [sources, sourceId]);

  const refreshLogin = (): void => {
    void loginStatus()
      // nick 为 null 表示"登录了但没取到昵称"，用空串区分"未登录"与"已登录无名"
      .then((s) => setNick(s.loggedIn ? (s.nick ?? "") : null))
      .catch(() => setNick(null));
  };

  useEffect(() => {
    refreshLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (): Promise<void> => {
    if (!sourceId) return;
    setBusy(true);
    setNote("");
    try {
      const result = await onSearch(sourceId, keyword);
      setRows(result.items);
      if (result.items.length === 0) setNote("没搜到。换个词试试。");
    } catch (err) {
      setRows([]);
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const play = async (track: RemoteTrack): Promise<void> => {
    setNote("");
    try {
      await onPlay(sourceId, track);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  /** 已登录就不打扰；未登录才弹二维码。 */
  const openLogin = async (): Promise<void> => {
    setNote("");
    try {
      const status = await loginStatus();
      if (status.loggedIn) {
        setNick(status.nick ?? "已登录");
        setNote(`已登录${status.nick ? `：${status.nick}` : ""}，直接点歌就能播。`);
        return;
      }
    } catch {
      /* 查不到状态就当未登录，继续弹二维码 */
    }
    setLoginOpen(true);
  };

  return (
    <section className="library">
      <div className="lib-head">
        <select className="source-pick" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.canAuth ? "" : "（免登录）"}
            </option>
          ))}
        </select>
        <input
          className="search"
          value={keyword}
          placeholder="搜索在线歌曲"
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
        />
        <button type="button" onClick={() => void run()} disabled={busy}>
          {busy ? "搜索中…" : "搜索"}
        </button>
        <button type="button" onClick={() => void openLogin()}>
          {nick === null ? "登录" : nick ? `已登录：${nick}` : "已登录"}
        </button>
        <span className="lib-count">{rows.length > 0 ? `${rows.length} 条` : ""}</span>
      </div>

      {loginOpen ? (
        <LoginDialog
          start={startLogin}
          poll={pollLogin}
          sendCaptcha={sendCaptcha}
          loginByCaptcha={loginByCaptcha}
          onSuccess={() => {
            setLoginOpen(false);
            refreshLogin();
            setNote("登录成功，直接点歌就能播。");
          }}
          onClose={() => setLoginOpen(false)}
        />
      ) : null}

      {note ? <p className="lib-note">{note}</p> : null}

      <div className="lib-list">
        {rows.map((track) => (
          <div
            key={track.sourceId}
            className="lib-row online-row"
            onClick={() => void play(track)}
            title={`${track.title} — ${track.artist}`}
          >
            <span className="lib-title">{track.title}</span>
            <span className="lib-artist">{track.artist}</span>
            <span className="lib-artist">{track.album}</span>
            <span className="lib-dur">{fmtDuration(track.durationMs)}</span>
          </div>
        ))}
        {rows.length === 0 && !note ? <p className="lib-empty">选一个音源，输入关键词搜索。</p> : null}
      </div>
    </section>
  );
}
