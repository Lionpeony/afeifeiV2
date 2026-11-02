/** 纯类型。main 与 renderer 共用，任何一侧都不许在这里放实现。 */

export type TrackId = string;

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export interface PlayerState {
  status: PlayerStatus;
  trackId: TrackId | null;
  positionMs: number;
  volume: number;
}

export interface QueueState {
  items: TrackId[];
  cursor: number;
  context: TrackId[];
  history: TrackId[];
}

export interface AppState {
  player: PlayerState;
  queue: QueueState;
}

/** UI 唯一允许对外发出的东西。 */
export type Intent =
  | { type: "player/play"; trackId: TrackId }
  | { type: "player/pause" }
  | { type: "player/seek"; positionMs: number }
  | { type: "player/setVolume"; volume: number };
