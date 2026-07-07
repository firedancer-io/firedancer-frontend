import { Flex, Tooltip, Text } from "@radix-ui/themes";
import { clamp } from "lodash";
import styles from "./usage.module.css";
import { getSafePct } from "../../../utils";
import type { PropsWithChildren } from "react";
import {
  accountsCacheClassLowWaterColor,
  accountsCacheClassTargetColor,
} from "../../../colors";
import clsx from "clsx";

function fmtPct(pct: number) {
  return `${pct.toFixed(2)}%`;
}

interface UsageProps {
  usedSlots: number;
  maxSlots: number;
  targetSlots: number;
  lowWaterSlots: number;
}

export default function Usage({
  usedSlots,
  maxSlots,
  targetSlots,
  lowWaterSlots,
}: UsageProps) {
  const usedPct = getSafePct(usedSlots, maxSlots);
  const lowWaterPct = getSafePct(lowWaterSlots, maxSlots);
  const targetPct = getSafePct(targetSlots, maxSlots);

  const normalFilledPct = clamp(usedPct, 0, targetPct);
  const targetFilledPct = clamp(usedPct, targetPct, lowWaterPct) - targetPct;
  const lowWaterFilledPct = clamp(usedPct, lowWaterPct, 100) - lowWaterPct;

  return (
    <UsageTooltip
      targetSlots={targetSlots}
      targetPct={targetPct}
      lowWaterSlots={lowWaterSlots}
      lowWaterPct={lowWaterPct}
    >
      <Flex align="center" gap="8px">
        <Flex position="relative" flexGrow="1">
          <Flex className={styles.targetMarker} left={fmtPct(targetPct)} />
          <Flex className={styles.lowWaterMarker} left={fmtPct(lowWaterPct)} />

          <Flex className={styles.track} flexGrow="1" height="12px">
            <Flex
              width={fmtPct(normalFilledPct)}
              className={styles.normalFilled}
            />
            <Flex
              width={fmtPct(targetPct - normalFilledPct)}
              className={styles.normalEmpty}
            />

            <Flex
              width={fmtPct(targetFilledPct)}
              className={styles.targetFilled}
            />
            <Flex
              width={fmtPct(lowWaterPct - targetPct - targetFilledPct)}
              className={styles.targetEmpty}
            />

            <Flex
              width={fmtPct(lowWaterFilledPct)}
              className={styles.lowWaterFilled}
            />
            <Flex
              width={fmtPct(100 - lowWaterPct - lowWaterFilledPct)}
              className={styles.lowWaterEmpty}
            />
          </Flex>
        </Flex>

        <Text
          className={clsx(
            styles.usageText,
            usedPct > lowWaterPct
              ? styles.lowWaterHit
              : usedPct > targetPct
                ? styles.targetHit
                : undefined,
          )}
        >
          {Math.round(usedPct)}%
        </Text>
      </Flex>
    </UsageTooltip>
  );
}

interface UsageTooltipProps {
  targetSlots: number;
  targetPct: number;
  lowWaterSlots: number;
  lowWaterPct: number;
}

function UsageTooltip({
  targetSlots,
  targetPct,
  lowWaterSlots,
  lowWaterPct,
  children,
}: PropsWithChildren<UsageTooltipProps>) {
  return (
    <Tooltip
      content={
        <Flex direction="column" gap="2px">
          <Text style={{ color: accountsCacheClassTargetColor }}>
            Target: {targetSlots.toLocaleString()} slots ({fmtPct(targetPct)})
          </Text>
          <Text style={{ color: accountsCacheClassLowWaterColor }}>
            Low water: {lowWaterSlots.toLocaleString()} slots (
            {fmtPct(lowWaterPct)})
          </Text>
        </Flex>
      }
      side="right"
    >
      {children}
    </Tooltip>
  );
}
