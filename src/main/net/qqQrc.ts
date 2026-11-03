/**
 * QQ 音乐 QRC 逐字歌词：取数 + 解密（M9-7）。
 *
 * 取数：musicu.fcg `GetPlayLyricInfo`（crypt:1, qrc:1），匿名可读（2026-11-03 实测：
 * 晴天 code 0 回 9808 字符 hex 密文；部分歌 req.code=24001 = 无 QRC，调用方走 LRC 兜底）。
 * 解密：hex → 3DES-ECB（固定密钥）→ zlib inflate → QRC 文本。
 *
 * 3DES 用的是**非标准 DES 变体**（S2[23]=15、S4[53]=10 两处与标准 DES 不同），
 * 与腾讯原 qrc_decode native 插件二进制一致，**不可换成标准 DES**（node:crypto 解出来是乱码）。
 * 移植自 LX Music 的纯 JS 实现（1:1 对应原 C++），全部按无符号 32 位处理。
 */
import { inflate, constants } from "node:zlib";

const DES_ENCRYPT = 1;
const DES_DECRYPT = 0;

// prettier-ignore
const sbox = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
  ],
];

// prettier-ignore
const key_rnd_shift = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
// prettier-ignore
const key_perm_c = [
  56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35,
];
// prettier-ignore
const key_perm_d = [
  62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3,
];
// prettier-ignore
const key_compression = [
  13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1, 40, 51, 30, 36, 46,
  54, 29, 39, 50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31,
];

/** 全部以无符号 32 位处理，>>> 0 保证溢出行为与 C++ uint32_t 一致 */
const bitnum = (a: Uint8Array, b: number, c: number): number =>
  (((a[((b / 32) | 0) * 4 + 3 - (((b % 32) / 8) | 0)] >>> (7 - (b % 8))) & 1) << c) >>> 0;

const bitnum_intr = (a: number, b: number, c: number): number => (((a >>> (31 - b)) & 1) << c) >>> 0;

const bitnum_intl = (a: number, b: number, c: number): number =>
  (((((a << b) >>> 0) & 0x80000000) >>> 0) >>> c) >>> 0;

const sbox_bit = (a: number): number => (a & 32) | ((a & 31) >>> 1) | ((a & 1) << 4);

/** 初始置换：返回 [s0, s1] */
const initialPermutation = (input: Uint8Array): [number, number] => {
  const s0 = (
    bitnum(input, 57, 31) | bitnum(input, 49, 30) | bitnum(input, 41, 29) | bitnum(input, 33, 28) |
    bitnum(input, 25, 27) | bitnum(input, 17, 26) | bitnum(input, 9, 25) | bitnum(input, 1, 24) |
    bitnum(input, 59, 23) | bitnum(input, 51, 22) | bitnum(input, 43, 21) | bitnum(input, 35, 20) |
    bitnum(input, 27, 19) | bitnum(input, 19, 18) | bitnum(input, 11, 17) | bitnum(input, 3, 16) |
    bitnum(input, 61, 15) | bitnum(input, 53, 14) | bitnum(input, 45, 13) | bitnum(input, 37, 12) |
    bitnum(input, 29, 11) | bitnum(input, 21, 10) | bitnum(input, 13, 9) | bitnum(input, 5, 8) |
    bitnum(input, 63, 7) | bitnum(input, 55, 6) | bitnum(input, 47, 5) | bitnum(input, 39, 4) |
    bitnum(input, 31, 3) | bitnum(input, 23, 2) | bitnum(input, 15, 1) | bitnum(input, 7, 0)
  ) >>> 0;
  const s1 = (
    bitnum(input, 56, 31) | bitnum(input, 48, 30) | bitnum(input, 40, 29) | bitnum(input, 32, 28) |
    bitnum(input, 24, 27) | bitnum(input, 16, 26) | bitnum(input, 8, 25) | bitnum(input, 0, 24) |
    bitnum(input, 58, 23) | bitnum(input, 50, 22) | bitnum(input, 42, 21) | bitnum(input, 34, 20) |
    bitnum(input, 26, 19) | bitnum(input, 18, 18) | bitnum(input, 10, 17) | bitnum(input, 2, 16) |
    bitnum(input, 60, 15) | bitnum(input, 52, 14) | bitnum(input, 44, 13) | bitnum(input, 36, 12) |
    bitnum(input, 28, 11) | bitnum(input, 20, 10) | bitnum(input, 12, 9) | bitnum(input, 4, 8) |
    bitnum(input, 62, 7) | bitnum(input, 54, 6) | bitnum(input, 46, 5) | bitnum(input, 38, 4) |
    bitnum(input, 30, 3) | bitnum(input, 22, 2) | bitnum(input, 14, 1) | bitnum(input, 6, 0)
  ) >>> 0;
  return [s0, s1];
};

