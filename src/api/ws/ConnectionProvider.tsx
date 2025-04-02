import EventEmitter from "events";
import { useSetAtom } from "jotai";
import { PropsWithChildren, useCallback, useEffect, useState } from "react";
import connectWebSocket from "./connectWebSocket";
import { ConnectionStatus } from "./types";
import { socketStateAtom } from "./atoms";
import UpdateAtoms from "../UpdateAtoms";
import {
  ConnectionContext,
  ConnectionContextType,
  defaultCtxValue,
  messageEventType,
} from "./ConnectionContext";

const VITE_WEBSOCKET_URL = (
  import.meta.env.VITE_WEBSOCKET_URL as string
).trim();

export function ConnectionProvider({ children }: PropsWithChildren) {
  const [ctxValue, _setCtxValue] = useState(defaultCtxValue);
  // connect to current host via websocket
  const websocketUrl = VITE_WEBSOCKET_URL
    ? VITE_WEBSOCKET_URL
    : `${window.location.protocol.startsWith("https") ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}/websocket`;

  const setSocketState = useSetAtom(socketStateAtom);

  const updateContext = useCallback(
    (newContext: Partial<ConnectionContextType>) => {
      _setCtxValue((state) => {
        if (newContext.emitter && state.emitter !== newContext.emitter) {
          state.emitter.removeAllListeners();
        }

        return { ...state, ...newContext };
      });
    },
    [],
  );

  const resetContext = useCallback(
    () => updateContext(defaultCtxValue),
    [updateContext],
  );

  useEffect(() => {
    if (!websocketUrl) {
      resetContext();
      return;
    }

    const emitter = new EventEmitter().setMaxListeners(1e3);

    const onMessage = (message: unknown) =>
      emitter.emit(messageEventType, message);
    const onConnectionStatusChanged = (connectionStatus: ConnectionStatus) => {
      updateContext({ connectionStatus });
      setSocketState(connectionStatus.socketState);
    };

    const [sendMessage, dispose] = connectWebSocket(
      websocketUrl,
      onMessage,
      onConnectionStatusChanged,
    );

    updateContext({ sendMessage, emitter, isActive: true });

    return () => {
      emitter.removeAllListeners();
      resetContext();
      dispose();
    };
  }, [resetContext, updateContext, setSocketState, websocketUrl]);

  return (
    <ConnectionContext.Provider value={ctxValue}>
      <UpdateAtoms />
      {children}
    </ConnectionContext.Provider>
  );
}
