import type { ToWorkerMessage } from "../worker/types";

export type SendMessage = (message: unknown) => void;
export type PostWorkerMessage = (msg: ToWorkerMessage) => void;

export enum SocketState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
}
