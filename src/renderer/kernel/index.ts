/**
 * 环 0 的公开出口。外层（domain / ui）只准 import 这个文件，
 * 不准直接 import ./store.js —— 出口只有一个，写入口才收得住。
 */
export { getState, subscribe, dispatch } from "./store.js";
