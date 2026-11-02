/**
 * 远端音频 → appstream 代理地址。
 *
 * 为什么必须有这层：跨源 http 直链（QQ/网易云 CDN）没有 CORS 头，
 * 直接喂 <audio> 再进 MediaElementSource（EQ/频谱图）会被 Chromium
 * 消成静音——「进度条在走但没声音」。appstream 是主进程的特权协议，
 * 由它转发流（见 main/media/protocol.ts），没有跨源问题。
 *
 * 编码格式：`appstream://<hex(utf8(远端地址))>`。URL host 会被转小写，
 * base64url 大小写敏感会损坏；hex 全小写安全。主进程的解码端改格式两边一起改。
 */
export function streamSrcOf(remote: string): string {
  const hex = Array.from(new TextEncoder().encode(remote))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `appstream://${hex}`;
}
