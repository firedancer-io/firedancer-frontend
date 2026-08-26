import { createContext } from "react";
import type { SendMessage } from "./types";
import type { FromWorkerMessage } from "../worker/types";
import { MiniEmitter } from "./miniEmitter";

export const messageEventType = "m";
export type MessageEmitter = MiniEmitter<{
  [messageEventType]: [msg: FromWorkerMessage];
  newListener: [type: string];
}>;

export interface ConnectionContextType {
  emitter: MessageEmitter;
  sendMessage: SendMessage;
}

export const defaultCtxValue: ConnectionContextType = {
  emitter: new MiniEmitter(),
  sendMessage(_msg) {
    // noop
  },
};

export const ConnectionContext = createContext(defaultCtxValue);
