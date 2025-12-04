import { useCallback, useEffect } from "react";
import { useWebSocketSend } from "../api/ws/utils";

export default function useSlotRankings(mine: boolean = false) {
  const wsSend = useWebSocketSend();

  const queryRankings = useCallback(
    () =>
      wsSend({
        topic: "slot",
        key: "query_rankings",
        id: 32,
        params: { mine },
      }),
    [mine, wsSend],
  );

  useEffect(() => {
    queryRankings();
    const intervalId = setInterval(queryRankings, 5_000);
    return () => clearInterval(intervalId);
  }, [queryRankings]);
}