/** 逆置换：将 s0/s1 写回 8 字节 out */
const inversePermutation = (s0: number, s1: number, out: Uint8Array): void => {
  out[3] = (bitnum_intr(s1, 7, 7) | bitnum_intr(s0, 7, 6) | bitnum_intr(s1, 15, 5) | bitnum_intr(s0, 15, 4) | bitnum_intr(s1, 23, 3) | bitnum_intr(s0, 23, 2) | bitnum_intr(s1, 31, 1) | bitnum_intr(s0, 31, 0)) & 0xff;
  out[2] = (bitnum_intr(s1, 6, 7) | bitnum_intr(s0, 6, 6) | bitnum_intr(s1, 14, 5) | bitnum_intr(s0, 14, 4) | bitnum_intr(s1, 22, 3) | bitnum_intr(s0, 22, 2) | bitnum_intr(s1, 30, 1) | bitnum_intr(s0, 30, 0)) & 0xff;
  out[1] = (bitnum_intr(s1, 5, 7) | bitnum_intr(s0, 5, 6) | bitnum_intr(s1, 13, 5) | bitnum_intr(s0, 13, 4) | bitnum_intr(s1, 21, 3) | bitnum_intr(s0, 21, 2) | bitnum_intr(s1, 29, 1) | bitnum_intr(s0, 29, 0)) & 0xff;
  out[0] = (bitnum_intr(s1, 4, 7) | bitnum_intr(s0, 4, 6) | bitnum_intr(s1, 12, 5) | bitnum_intr(s0, 12, 4) | bitnum_intr(s1, 20, 3) | bitnum_intr(s0, 20, 2) | bitnum_intr(s1, 28, 1) | bitnum_intr(s0, 28, 0)) & 0xff;
  out[7] = (bitnum_intr(s1, 3, 7) | bitnum_intr(s0, 3, 6) | bitnum_intr(s1, 11, 5) | bitnum_intr(s0, 11, 4) | bitnum_intr(s1, 19, 3) | bitnum_intr(s0, 19, 2) | bitnum_intr(s1, 27, 1) | bitnum_intr(s0, 27, 0)) & 0xff;
  out[6] = (bitnum_intr(s1, 2, 7) | bitnum_intr(s0, 2, 6) | bitnum_intr(s1, 10, 5) | bitnum_intr(s0, 10, 4) | bitnum_intr(s1, 18, 3) | bitnum_intr(s0, 18, 2) | bitnum_intr(s1, 26, 1) | bitnum_intr(s0, 26, 0)) & 0xff;
  out[5] = (bitnum_intr(s1, 1, 7) | bitnum_intr(s0, 1, 6) | bitnum_intr(s1, 9, 5) | bitnum_intr(s0, 9, 4) | bitnum_intr(s1, 17, 3) | bitnum_intr(s0, 17, 2) | bitnum_intr(s1, 25, 1) | bitnum_intr(s0, 25, 0)) & 0xff;
  out[4] = (bitnum_intr(s1, 0, 7) | bitnum_intr(s0, 0, 6) | bitnum_intr(s1, 8, 5) | bitnum_intr(s0, 8, 4) | bitnum_intr(s1, 16, 3) | bitnum_intr(s0, 16, 2) | bitnum_intr(s1, 24, 1) | bitnum_intr(s0, 24, 0)) & 0xff;
};

