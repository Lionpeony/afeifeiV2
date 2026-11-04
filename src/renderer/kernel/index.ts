/**
 * 环 0 的公开出口。外层（domain / ui）只准 import 这个文件，
 * 不准直接 import ./store.js —— 出口只有一个，写入口才收得住。
 */
export { getState, subscribe, dispatch, sanitizeLyricOffsets, sanitizePlaybackConfig } from "./store.js";
/**
 * 队列纯函数也从这里出：UI 要按**播放序**显示「接下来」
 * （shuffle 是投影，显示的必须是真会播的那几首），但不能直接摸 store.js。
 */
export { dropTargetIndex, orderOf, positionOf, stepForward } from "./queue.js";
/** 失败自愈的决策层（纯函数，P0-14）。判定与调度分开：这里只算"该干什么"。 */
export { decideFailure, type FailureDecision } from "./failure.js";
