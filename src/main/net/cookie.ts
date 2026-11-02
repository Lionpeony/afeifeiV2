import { session } from "electron";

/**
 * 往 Chromium session 里写一条 cookie。
 *
 * 为什么不自己实现 CookieJar：`net.fetch` 走的是 Chromium 网络栈，
 * 用 session 的 cookie 就等于"浏览器里登录过" —— 扫码成功后 Set-Cookie 自动生效，
 * 我们只需要在需要时补一句基础 cookie。
 */
export async function setSessionCookie(target: string, name: string, value: string): Promise<void> {
  const url = new URL(target);
  await session.defaultSession.cookies.set({
    url: `${url.protocol}//${url.host}/`,
    name,
    value,
    domain: url.hostname,
    path: "/",
    secure: true,
    // 一年：网易云的 MUSIC_U 有效期本身更长，这里取短一点以便自然过期
    expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
  });
}

/** 读回某个域名下的全部 cookie（诊断用，不要拿它做登录判断）。 */
export async function listSessionCookies(target: string): Promise<{ name: string; value: string }[]> {
  const url = new URL(target);
  const list = await session.defaultSession.cookies.get({ domain: url.hostname });
  return list.map((c) => ({ name: c.name, value: c.value }));
}