/** Feistel 轮函数 f(state, key) */
const desF = (state: number, key: Uint8Array): number => {
  const t1 = (
    bitnum_intl(state, 31, 0) | (((state & 0xf0000000) >>> 0) >>> 1) | bitnum_intl(state, 4, 5) |
    bitnum_intl(state, 3, 6) | (((state & 0x0f000000) >>> 0) >>> 3) | bitnum_intl(state, 8, 11) |
    bitnum_intl(state, 7, 12) | (((state & 0x00f00000) >>> 0) >>> 5) | bitnum_intl(state, 12, 17) |
    bitnum_intl(state, 11, 18) | (((state & 0x000f0000) >>> 0) >>> 7) | bitnum_intl(state, 16, 23)
  ) >>> 0;
  const t2 = (
    bitnum_intl(state, 15, 0) | (((state & 0x0000f000) << 15) >>> 0) | bitnum_intl(state, 20, 5) |
    bitnum_intl(state, 19, 6) | (((state & 0x00000f00) << 13) >>> 0) | bitnum_intl(state, 24, 11) |
    bitnum_intl(state, 23, 12) | (((state & 0x000000f0) << 11) >>> 0) | bitnum_intl(state, 28, 17) |
    bitnum_intl(state, 27, 18) | (((state & 0x0000000f) << 9) >>> 0) | bitnum_intl(state, 0, 23)
  ) >>> 0;

  const lrgstate = [
    (t1 >>> 24) & 0xff, (t1 >>> 16) & 0xff, (t1 >>> 8) & 0xff,
    (t2 >>> 24) & 0xff, (t2 >>> 16) & 0xff, (t2 >>> 8) & 0xff,
  ];
  for (let i = 0; i < 6; i += 1) lrgstate[i] = (lrgstate[i] ?? 0) ^ (key[i] ?? 0);

  const s = (
    (sbox[0]![sbox_bit(lrgstate[0]! >>> 2)]! << 28) |
    (sbox[1]![sbox_bit(((lrgstate[0]! & 0x03) << 4) | (lrgstate[1]! >>> 4))]! << 24) |
    (sbox[2]![sbox_bit(((lrgstate[1]! & 0x0f) << 2) | (lrgstate[2]! >>> 6))]! << 20) |
    (sbox[3]![sbox_bit(lrgstate[2]! & 0x3f)]! << 16) |
    (sbox[4]![sbox_bit(lrgstate[3]! >>> 2)]! << 12) |
    (sbox[5]![sbox_bit(((lrgstate[3]! & 0x03) << 4) | (lrgstate[4]! >>> 4))]! << 8) |
    (sbox[6]![sbox_bit(((lrgstate[4]! & 0x0f) << 2) | (lrgstate[5]! >>> 6))]! << 4) |
    sbox[7]![sbox_bit(lrgstate[5]! & 0x3f)]!
  ) >>> 0;

  return (
    bitnum_intl(s, 15, 0) | bitnum_intl(s, 6, 1) | bitnum_intl(s, 19, 2) | bitnum_intl(s, 20, 3) |
    bitnum_intl(s, 28, 4) | bitnum_intl(s, 11, 5) | bitnum_intl(s, 27, 6) | bitnum_intl(s, 16, 7) |
    bitnum_intl(s, 0, 8) | bitnum_intl(s, 14, 9) | bitnum_intl(s, 22, 10) | bitnum_intl(s, 25, 11) |
    bitnum_intl(s, 4, 12) | bitnum_intl(s, 17, 13) | bitnum_intl(s, 30, 14) | bitnum_intl(s, 9, 15) |
    bitnum_intl(s, 1, 16) | bitnum_intl(s, 7, 17) | bitnum_intl(s, 23, 18) | bitnum_intl(s, 13, 19) |
    bitnum_intl(s, 31, 20) | bitnum_intl(s, 26, 21) | bitnum_intl(s, 2, 22) | bitnum_intl(s, 8, 23) |
    bitnum_intl(s, 18, 24) | bitnum_intl(s, 12, 25) | bitnum_intl(s, 29, 26) | bitnum_intl(s, 5, 27) |
    bitnum_intl(s, 21, 28) | bitnum_intl(s, 10, 29) | bitnum_intl(s, 3, 30) | bitnum_intl(s, 24, 31)
  ) >>> 0;
};

