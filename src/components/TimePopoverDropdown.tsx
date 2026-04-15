import { Button, Flex, Grid, Text } from "@radix-ui/themes";
import styles from "./timePopoverDropdown.module.css";
import { formatTimeNanos, getDateTimeFromNanos } from "../utils";
import { useMemo } from "react";
import { useRelativeTime } from "../hooks/useRelativeTime";
import PopoverDropdown from "./PopoverDropdown";
import clsx from "clsx";
import MonoText from "./MonoText";

interface TimePopoverContentProps {
  nanoTs: bigint;
  lines: string[];
  textClassName?: string;
  triggerClassName?: string;
}

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function TimePopoverDropdown({
  nanoTs,
  lines,
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
          gapX="10px"
          gapY="5px"
          rows="4"
          className={styles.container}
        >
          <Text className={styles.label}>{localTimezone}</Text>
          <MonoText className={styles.value}>{values.local}</MonoText>

          <Text className={styles.label}>UTC</Text>
          <MonoText className={styles.value}>{values.utc}</MonoText>

          <Text className={styles.label}>Relative</Text>
          <MonoText className={styles.value}>{relativeTime}</MonoText>

          <Text className={styles.label}>Timestamp</Text>
          <MonoText className={styles.value}>{values.ts}</MonoText>
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
        <Flex minWidth="0" position="relative">
          <Flex direction="column" minWidth="0" width="100%">
            {lines.map((line, i) => (
              <Text key={i} truncate className={textClassName}>
                {line}
              </Text>
            ))}
          </Flex>

          <Flex
            direction="column"
            aria-hidden="true"
            className={styles.popoverUnderlineOverlay}
          >
            {lines.map((line, i) => (
              <Text
                key={i}
                truncate
                className={clsx(textClassName, styles.popoverTextUnderline)}
              >
                {line}
              </Text>
            ))}
          </Flex>
        </Flex>
      </Button>
    </PopoverDropdown>
  );
}
