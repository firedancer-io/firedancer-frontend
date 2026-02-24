import type { DateTime } from "luxon";
import {
  getDurationText,
  slowDateTimeNow,
  type DurationOptions,
} from "../utils";
import { useHarmonicIntervalFn, useUpdate } from "react-use";

export function useRelativeTime(target?: DateTime, options?: DurationOptions) {
  const update = useUpdate();
  useHarmonicIntervalFn(update, 1_000);

  if (!target) return;

  const isInPast = slowDateTimeNow >= target;
  const diffDuration = (
    isInPast ? slowDateTimeNow.diff(target) : target.diff(slowDateTimeNow)
  ).rescale();
  const durationText = getDurationText(diffDuration, options);

  return isInPast ? `${durationText} ago` : durationText;
}
