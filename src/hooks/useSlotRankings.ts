import { useWebSocketSend } from "../api/ws/utils";
import { useInterval } from "react-use";

export default function useSlotRankings(mine: boolean = false) {
  const wsSend = useWebSocketSend();

  useInterval(() => {
    wsSend({
      topic: "slot",
      key: "query_rankings",
      id: 32,
      params: { mine },
    });
  }, 5_000);
}
