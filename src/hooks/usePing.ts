import { useInterval } from "react-use";
import { useWebSocketSend } from "../api/ws/utils";

/** Ping on an interval to force ws disconnect detection */
export default function usePingPong() {
  const wsSend = useWebSocketSend();

  useInterval(() => {
    wsSend({
      topic: "summary",
      key: "ping",
      id: 1,
    });
  }, 2_000);
}
