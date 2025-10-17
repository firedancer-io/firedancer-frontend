import { Flex, Text } from "@radix-ui/themes";

import { useAtomValue } from "jotai";
import styles from "./catchingUp.module.css";
import { useMemo } from "react";

import clsx from "clsx";
import { barWidthPx, gapWidthPx, SlotBars } from "./CatchingUpBars";
import { catchingUpDataAtom, turbineBarIndicesAtom } from "../atoms";
import { useMeasure } from "react-use";

export function CatchingUpProgress() {
  const data = useAtomValue(catchingUpDataAtom);
  const turbineBarIndices = useAtomValue(turbineBarIndicesAtom);

  const [turbineStartMeasureRef, { width: turbineStartWidth }] =
    useMeasure<HTMLDivElement>();
  const [turbineHeadMeasureRef, { width: turbineHeadWidth }] =
    useMeasure<HTMLDivElement>();

  const turbineWidths = useMemo(() => {
    if (!turbineBarIndices) return;

    return {
      first: turbineBarIndices.first * (barWidthPx + gapWidthPx),
      latest: turbineBarIndices.latest * (barWidthPx + gapWidthPx) + barWidthPx,
    };
  }, [turbineBarIndices]);

  if (!data) return;

  const {
    startSlot,
    firstTurbineSlot,
    latestTurbineSlot,
    turbineSlots,
    repairSlots,
    latestReplaySlot,
  } = data;

  return (
    <Flex direction="column" gap="5px">
      {turbineBarIndices && turbineWidths && (
        <Flex
          className={styles.labelsRow}
          gap="8px"
          wrap="nowrap"
          minWidth={`${Math.max(turbineStartWidth, turbineHeadWidth)}px`}
          maxWidth="100%"
          // add half of the turbine head label
          width={`${turbineWidths.latest + turbineHeadWidth / 2}px`}
        >
          <Flex
            justify="end"
            gap="8px"
            flexShrink="0"
            // add half of the turbine start label
            width={`${turbineWidths.first + turbineStartWidth / 2}px`}
          >
            <Flex
              justify="center"
              flexGrow="1"
              minWidth="0"
              align="end"
              className={styles.labelsEquation}
            >
              <SlotLabel
                className={styles.replayed}
                value={latestReplaySlot ? latestReplaySlot - startSlot + 1 : 0}
                label=" Slots Replayed"
              />
              <div className={styles.gap} />
              <span> : </span>
              <div className={styles.gap} />

              <Flex gap="2px" align="center" minWidth="0">
                <span>( </span>
                <SlotLabel
                  className={styles.repaired}
                  value={repairSlots.size}
                  label=" Slots Repaired"
                />

                <span> + </span>

                <SlotLabel
                  className={styles.receivedByTurbine}
                  value={turbineSlots.size}
                  label=" Received by Turbine"
                />

                <span>) </span>
              </Flex>
            </Flex>

            <Flex
              ref={turbineStartMeasureRef}
              direction="column"
              className={clsx(styles.turbineLabel, styles.start)}
            >
              <Text className={styles.bold}>Turbine Start</Text>
              <Text>{firstTurbineSlot}</Text>
            </Flex>
          </Flex>

          <Flex justify="end" flexGrow="1" minWidth="0">
            <Flex
              ref={turbineHeadMeasureRef}
              direction="column"
              className={clsx(styles.turbineLabel, styles.head)}
            >
              <Text className={styles.bold}>Turbine Head</Text>
              <Text>{latestTurbineSlot}</Text>
            </Flex>
          </Flex>
        </Flex>
      )}

      <SlotBars />

      {turbineBarIndices && turbineWidths && (
        <Flex gap="4px" width={`${turbineWidths.latest}px`} align="center">
          <Flex
            className={styles.catchingUpBarsFooter}
            gap="4px"
            width={`${turbineWidths.first}px`}
            overflow="hidden"
            flexGrow="0"
            flexShrink="0"
            align="center"
          >
            <Text className={clsx(styles.footerValue, styles.ellipsis)}>
              <span className={styles.secondaryColor}>Slot </span>
              {startSlot}
            </Text>
            <Text className={clsx(styles.footerTitle, styles.ellipsis)}>
              Repair
            </Text>
            <Flex />
          </Flex>
          <Text
            className={clsx(
              styles.catchingUpBarsFooter,
              styles.footerTitle,
              styles.ellipsis,
            )}
          >
            Turbine
          </Text>
        </Flex>
      )}
    </Flex>
  );
}

interface SlotLabelProps {
  value: number;
  label: string;
  className: string;
}
function SlotLabel({ value, label, className }: SlotLabelProps) {
  return (
    <Text className={clsx(className, styles.ellipsis)}>
      <span className={styles.bold}>{value} </span>
      {label}
    </Text>
  );
}