/** 单次 DES 加/解密一个 8 字节分组（轮密钥 schedule 为 16x6） */
const desCrypt = (input: Uint8Array, schedule: Uint8Array[], output: Uint8Array): void => {
  let [s0, s1] = initialPermutation(input);
  for (let i = 0; i < 15; i += 1) {
    const prev = s1;
    s1 = (desF(s1, schedule[i]!) ^ s0) >>> 0;
    s0 = prev;
  }
  s0 = (desF(s1, schedule[15]!) ^ s0) >>> 0;
  inversePermutation(s0, s1, output);
};

/** 生成 16 轮子密钥 */
const keySchedule = (key: Uint8Array, mode: number): Uint8Array[] => {
  const schedule = Array.from({ length: 16 }, () => new Uint8Array(6));
  let c = 0;
  let d = 0;
  for (let i = 0; i < 28; i += 1) {
    c = (c | bitnum(key, key_perm_c[i]!, 31 - i)) >>> 0;
    d = (d | bitnum(key, key_perm_d[i]!, 31 - i)) >>> 0;
  }
  for (let i = 0; i < 16; i += 1) {
    c = ((((c << key_rnd_shift[i]!) >>> 0) | (c >>> (28 - key_rnd_shift[i]!))) & 0xfffffff0) >>> 0;
    d = ((((d << key_rnd_shift[i]!) >>> 0) | (d >>> (28 - key_rnd_shift[i]!))) & 0xfffffff0) >>> 0;
    const togen = mode === DES_DECRYPT ? 15 - i : i;
    for (let j = 0; j < 24; j += 1) {
      schedule[togen]![(j / 8) | 0]! |= bitnum_intr(c, key_compression[j]!, 7 - (j % 8));
    }
    for (let j = 24; j < 48; j += 1) {
      schedule[togen]![(j / 8) | 0]! |= bitnum_intr(d, key_compression[j]! - 27, 7 - (j % 8));
    }
  }
  return schedule;
};

/** 3DES（EDE3）密钥编排，返回 3 组 schedule */
const tripleDesKeySetup = (key: Uint8Array, mode: number): Uint8Array[][] => {
  if (mode === DES_ENCRYPT) {
    return [
      keySchedule(key.subarray(0, 8), DES_ENCRYPT),
      keySchedule(key.subarray(8, 16), DES_DECRYPT),
      keySchedule(key.subarray(16, 24), DES_ENCRYPT),
    ];
  }
  return [
    keySchedule(key.subarray(16, 24), DES_DECRYPT),
    keySchedule(key.subarray(8, 16), DES_ENCRYPT),
    keySchedule(key.subarray(0, 8), DES_DECRYPT),
  ];
};

/** 3DES 加/解密一个 8 字节分组 */
const tripleDesCrypt = (input: Uint8Array, schedule: Uint8Array[][], output: Uint8Array): void => {
  const buf = new Uint8Array(8);
  desCrypt(input, schedule[0]!, buf);
  desCrypt(buf, schedule[1]!, output);
  desCrypt(output, schedule[2]!, buf);
  output.set(buf);
};

