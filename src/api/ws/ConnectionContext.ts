import EventEmitter from "events";
import { createContext } from "react";
import type { SendMessage } from "./types";
import type TypedEmitter from "typed-emitter";
import type { FromWorkerMessage } from "../worker/types";

export const messageEventType = "m";
export type MessageEmitter = TypedEmitter<{
  [messageEventType]: (msg: FromWorkerMessage) => void;
}>;

export interface ConnectionContextType {
  emitter: MessageEmitter;
  sendMessage: SendMessage;
}

export const defaultCtxValue: ConnectionContextType = {
  emitter: new EventEmitter().setMaxListeners(1e3) as MessageEmitter,
  sendMessage(_msg) {
    // noop
  },
};

export const ConnectionContext = createContext(defaultCtxValue);
