import QRCode from "qrcode";

/**
 * 把一段文本画成二维码 dataURL。
 *
 * 为什么放主进程：二维码编码（Reed-Solomon 纠错 + 掩码选择）自己写不现实，
 * 而 qrcode 是 MIT、旧仓库已验证。放主进程是为了不把它打进渲染层 bundle ——
 * 它只在扫码登录那一下用得到，没必要让每次启动都加载。
 */
export async function qrDataUrl(text: string): Promise<string> {
  if (typeof text !== "string" || text.length === 0 || text.length > 2048) {
    throw new Error("二维码内容不合法");
  }
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 280,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
}
