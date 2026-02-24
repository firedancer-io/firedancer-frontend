import { Grid, Text } from "@radix-ui/themes";
import styles from "./timePopoverContent.module.css";
import { formatTimeNanos, getDurationText } from "../utils";
import { DateTime } from "luxon";
import { useHarmonicIntervalFn, useUpdate } from "react-use";
import { useMemo } from "react";

interface TimePopoverContentProps {
  nanoTs: bigint;
  units: "seconds" | "milliseconds" | "nanoseconds";
}

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function TimePopoverContent({ nanoTs, units }: TimePopoverContentProps) {
  const millisTimestamp = useMemo(() => Number(nanoTs / 1_000_000n), [nanoTs]);

  const values = useMemo(() => {
    const localTime = formatTimeNanos(nanoTs, {
      timezone: "local",
      showTimezoneName: false,
    });
    const utcTime = formatTimeNanos(nanoTs, {
      timezone: "utc",
      showTimezoneName: false,
    });

    switch (units) {
      case "seconds": {
        return {
          local: localTime.inSeconds,
          utc: utcTime.inSeconds,
          ts: Number(nanoTs / 1_000_000_000n).toString(),
        };
      }
      case "milliseconds": {
        return {
          local: localTime.inMillis,
          utc: utcTime.inMillis,
          ts: Number(nanoTs / 1_000_000n).toString(),
        };
      }
      case "nanoseconds": {
        return {
          local: localTime.inNanos,
          utc: utcTime.inNanos,
          ts: nanoTs.toString(),
        };
      }
    }
  }, [nanoTs, units]);

  return (
    <Grid
      columns="max-content max-content"
      gap="2"
      rows="4"
      className={styles.container}
    >
      <Text className={styles.label}>{localTimezone}</Text>
      <Text className={styles.value}>{values.local}</Text>

      <Text className={styles.label}>UTC</Text>
      <Text className={styles.value}>{values.utc}</Text>

      <Text className={styles.label}>Relative</Text>
      <Text className={styles.value}>
        <RelativeTime millisTs={millisTimestamp} />
      </Text>

      <Text className={styles.label}>Timestamp</Text>
      <Text className={styles.value}>{values.ts}</Text>
    </Grid>
  );
}

interface RelativeTimeProps {
  millisTs: number;
}

function RelativeTime({ millisTs }: RelativeTimeProps) {
  const update = useUpdate();
  useHarmonicIntervalFn(update, 1_000);

  const now = DateTime.now();
  const target = DateTime.fromMillis(millisTs);
  const isInPast = now >= target;
  const diffDuration = (
    isInPast ? now.diff(target) : target.diff(now)
  ).rescale();
  const durationText = getDurationText(diffDuration);
  return isInPast ? `${durationText} ago` : durationText;
}
