import { useContext, useEffect, useRef } from "react";
import { ConnectionStatus, SendMessage } from "./types";
import { ConnectionContext, messageEventType } from "./ConnectionContext";

/**
 * The returned function is referentially stable over the lifetime of ConnectionProvider
 * and can safely be included as a React hook dependency.
 */
export function useWebSocketSend(): SendMessage {
  const { sendMessage } = useContext(ConnectionContext);
  return sendMessage;
}

/**
 * The returned object is changed when the connection status updates but is otherwise
 * referentially stable.
 */
export function useConnectionStatus(): ConnectionStatus {
  const { connectionStatus } = useContext(ConnectionContext);
  return connectionStatus;
}

/**
 * The `onMessage` callback does not need to be memoized.
 */
export function useServerMessages(onMessage: (message: unknown) => void) {
  const { emitter } = useContext(ConnectionContext);

  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const cb = (message: unknown) => onMessageRef.current(message);
    emitter.addListener(messageEventType, cb);
    return () => {
      emitter.removeListener(messageEventType, cb);
    };
  }, [emitter]);
}
