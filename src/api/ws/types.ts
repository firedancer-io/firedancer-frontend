export type ClientMessage = unknown;

export type SendMessage = (message: ClientMessage) => void;

export enum SocketState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
}

export interface ConnectionStatus {
  socketState: SocketState;
}
