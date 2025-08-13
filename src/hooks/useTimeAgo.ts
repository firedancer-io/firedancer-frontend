import { useHarmonicIntervalFn, useUpdate } from "react-use";
import { useSlotQueryPublish } from "./useSlotQuery";
import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { getDurationText, slowDateTimeNow } from "../utils";

export function useTimeAgo(
  slot: number,
  options?: { showSeconds: boolean; showOnlyLargestUnit: boolean },
) {
  const query = useSlotQueryPublish(slot);
  const update = useUpdate();

  useHarmonicIntervalFn(update, 1_000);

  const [slotDateTime, setSlotDateTime] = useState<DateTime>();

  useEffect(() => {
    if (!query.publish?.completed_time_nanos) return;

    setSlotDateTime(
      DateTime.fromMillis(
        Math.trunc(Number(query.publish?.completed_time_nanos) / 1_000_000),
      ),
    );
  }, [query.publish]);

  const getDiffDuration = () => {
    if (!slotDateTime) return;
    return slowDateTimeNow.diff(slotDateTime).rescale();
  };

  const diffDuration = getDiffDuration();

  return {
    slotDateTime,
    timeAgoText: diffDuration
      ? `${getDurationText(diffDuration, options)} ago`
      : undefined,
  };
}
