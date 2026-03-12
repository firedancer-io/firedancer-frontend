import type { PropsWithChildren } from "react";
import { useMemo } from "react";
import UpdateAtoms from "../UpdateAtoms";
import type { ConnectionContextType } from "./ConnectionContext";
import { ConnectionContext, defaultCtxValue } from "./ConnectionContext";
import { useWsWorker } from "../worker/useWsWorker";
import { websocketCompress, websocketUrl } from "../consts";

export function ConnectionProvider({ children }: PropsWithChildren) {
  const { sendMessage, emitter } = useWsWorker({
    websocketUrl,
    compress: websocketCompress,
  });

  const ctxValue = useMemo<ConnectionContextType>(
    () => ({ ...defaultCtxValue, sendMessage, emitter }),
    [sendMessage, emitter],
  );

  return (
    <ConnectionContext.Provider value={ctxValue}>
      <UpdateAtoms />
      {children}
    </ConnectionContext.Provider>
  );
}
