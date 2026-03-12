import type { SendMessage } from "./types";
import { useContext, useRef, useEffect } from "react";
import { ConnectionContext, messageEventType } from "./ConnectionContext";
import type { FromWorkerMessage } from "../worker/types";

/**
 * The returned function is referentially stable over the lifetime of ConnectionProvider
 * and can safely be included as a React hook dependency.
 */
export function useWebSocketSend(): SendMessage {
  const { sendMessage } = useContext(ConnectionContext);
  return sendMessage;
}

/**
 * The `onMessage` callback does not need to be memoized.
 */
export function useServerMessages(
  onMessage: (message: FromWorkerMessage) => void,
) {
  const { emitter } = useContext(ConnectionContext);

  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const cb = (message: FromWorkerMessage) => onMessageRef.current(message);
    emitter.addListener(messageEventType, cb);
    return () => {
      emitter.removeListener(messageEventType, cb);
    };
  }, [emitter]);
}
