import { useSlotQueryPublish } from "./useSlotQuery";
import { useEffect, useMemo, useState } from "react";
import { getDateTimeFromNanos, type DurationOptions } from "../utils";
import { useRelativeTime } from "./useRelativeTime";

export function useTimeAgo(slot: number, options?: DurationOptions) {
  const query = useSlotQueryPublish(slot);

  const [slotTimestampNanos, setSlotTimestampNanos] = useState<bigint>();
  const slotDateTime = useMemo(() => {
    if (slotTimestampNanos === undefined) return;
    return getDateTimeFromNanos(slotTimestampNanos);
  }, [slotTimestampNanos]);

  useEffect(() => {
    if (query.publish?.completed_time_nanos) {
      setSlotTimestampNanos(query.publish.completed_time_nanos);
    } else {
      setSlotTimestampNanos(undefined);
    }
  }, [query.publish]);

  const timeAgoText = useRelativeTime(slotDateTime, options);

  return {
    slotTimestampNanos,
    slotDateTime,
    timeAgoText,
  };
}