/** QRC 固定密钥：!@#)(*$%123ZXC!@!@#)(NHL */
const QRC_KEY = Buffer.from([
  0x21, 0x40, 0x23, 0x29, 0x28, 0x2a, 0x24, 0x25, 0x31, 0x32, 0x33, 0x5a,
  0x58, 0x43, 0x21, 0x40, 0x21, 0x40, 0x23, 0x29, 0x28, 0x4e, 0x48, 0x4c,
]);

/** 解密腾讯 QRC 歌词。失败（非 hex/解压失败）返回空串，由调用方走 LRC 兜底。 */
export const decodeQrc = (hexData: string): Promise<string> =>
  new Promise((resolve) => {
    if (!hexData || hexData.length % 2 !== 0) {
      resolve("");
      return;
    }
    const encrypted = Buffer.from(hexData, "hex");
    if (encrypted.length === 0) {
      resolve("");
      return;
    }
    const schedule = tripleDesKeySetup(QRC_KEY, DES_DECRYPT);
    const block = new Uint8Array(8);
    for (let i = 0; i + 8 <= encrypted.length; i += 8) {
      tripleDesCrypt(encrypted.subarray(i, i + 8), schedule, block);
      encrypted.set(block, i);
    }
    // Z_SYNC_FLUSH：容忍尾部不完整的 zlib 流（对应原实现忽略 Z_BUF_ERROR）
    inflate(encrypted, { finishFlush: constants.Z_SYNC_FLUSH }, (err, result) => {
      resolve(err ? "" : result.toString("utf8"));
    });
  });

interface QrcFetchResult {
  /** 解密后的 QRC 文本（可能带 LyricContent=" 包壳）；空 = 没有 QRC */
  qrc: string;
  /** base64 解码后的 LRC 翻译；空 = 没有 */
  trans: string;
}

/** QQ 音乐 GetPlayLyricInfo（匿名）：songMID 直查，回 hex 密文。 */
export const fetchQqQrc = async (songmid: string): Promise<QrcFetchResult> => {
  const r = await fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://y.qq.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36",
    },
    body: JSON.stringify({
      comm: { ct: 19, cv: 1873, uin: 0 },
      req: {
        method: "GetPlayLyricInfo",
        module: "music.musichallSong.PlayLyricInfo",
        param: {
          songMID: songmid,
          songName: "",
          singerName: "",
          albumName: "",
          interval: 0,
          format: "json",
          crypt: 1,
          ct: 19,
          cv: 1873,
          lrc_t: 0,
          qrc: 1,
          qrc_t: 0,
          roma: 0,
          roma_t: 0,
          trans: 1,
          trans_t: 0,
          type: -1,
        },
      },
    }),
  });
  const body = (await r.json()) as {
    code?: number;
    req?: { code?: number; data?: { lyric?: string; trans?: string } };
  };
  if (body.code !== 0 || body.req?.code !== 0) return { qrc: "", trans: "" };
  const data = body.req.data ?? {};
  // QRC 明文裹在 XML 里：<Lyric_1 LyricContent="[ti:…]\n[6440,6810]…">，剥壳只留歌词本体
  const raw = typeof data.lyric === "string" ? await decodeQrc(data.lyric) : "";
  const inner = /LyricContent="([\s\S]*?)"\s*\/>/.exec(raw);
  const qrc = inner ? inner[1] : raw;
  let trans = "";
  if (typeof data.trans === "string" && data.trans) {
    try {
      // 上游 trans 是 base64 UTF-8；解不出时间轴就是密文/乱码，丢弃
      const decoded = Buffer.from(data.trans, "base64").toString("utf8");
      if (/\[\d{1,3}:\d{2}/.test(decoded)) trans = decoded;
    } catch {
      trans = "";
    }
  }
  return { qrc, trans };
};
