/**
 * folia `src/utils/lyrics/parserCore.ts` 的最小提取（AGPL-3.0，已登记）。
 *
 * 原文件 42.5KB，machi 闭包只用了 `isInterludeLine` 一个函数——
 * 它是 `line.fullText === INTERLUDE_FULL_TEXT` 的一行判断，连同哨兵常量一起照抄。
 * 整搬 parserCore 会带上 formatDetection / ttmlConversion 一整条链，不值得。
 */

export const INTERLUDE_FULL_TEXT = '......';

export const isInterludeLine = (line: Pick<import('./folia-types.js').Line, 'fullText'>): boolean =>
  line.fullText === INTERLUDE_FULL_TEXT;
