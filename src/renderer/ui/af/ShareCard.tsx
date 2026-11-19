/* 点歌分享：后台的「点歌条」——一张用胶带钉住、递出去的票根。
   功能保持：四个官方端点 + 真实歌曲链接；视觉是 AFEIFEI 的手作后台。 */
import { useState, type JSX } from "react";

import { parseRemoteTrackId } from "../../kernel/index.js";
import { useAf } from "./context.js";
import { IconX } from "./icons.js";
import { Tape } from "./ui.js";
import { packLineCopy } from "./copy.js";

/** 在线曲目的真实分享链接：收卡的人点开就能听到这首歌。认不出的源返回 null。 */
function shareLinkOf(trackId: string): string | null {
  const rid = parseRemoteTrackId(trackId);
  if (!rid) return null;
  if (rid.sourceId === "netease") return `https://music.163.com/song?id=${rid.songId}`;
  if (rid.sourceId === "qq") return `https://y.qq.com/n/ryqq/songDetail/${rid.songId}`;
  return null;
}

/* 平台图标：白色简形（圆底色由 tokens 的平台品牌色给） */
function QQGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.4c3.7 0 6.2 2.8 6.2 6.4 0 .8-.1 1.7-.3 2.4.9 1.1 1.8 2.6 1.8 3.8 0 .8-.5 1.3-1.2 1.3-.5 0-1-.3-1.4-.7-.5 1.7-1.5 3-2.6 3.8l1 2c.1.3 0 .6-.3.8-1 .4-2.1.6-3.2.6s-2.2-.2-3.2-.6c-.3-.2-.4-.5-.3-.8l1-2c-1.1-.8-2.1-2.1-2.6-3.8-.4.4-.9.7-1.4.7-.7 0-1.2-.5-1.2-1.3 0-1.2.9-2.7 1.8-3.8-.2-.7-.3-1.6-.3-2.4 0-3.6 2.5-6.4 6.2-6.4z" />
    </svg>
  );
}
function QZoneGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6l2.7 5.8 6.3.8-4.7 4.4 1.2 6.2-5.5-3.1-5.5 3.1 1.2-6.2L3 9.2l6.3-.8z" />
    </svg>
  );
}
function WeChatGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
      <path d="M9.3 3.6C5.5 3.6 2.5 6.1 2.5 9.2c0 1.8 1 3.3 2.6 4.4l-.7 2.2 2.5-1.3c.6.2 1.2.3 1.9.3-.1-.4-.2-.9-.2-1.3 0-3 2.9-5.4 6.5-5.4h.4c-.7-2.6-3.3-4.5-6.2-4.5z" />
      <path d="M21.5 13.6c0-2.6-2.7-4.7-5.9-4.7s-5.9 2.1-5.9 4.7 2.7 4.7 5.9 4.7c.7 0 1.3-.1 1.9-.3l2.3 1.2-.6-2c1.4-.9 2.3-2.2 2.3-3.6z" />
    </svg>
  );
}
function WeiboGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
      <path d="M10.7 8.8c-4 .4-7.4 3-7.4 6 0 3.2 3.7 5.3 7.6 5.3 4.9 0 8.3-2.7 8.3-5.6 0-2.6-2.9-4.2-6-4.2-.9 0-1.7.1-2.5.3.4-.9 1.1-1.6 1.1-1.6zM10.6 17.9c-2 .2-3.7-.7-3.9-2-.1-1.3 1.3-2.6 3.3-2.8 2-.2 3.7.7 3.9 2 .1 1.3-1.3 2.6-3.3 2.8z" />
      <circle cx="10.6" cy="15.7" r="1.5" />
      <path d="M16.4 3.9c3.1-.7 6.1 1.3 6.8 4.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M16.7 7.6c1.9-.4 3.7.8 4.1 2.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

type ShareApp = { id: "qq" | "qzone" | "wechat" | "weibo"; label: string; glyph(): JSX.Element };

export function ShareCard({ onClose }: { onClose(): void }) {
  const af = useAf();
  const t = af.track;
  const link = shareLinkOf(t.id);
  const [copied, setCopied] = useState(false);

  const copyLink = async (): Promise<void> => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板不可用就算了，卡还在 */
    }
  };

  const openShare = (app: ShareApp): void => {
    if (!link) return;
    if (app.id === "wechat") {
      /* 微信没有桌面网页分享口：复制链接，去微信粘贴（不造假入口） */
      void copyLink();
      af.toast("链接已复制，去微信粘贴给朋友吧");
      return;
    }
    const u = encodeURIComponent(link);
    const text = encodeURIComponent(`「${t.title}」 ${t.artist}`);
    const url =
      app.id === "qq"
        ? `https://connect.qq.com/widget/shareqq/index.html?url=${u}&title=${text}`
        : app.id === "qzone"
          ? `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=${u}&title=${text}`
          : `https://service.weibo.com/share/share.php?url=${u}&title=${text}`;
    af.openExternal(url);
  };

  const apps: ShareApp[] = [
    { id: "qq", label: "QQ 好友", glyph: QQGlyph },
    { id: "qzone", label: "QQ 空间", glyph: QZoneGlyph },
    { id: "wechat", label: "微信", glyph: WeChatGlyph },
    { id: "weibo", label: "新浪微博", glyph: WeiboGlyph },
  ];

  return (
    <div className="share-veil" role="dialog" aria-label="点歌分享" onClick={onClose}>
      <div className="share-card" onClick={(e) => e.stopPropagation()}>
        <Tape style={{ top: -10, left: "50%", marginLeft: -40 }} w={80} rot={-4} />
        <button className="share-card__x" onClick={onClose} title="收起"><IconX size={14} /></button>
        <div className="share-card__eyebrow">BACKSTAGE · SONG MESSAGE</div>
        <div className="share-card__title">点歌分享</div>
        <div className="share-card__track">
          <span className="share-card__song">{t.title}</span>
          <span className="share-card__artist">{t.artist}</span>
        </div>
        <div className="share-card__grid">
          {apps.map((app) => {
            const Glyph = app.glyph;
            const off = !link;
            return (
              <button
                key={app.id}
                className={"share-app" + (off ? " is-off" : "")}
                onClick={() => openShare(app)}
                title={off ? "本地文件没有公开链接" : undefined}
                disabled={off}
              >
                <span className="share-app__disc" style={{ background: `var(--share-${app.id})` }}>
                  <Glyph />
                </span>
                <span className="share-app__label">{app.label}</span>
              </button>
            );
          })}
        </div>
        {link ? (
          <div className="share-card__link">
            <span className="share-card__url">{link}</span>
            <button className={"share-card__copy hand" + (copied ? " is-done" : "")} onClick={() => void copyLink()}>
              {copied ? "抄好了" : "复制链接"}
            </button>
          </div>
        ) : (
          <div className="share-card__none">本地文件没有公开链接，先收藏成诗吧。</div>
        )}
        <div className="share-card__note">{packLineCopy(af.palette, "shareNote")}</div>
      </div>
    </div>
  );
}
