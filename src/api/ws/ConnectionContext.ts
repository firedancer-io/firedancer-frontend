import EventEmitter from "events";
import { createContext } from "react";
import type { ConnectionStatus, SendMessage } from "./types";
import { SocketState } from "./types";

export const messageEventType = "m";

export interface ConnectionContextType {
  emitter: EventEmitter;
  sendMessage: SendMessage;
  isActive: boolean;
  connectionStatus: ConnectionStatus;
}

export const defaultCtxValue: ConnectionContextType = {
  emitter: new EventEmitter().setMaxListeners(1e3),
  sendMessage(_msg) {
    // noop
  },
  isActive: false,
  connectionStatus: {
    socketState: SocketState.Disconnected,
  },
};

export const ConnectionContext = createContext(defaultCtxValue);
