export type SendMessage = (message: unknown) => void;

export enum SocketState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
}
