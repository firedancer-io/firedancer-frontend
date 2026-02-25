import { useHarmonicIntervalFn, useUpdate } from "react-use";
import { useSlotQueryPublish } from "./useSlotQuery";
import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import type { DurationOptions } from "../utils";
import { getDurationText, slowDateTimeNow } from "../utils";

export function useTimeAgo(slot: number, options?: DurationOptions) {
  const query = useSlotQueryPublish(slot);
  const update = useUpdate();

  useHarmonicIntervalFn(update, 1_000);

  const [slotTimestamp, setSlotTimestamp] = useState<bigint>();
  const [slotDateTime, setSlotDateTime] = useState<DateTime>();

  useEffect(() => {
    if (!query.publish?.completed_time_nanos) {
      setSlotTimestamp(undefined);
      setSlotDateTime(undefined);
      return;
    }

    setSlotTimestamp(query.publish.completed_time_nanos);
    setSlotDateTime(
      DateTime.fromMillis(
        Math.trunc(Number(query.publish.completed_time_nanos / 1_000_000n)),
      ),
    );
  }, [query.publish]);

  const getDiffDuration = () => {
    if (!slotDateTime) return;
    return slowDateTimeNow.diff(slotDateTime).rescale();
  };

  const diffDuration = getDiffDuration();

  return {
    slotTimestamp,
    slotDateTime,
    timeAgoText: diffDuration
      ? `${getDurationText(diffDuration, options)} ago`
      : undefined,
  };
}
