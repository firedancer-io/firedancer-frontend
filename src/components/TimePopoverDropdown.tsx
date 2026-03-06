import { Button, Flex, Grid, Text } from "@radix-ui/themes";
import styles from "./timePopoverDropdown.module.css";
import { formatTimeNanos, getDateTimeFromNanos } from "../utils";
import { useMemo } from "react";
import { useRelativeTime } from "../hooks/useRelativeTime";
import PopoverDropdown from "./PopoverDropdown";
import clsx from "clsx";

interface TimePopoverContentProps {
  nanoTs: bigint;
  text: string;
  textClassName?: string;
  triggerClassName?: string;
}

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function TimePopoverDropdown({
  nanoTs,
  text,
  textClassName,
  triggerClassName,
}: TimePopoverContentProps) {
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

    return {
      local: localTime.inNanos,
      utc: utcTime.inNanos,
      ts: nanoTs.toString(),
    };
  }, [nanoTs]);

  return (
    <PopoverDropdown
      content={
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
      }
      align="start"
    >
      <Button
        variant="ghost"
        className={clsx(styles.popoverTrigger, triggerClassName)}
      >
        {/* text-decoration does not extend under "..." by default, leaving a gap.
            The overlay below uses text-overflow: clip so the underline spans the
            full visible width including where the ellipsis appears. */}
        <Flex flexShrink="1" minWidth="0" position="relative">
          <Text truncate className={textClassName}>
            {text}
          </Text>

          <Text
            truncate
            aria-hidden="true"
            className={clsx(textClassName, styles.popoverTextUnderline)}
          >
            {text}
          </Text>
        </Flex>
      </Button>
    </PopoverDropdown>
  );
}
