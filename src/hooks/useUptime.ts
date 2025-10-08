import { useAtomValue } from "jotai";
import { startupTimeAtom } from "../api/atoms";
import { DateTime } from "luxon";
import { useUpdate, useInterval } from "react-use";
import { slowDateTimeNow } from "../utils";

export function useUptimeDuration(updateIntervalMs: number) {
  const startupTime = useAtomValue(startupTimeAtom);

  const update = useUpdate();
  useInterval(update, updateIntervalMs);

  if (!startupTime) return;

  return slowDateTimeNow
    .diff(
      DateTime.fromMillis(
        Math.trunc(Number(startupTime.startupTimeNanos) / 1_000_000),
      ),
    )
    .rescale();
}
