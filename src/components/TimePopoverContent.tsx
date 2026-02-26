import { Grid, Text } from "@radix-ui/themes";
import styles from "./timePopoverContent.module.css";
import { formatTimeNanos, getDateTimeFromNanos } from "../utils";
import { useMemo } from "react";
import { useRelativeTime } from "../hooks/useRelativeTime";

interface TimePopoverContentProps {
  nanoTs: bigint;
  units: "seconds" | "milliseconds" | "nanoseconds";
}

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function TimePopoverContent({ nanoTs, units }: TimePopoverContentProps) {
  const dateTime = useMemo(() => getDateTimeFromNanos(nanoTs), [nanoTs]);
  const relativeTime = useRelativeTime(dateTime);

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
      <Text className={styles.value}>{relativeTime}</Text>

      <Text className={styles.label}>Timestamp</Text>
      <Text className={styles.value}>{values.ts}</Text>
    </Grid>
  );
}
