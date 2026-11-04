/**
 * folia `machi/scenes/index.ts` 的 v1 子集：只注册 konbini（便利店）。
 * kowloon（九龙）/ station（车站）未搬——它们各有 ~120KB 场景代码，等 konbini 跑稳再议。
 */
import type { MachiSceneId } from '../types.js';

import { KONBINI_SCENE } from './konbini/konbiniScene.js';
import type { MachiSceneDefinition } from './types.js';

export const MACHI_SCENES: Record<MachiSceneId, MachiSceneDefinition> = {
  konbini: KONBINI_SCENE,
  station: undefined as never, // 未搬：运行时不会走到（machiTuning 恒返回 konbini）
  kowloon: undefined as never, // 同上
};
