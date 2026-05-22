import type { PropsWithChildren } from "react";
import { useMemo } from "react";
import UpdateAtoms from "../UpdateAtoms";
import type { ConnectionContextType } from "./ConnectionContext";
import { ConnectionContext, defaultCtxValue } from "./ConnectionContext";
import { useWsWorker } from "../worker/useWsWorker";
import { websocketCompress, websocketUrl } from "../consts";

export function ConnectionProvider({ children }: PropsWithChildren) {
  const { sendMessage, postWorkerMessage, emitter } = useWsWorker({
    websocketUrl,
    compress: websocketCompress,
  });

  const ctxValue = useMemo<ConnectionContextType>(
    () => ({ ...defaultCtxValue, sendMessage, postWorkerMessage, emitter }),
    [sendMessage, postWorkerMessage, emitter],
  );

  return (
    <ConnectionContext.Provider value={ctxValue}>
      <UpdateAtoms />
      {children}
    </ConnectionContext.Provider>
  );
}
