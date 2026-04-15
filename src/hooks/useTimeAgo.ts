import { useSlotQueryPublish } from "./useSlotQuery";
import { useMemo } from "react";
import { getDateTimeFromNanos, type DurationOptions } from "../utils";
import { useRelativeTime } from "./useRelativeTime";

export function useTimeAgo(slot: number, options?: DurationOptions) {
  const query = useSlotQueryPublish(slot);

  const slotTimestampNanos = useMemo(
    () => query.publish?.completed_time_nanos ?? undefined,
    [query.publish?.completed_time_nanos],
  );
  const slotDateTime = useMemo(() => {
    if (slotTimestampNanos === undefined) return;
    return getDateTimeFromNanos(slotTimestampNanos);
  }, [slotTimestampNanos]);

  const timeAgoText = useRelativeTime(slotDateTime, options);

  return {
    slotTimestampNanos,
    slotDateTime,
    timeAgoText,
  };
}
