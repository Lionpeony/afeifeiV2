/**
 * folia `machiTuning.ts` 的 v1 shim（原文件是整套装 tuning 归一化系统）。
 * 我们没有 tuning 设置面板：v1 只搬了 konbini 一个场景，「自动」与手动指定都落 konbini。
 * 引入 kowloon / station 时，把 folia 的 normalizeMachiTuning 系统搬过来替换这里。
 */
import type { MachiSceneId, MachiTuning } from './types.js';

export const resolveMachiSceneId = (_tuning: MachiTuning, _seed: string | number): MachiSceneId => 'konbini';
