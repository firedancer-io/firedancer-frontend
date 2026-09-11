import { useCallback } from "react";
import { useWebSocketSend } from "../../../api/ws/utils";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { requestTxnMetaRange } from "./txnMetaCache";

export default function useTxnMetaQuery() {
  const wsSend = useWebSocketSend();

  return useCallback(
    (visibleRangeNs: NsTsRange, worldEndNs: bigint) => {
      requestTxnMetaRange(wsSend, visibleRangeNs, worldEndNs);
    },
    [wsSend],
  );
}
