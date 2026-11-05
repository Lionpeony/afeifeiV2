import { useEffect, useMemo, useState } from "react";
import type { Track } from "../../domain/library/schema.js";
import { getTracks, subscribe } from "../../domain/library/state.js";
import {
  buildDailySchedule,
  startOfBroadcastDay,
  type Schedule,
} from "../../domain/station/schedule.js";
import { buildBroadcast, type Broadcast } from "../../projection/broadcast.js";
import { onTick } from "../compositor.js";

/**
 * 不夜台的数据接驳（Ring 4）。
 *
 * 墙钟只在这里读，且每秒最多提交一次 —— 直播时码的粒度是秒，
 * 没必要让 60 帧都触发 React。onTick 只是"心跳"，时间本身仍以 Date.now 为准：
 * 暂停播放时节目带照常走，因为电台没停。
 */

export function useNowSecond(): number {
  const [second, setSecond] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(
    () =>
      onTick(() => {
        const s = Math.floor(Date.now() / 1000);
        setSecond((prev) => (prev === s ? prev : s));
      }),
    [],
  );
  return second;
}

export interface StationState {
  nowMs: number;
  schedule: Schedule;
  cast: Broadcast;
  /** 曲库有没有歌：空曲库就是空台，不造节目 */
  ready: boolean;
}

export function useStation(): StationState {
  const [tracks, setTracks] = useState<Track[]>(() => getTracks());
  const second = useNowSecond();
  useEffect(() => subscribe(() => setTracks(getTracks())), []);

  const nowMs = second * 1000;
  const dayStart = startOfBroadcastDay(nowMs);
  // 排台是派生数据：曲库到达时同步算完，别先渲染一帧"有曲库但没节目"的空台。
  const schedule = useMemo(() => buildDailySchedule(tracks, dayStart), [tracks, dayStart]);
  const cast = useMemo(() => buildBroadcast(schedule, nowMs), [schedule, nowMs]);

  return { nowMs, schedule, cast, ready: tracks.length > 0 };
}
